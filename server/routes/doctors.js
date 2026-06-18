const express = require("express");
const router  = express.Router();

const { getDoctors, saveDoctors, getClients } = require("../services/clientStore");
const { createBackupSnapshot } = require("../services/backup");
const { requireAuth, attachPermissions } = require("../middleware/auth");
const { canViewDoctorRegistry, projectDoctorsForViewer } = require("../services/doctorsAccess");
const { pool, withTransaction, getDoctorByName, replaceDoctorClientAssignments } = require("../services/db");
const { syncUserChatAccessByClientPermissions } = require("../services/chatAccessSync");
const { notifyUserChatAccessChanges } = require("../services/messengerAccessNotifications");

// ---------- Doctors Registry ----------

router.get("/doctors", requireAuth(), async (req, res) => {
  try {
    const permissions = await attachPermissions(req);
    // Patients (client roles) must not read the staff doctor registry.
    if (!canViewDoctorRegistry(permissions)) {
      return res.status(403).json({ error: "Недоступно", code: "DOCTORS_REGISTRY_FORBIDDEN" });
    }
    const doctors = await getDoctors();
    // user_id (doctor→login-account link) is admin-only; staff get name+role.
    const isAdmin = !!permissions.isAdmin || req.user?.role === "admin";
    res.json(projectDoctorsForViewer(doctors, isAdmin));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/doctors", requireAuth("admin"), async (req, res) => {
  try {
    const doctors = Array.isArray(req.body) ? req.body : [];
    if (doctors.length < 1 && req.query.confirmEmpty !== "1") {
      return res.status(400).json({
        error: "Пустой список врачей не сохранён автоматически",
        code: "DOCTORS_BULK_EMPTY",
      });
    }
    await createBackupSnapshot("before-doctors-save");
    await saveDoctors(doctors);
    await syncDoctorAssignmentsForAllClients(req.user.id);
    res.json({ ok: true, saved: doctors.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const syncDoctorAssignmentsForAllClients = async (assignedByUserId) => {
  const clients = await getClients();
  for (const client of clients) {
    const doctorNames = [...new Set((client.stages || []).map((stage) => stage.doctor).filter(Boolean))];
    const nextDoctorUserIds = [];
    for (const name of doctorNames) {
      const doctor = await getDoctorByName(name);
      if (doctor?.user_id) nextDoctorUserIds.push(Number(doctor.user_id));
    }
    // Per-client: assignment replacement + chat-access sync commit atomically.
    const syncResults = await withTransaction(async (db) => {
      const touchedUserIds = await replaceDoctorClientAssignments(client.id, nextDoctorUserIds, assignedByUserId || null, db);
      const results = [];
      for (const userId of touchedUserIds) {
        results.push({ userId, syncResult: await syncUserChatAccessByClientPermissions(db, userId) });
      }
      return results;
    });
    for (const { userId, syncResult } of syncResults) {
      await notifyUserChatAccessChanges(pool, userId, syncResult);
    }
  }
};

module.exports = router;
