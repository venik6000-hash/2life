const express = require("express");
const router  = express.Router();

const { getDoctors, saveDoctors } = require("../services/clientStore");
const { createBackupSnapshot } = require("../services/backup");
const { requireAuth, attachPermissions } = require("../middleware/auth");
const { canViewDoctorRegistry, projectDoctorsForViewer } = require("../services/doctorsAccess");
const { pool, withTransaction, replaceDoctorClientAssignments } = require("../services/db");
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
  // Was: getClients() (a full buildClientsBatch — stages, analytics, journal,
  // revisions for every client) just to read stage.doctor, then getDoctorByName()
  // once per doctor name per client (N+1). Replace both with three flat queries
  // and in-memory maps. Behavior is preserved exactly: same set of clients
  // iterated (so clients whose doctor was removed still get their derived
  // assignments cleared), same case-folded name matching (LOWER(doctor) vs
  // LOWER(doctors.name), user_id NOT NULL) as getDoctorByName, same atomic
  // per-client transaction + post-commit notifications.
  const clientRows = await pool.query("SELECT id FROM clients ORDER BY id");

  // Doctor names per client (case-folded, like getDoctorByName; '' dropped to
  // mirror the old .filter(Boolean)).
  const doctorNamesByClient = new Map();
  const stageRows = await pool.query(
    `SELECT DISTINCT client_id, LOWER(doctor) AS lname
       FROM stages
      WHERE doctor IS NOT NULL AND doctor <> ''`
  );
  for (const row of stageRows.rows) {
    let set = doctorNamesByClient.get(row.client_id);
    if (!set) { set = new Set(); doctorNamesByClient.set(row.client_id, set); }
    set.add(row.lname);
  }

  // One batched name → linked user_id map (replaces the per-name getDoctorByName).
  // ORDER BY id so a case-only-duplicate name resolves deterministically (last
  // wins by id) rather than by arbitrary scan order.
  const doctorRows = await pool.query(
    "SELECT LOWER(name) AS lname, user_id FROM doctors WHERE user_id IS NOT NULL ORDER BY id"
  );
  const userIdByName = new Map(doctorRows.rows.map((r) => [r.lname, Number(r.user_id)]));

  for (const { id: clientId } of clientRows.rows) {
    const names = doctorNamesByClient.get(clientId) || new Set();
    const nextDoctorUserIds = [...new Set(
      [...names].map((n) => userIdByName.get(n)).filter((uid) => Number.isInteger(uid))
    )];
    // Per-client: assignment replacement + chat-access sync commit atomically.
    const syncResults = await withTransaction(async (db) => {
      const touchedUserIds = await replaceDoctorClientAssignments(clientId, nextDoctorUserIds, assignedByUserId || null, db);
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
// Exported for the verify harness (behavior-parity test of the N+1 optimization).
module.exports.syncDoctorAssignmentsForAllClients = syncDoctorAssignmentsForAllClients;
