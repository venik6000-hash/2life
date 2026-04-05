const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { pool, listRoles, insertRole, updateRoleDisplayName, deleteRole,
        getRoleSections, upsertRoleSection, deleteRoleSections,
        getRolePermissions, upsertRolePermission,
        listRefData, insertRefData, updateRefData, deleteRefData, listDistinctAnalyticsMarkers,
        insertDoctor, listDoctors, listClientIdsByDoctorName, upsertClientAssignment } = require("../services/db");

const normalizeAnalyticsKey = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
const toSafeInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const syncDoctorUserAssignments = async ({ doctorName, userId, assignedBy }) => {
  const safeName = String(doctorName || "").trim();
  const safeUserId = toSafeInt(userId);
  if (!safeName || !safeUserId) return;
  const clientIds = await listClientIdsByDoctorName(safeName);
  for (const clientId of clientIds) {
    await upsertClientAssignment(safeUserId, clientId, toSafeInt(assignedBy));
  }
};

// --- Roles ---

// GET /api/admin/roles
router.get("/admin/roles", requireAuth("admin"), async (req, res) => {
  try {
    const roles = await listRoles();
    const result = [];
    for (const r of roles) {
      const sections = await getRoleSections(r.id);
      const permissions = await getRolePermissions(r.id);
      const sectionsObj = {};
      for (const s of sections) sectionsObj[s.section_id] = { read: s.can_read, write: s.can_write };
      const permsObj = {};
      for (const p of permissions) permsObj[p.permission] = p.granted;
      result.push({ id: r.id, name: r.name, displayName: r.display_name, isSystem: r.is_system, sections: sectionsObj, permissions: permsObj });
    }
    res.json({ ok: true, roles: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/roles - create new role
router.post("/admin/roles", requireAuth("admin"), async (req, res) => {
  try {
    const { name, displayName } = req.body || {};
    if (!name || !displayName) return res.status(400).json({ error: "name и displayName обязательны" });
    const safeName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const res2 = await insertRole(safeName, String(displayName).trim(), false);
    const roleId = res2.id;
    const ALL_SECTIONS = ['overview','questionnaire','nutrition','protocol','injections','analytics','lab','journal'];
    const ALL_PERMISSIONS = ['delete_client','create_client','import_data'];
    for (const sec of ALL_SECTIONS) await upsertRoleSection(roleId, sec, true, false);
    for (const perm of ALL_PERMISSIONS) await upsertRolePermission(roleId, perm, false);
    res.json({ ok: true, id: roleId, name: safeName, displayName });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: "Роль с таким именем уже существует" });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/roles/:id - rename display name
router.patch("/admin/roles/:id", requireAuth("admin"), async (req, res) => {
  try {
    const { displayName } = req.body || {};
    if (!displayName) return res.status(400).json({ error: "displayName обязателен" });
    await updateRoleDisplayName(String(displayName).trim(), Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/roles/:id - delete non-system role
router.delete("/admin/roles/:id", requireAuth("admin"), async (req, res) => {
  try {
    const result = await deleteRole(Number(req.params.id));
    if (result.rowCount === 0) return res.status(400).json({ error: "Системную роль нельзя удалить" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/roles/:id/sections - update sections + permissions
router.put("/admin/roles/:id/sections", requireAuth("admin"), async (req, res) => {
  try {
    const roleId = Number(req.params.id);
    const { sections, permissions } = req.body || {};
    if (sections && typeof sections === "object") {
      const existingSections = await getRoleSections(roleId);
      const existingById = {};
      for (const row of existingSections) existingById[row.section_id] = row;

      for (const [secId, perms] of Object.entries(sections)) {
        if (!perms || typeof perms !== "object") continue;
        const prev = existingById[secId];
        const canRead = perms.read === undefined ? !!prev?.can_read : !!perms.read;
        const canWrite = perms.write === undefined ? !!prev?.can_write : !!perms.write;
        await upsertRoleSection(roleId, secId, canRead, canWrite);
      }
    }
    if (permissions) {
      for (const [perm, granted] of Object.entries(permissions)) {
        await upsertRolePermission(roleId, perm, granted ? true : false);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Reference Data ---

// GET /api/admin/analytics-markers (for deficit presets marker search)
router.get("/admin/analytics-markers", requireAuth("admin"), async (req, res) => {
  try {
    const rows = await listDistinctAnalyticsMarkers();
    const items = rows.map((row) => {
      const categoryName = String(row.category_name || "").trim();
      const markerName = String(row.marker_name || "").trim();
      return {
        categoryName,
        markerName,
        key: `${normalizeAnalyticsKey(categoryName)}::${normalizeAnalyticsKey(markerName)}`
      };
    }).filter(item => item.categoryName && item.markerName);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/references?type=deficit_preset (read-only, all authenticated users)
router.get("/references", requireAuth(), async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) return res.status(400).json({ error: "type обязателен" });
    const items = await listRefData(type);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/references?type=deficit_preset
router.get("/admin/references", requireAuth("admin"), async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) return res.status(400).json({ error: "type обязателен" });
    const items = await listRefData(type);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/references
router.post("/admin/references", requireAuth("admin"), async (req, res) => {
  try {
    const { type, value, sort_order = 0 } = req.body || {};
    if (!type || !value) return res.status(400).json({ error: "type и value обязательны" });
    const result = await insertRefData(String(type), String(value).trim(), Number(sort_order));
    res.json({ ok: true, id: result.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/references/:id
router.patch("/admin/references/:id", requireAuth("admin"), async (req, res) => {
  try {
    const { value } = req.body || {};
    if (!value) return res.status(400).json({ error: "value обязателен" });
    const result = await updateRefData(String(value).trim(), Number(req.params.id));
    if (result.rowCount === 0) return res.status(404).json({ error: "Запись не найдена" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/references/:id
router.delete("/admin/references/:id", requireAuth("admin"), async (req, res) => {
  try {
    await deleteRefData(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Doctors (admin CRUD) ---

// GET /api/admin/doctors
router.get("/admin/doctors", requireAuth("admin"), async (req, res) => {
  try {
    const doctors = await listDoctors();
    res.json({ ok: true, doctors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/doctors
router.post("/admin/doctors", requireAuth("admin"), async (req, res) => {
  try {
    const { name, role = "", user_id = null } = req.body || {};
    if (!name) return res.status(400).json({ error: "name обязателен" });
    const doctorName = String(name).trim();
    const linkedUserId = toSafeInt(user_id);
    await insertDoctor(doctorName, String(role).trim(), linkedUserId);
    await syncDoctorUserAssignments({ doctorName, userId: linkedUserId, assignedBy: req.user?.id });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: "Врач с таким именем уже существует" });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/doctors/:id
router.patch("/admin/doctors/:id", requireAuth("admin"), async (req, res) => {
  try {
    const { name, role, user_id } = req.body || {};
    const id = Number(req.params.id);
    const curRes = await pool.query("SELECT id, name, user_id FROM doctors WHERE id = $1", [id]);
    const existing = curRes.rows[0] || null;
    if (!existing) return res.status(404).json({ error: "Врач не найден" });

    const nextName = name != null ? String(name).trim() : String(existing.name || "").trim();
    const nextUserId = user_id !== undefined ? toSafeInt(user_id) : toSafeInt(existing.user_id);

    if (name != null) await pool.query("UPDATE doctors SET name = $1 WHERE id = $2", [nextName, id]);
    if (role != null) await pool.query("UPDATE doctors SET role = $1 WHERE id = $2", [String(role).trim(), id]);
    if (user_id !== undefined) await pool.query("UPDATE doctors SET user_id = $1 WHERE id = $2", [nextUserId, id]);

    await syncDoctorUserAssignments({ doctorName: nextName, userId: nextUserId, assignedBy: req.user?.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/doctors/:id
router.delete("/admin/doctors/:id", requireAuth("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM doctors WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Activity Log ---
router.get("/admin/activity", requireAuth("admin"), async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const r = await pool.query("SELECT * FROM activity_log ORDER BY ts DESC LIMIT $1", [limit]);
    res.json({ ok: true, items: r.rows.map(r => ({
      ts: r.ts, action: r.action, actor: r.actor,
      clientId: r.client_id, clientName: r.client_name,
      stageTitle: r.stage_title,
      details: r.details_json ? JSON.parse(r.details_json) : undefined
    })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Stats ---
router.get("/admin/stats", requireAuth("admin"), async (req, res) => {
  try {
    const clientsCount  = (await pool.query("SELECT COUNT(*) as n FROM clients")).rows[0].n;
    const stagesCount   = (await pool.query("SELECT COUNT(*) as n FROM stages")).rows[0].n;
    const usersCount    = (await pool.query("SELECT COUNT(*) as n FROM users WHERE active = true")).rows[0].n;
    const doctorsCount  = (await pool.query("SELECT COUNT(*) as n FROM doctors")).rows[0].n;
    const lastActivity  = (await pool.query("SELECT ts FROM activity_log ORDER BY ts DESC LIMIT 1")).rows[0];
    res.json({ ok: true, clientsCount: parseInt(clientsCount, 10), stagesCount: parseInt(stagesCount, 10), usersCount: parseInt(usersCount, 10), doctorsCount: parseInt(doctorsCount, 10), lastActivityTs: lastActivity?.ts || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
