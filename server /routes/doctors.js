const express = require("express");
const router  = express.Router();

const { getDoctors, saveDoctors } = require("../services/clientStore");
const { createBackupSnapshot } = require("../services/backup");
const { requireAuth } = require("../middleware/auth");

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
    await createBackupSnapshot("before-doctors-save");
    await saveDoctors(doctors);
    res.json({ ok: true, saved: doctors.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
