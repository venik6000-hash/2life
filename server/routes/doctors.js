const express = require("express");
const router  = express.Router();

const { getDoctors, saveDoctors, getClients } = require("../services/clientStore");
const { createBackupSnapshot } = require("../services/backup");
const { requireAuth } = require("../middleware/auth");
const { pool, getDoctorByName, replaceDoctorClientAssignments } = require("../services/db");
const { syncUserChatAccessByClientPermissions } = require("../services/chatAccessSync");
const { notifyUserChatAccessChanges } = require("../services/messengerAccessNotifications");

// ---------- Doctors Registry ----------

router.get("/doctors", requireAuth(), async (req, res) => {
  try {
    const doctors = await getDoctors();
    res.json(doctors);
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
    const touchedUserIds = await replaceDoctorClientAssignments(client.id, nextDoctorUserIds, assignedByUserId || null);
    for (const userId of touchedUserIds) {
      const syncResult = await syncUserChatAccessByClientPermissions(pool, userId);
      await notifyUserChatAccessChanges(pool, userId, syncResult);
    }
  }
};

module.exports = router;
