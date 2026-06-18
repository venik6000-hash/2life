const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { pool, withTransaction, getRoleById, countUsersByRole, insertRole, updateRoleDisplayName, deleteRole,
        getRoleSections, upsertRoleSection, bumpRoleVersion,
        upsertRolePermission,
        listRefData, insertRefData, updateRefData, deleteRefData, listDistinctAnalyticsMarkers,
        insertDoctor, listDoctors, listClientIdsByDoctorName, upsertClientAssignment, deleteDoctorClientAssignments } = require("../services/db");
const { syncUserChatAccessByClientPermissions } = require("../services/chatAccessSync");
const { notifyUserChatAccessChanges } = require("../services/messengerAccessNotifications");
const { invalidateRoleFlagsCache } = require("../services/roleFlags");
const { invalidatePermissionsCache } = require("../services/permissions");
const { broadcast: sseBroadcast } = require("../services/sse");
const { stripClientRoleDangerousGrants, BLOCKED_CLIENT_SECTIONS, BLOCKED_CLIENT_PERMISSIONS } = require("../services/clientRoleGuard");

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
  // Assignments + chat-access sync commit atomically; notify after commit.
  const syncResult = await withTransaction(async (db) => {
    for (const clientId of clientIds) {
      await upsertClientAssignment(safeUserId, clientId, toSafeInt(assignedBy), "doctor", db);
    }
    return syncUserChatAccessByClientPermissions(db, safeUserId);
  });
  await notifyUserChatAccessChanges(pool, safeUserId, syncResult);
};

const cleanupDoctorUserAssignments = async ({ doctorName, userId }) => {
  const safeName = String(doctorName || "").trim();
  const safeUserId = toSafeInt(userId);
  if (!safeName || !safeUserId) return;
  // Removal + chat-access sync commit atomically; notify after commit.
  const syncResult = await withTransaction(async (db) => {
    await deleteDoctorClientAssignments(safeUserId, safeName, db);
    return syncUserChatAccessByClientPermissions(db, safeUserId);
  });
  await notifyUserChatAccessChanges(pool, safeUserId, syncResult);
};

// --- Roles ---

// GET /api/admin/roles — one JOIN query instead of 1+2N per-role queries.
router.get("/admin/roles", requireAuth("admin"), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT ro.id, ro.name, ro.display_name, ro.is_system, ro.is_client, ro.version,
             rs.section_id, rs.can_read, rs.can_write,
             rp.permission, rp.granted
      FROM roles ro
      LEFT JOIN role_sections rs ON rs.role_id = ro.id
      LEFT JOIN role_permissions rp ON rp.role_id = ro.id
      ORDER BY ro.id
    `);
    // The double LEFT JOIN yields a sections×permissions cross product per
    // role; fold by key (dedupes naturally, same as permissions.js).
    const byId = new Map();
    for (const row of r.rows) {
      let role = byId.get(row.id);
      if (!role) {
        role = { id: row.id, name: row.name, displayName: row.display_name, isSystem: row.is_system, isClient: !!row.is_client, version: row.version ?? 0, sections: {}, permissions: {} };
        byId.set(row.id, role);
      }
      if (row.section_id != null) role.sections[row.section_id] = { read: row.can_read, write: row.can_write };
      if (row.permission != null) role.permissions[row.permission] = row.granted;
    }
    res.json({ ok: true, roles: Array.from(byId.values()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/roles - create new role
router.post("/admin/roles", requireAuth("admin"), async (req, res) => {
  try {
    const { name, displayName, isClient } = req.body || {};
    if (!name || !displayName) return res.status(400).json({ error: "name и displayName обязательны" });
    const safeName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const wantsClient = isClient === true;
    const ALL_SECTIONS = ['overview','questionnaire','nutrition','menu','protocol','injections','analytics','lab','journal','messenger'];
    const ALL_PERMISSIONS = ['delete_client','create_client','import_data'];
    // Role + its sections/permissions are created atomically: a failure rolls back
    // the whole role instead of leaving a half-configured one behind.
    // Client roles start with NO section access (admin opens sections explicitly);
    // staff roles start read-only on everything — except messenger, which staff
    // get with write so messaging works out of the box.
    const roleId = await withTransaction(async (db) => {
      const res2 = await insertRole(safeName, String(displayName).trim(), false, db, wantsClient);
      for (const sec of ALL_SECTIONS) {
        const isMessenger = sec === "messenger";
        await upsertRoleSection(res2.id, sec, !wantsClient, !wantsClient && isMessenger, db);
      }
      for (const perm of ALL_PERMISSIONS) await upsertRolePermission(res2.id, perm, false, db);
      return res2.id;
    });
    invalidateRoleFlagsCache();
    invalidatePermissionsCache();
    res.json({ ok: true, id: roleId, name: safeName, displayName, isClient: wantsClient });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: "Роль с таким именем уже существует" });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/roles/:id - rename display name and/or toggle is_client
router.patch("/admin/roles/:id", requireAuth("admin"), async (req, res) => {
  try {
    const { displayName, isClient } = req.body || {};
    const hasDisplayName = typeof displayName === "string" && displayName.trim();
    const hasIsClient = typeof isClient === "boolean";
    if (!hasDisplayName && !hasIsClient) {
      return res.status(400).json({ error: "displayName или isClient обязателен" });
    }
    const roleId = Number(req.params.id);
    if (hasIsClient) {
      const role = await getRoleById(roleId);
      if (!role) return res.status(404).json({ error: "Роль не найдена" });
      // The admin role is hardcoded to full access — marking it as a client
      // role would be meaningless and confusing.
      if (role.name === "admin") {
        return res.status(400).json({ error: "Роль администратора нельзя сделать клиентской" });
      }
      // Flagging a role as client strips grants it must never hold (journal,
      // action permissions, users' all_clients_access) in one transaction.
      let revokedAllAccessUserIds = [];
      await withTransaction(async (db) => {
        if (isClient) {
          revokedAllAccessUserIds = await stripClientRoleDangerousGrants(db, role);
        }
        // Bump version too: changing is_client changes the effective permissions,
        // so a concurrent sections-save holding a stale version must 409.
        await db.query("UPDATE roles SET is_client = $1, version = version + 1 WHERE id = $2", [isClient, roleId]);
      });
      invalidateRoleFlagsCache();
      invalidatePermissionsCache();
      // Users who lost all_clients_access also lose the derived chat access.
      for (const affectedUserId of revokedAllAccessUserIds) {
        const syncResult = await withTransaction((db) => syncUserChatAccessByClientPermissions(db, affectedUserId));
        await notifyUserChatAccessChanges(pool, affectedUserId, syncResult);
      }
      try { sseBroadcast("permissions-updated", { roleName: role.name }); } catch (_) {}
    }
    if (hasDisplayName) {
      await updateRoleDisplayName(String(displayName).trim(), roleId);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/roles/:id - delete non-system role
router.delete("/admin/roles/:id", requireAuth("admin"), async (req, res) => {
  try {
    const roleId = Number(req.params.id);
    const role = await getRoleById(roleId);
    if (!role) return res.status(404).json({ error: "Роль не найдена" });
    if (role.is_system) return res.status(400).json({ error: "Системную роль нельзя удалить" });
    // Block deletion while users still carry this role — otherwise they'd be left
    // with a non-existent role (no permissions resolve → silently locked out).
    const assigned = await countUsersByRole(role.name);
    if (assigned > 0) {
      return res.status(409).json({
        error: `Роль назначена ${assigned} пользовател${assigned === 1 ? "ю" : "ям"}. Сначала переназначьте их на другую роль.`,
        code: "ROLE_IN_USE",
        assigned
      });
    }
    const result = await deleteRole(roleId);
    if (result.rowCount === 0) return res.status(400).json({ error: "Системную роль нельзя удалить" });
    invalidateRoleFlagsCache();
    invalidatePermissionsCache();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/roles/:id/sections - update sections + permissions
router.put("/admin/roles/:id/sections", requireAuth("admin"), async (req, res) => {
  try {
    const roleId = Number(req.params.id);
    const role = await getRoleById(roleId);
    if (!role) return res.status(404).json({ error: "Роль не найдена" });
    const { sections, permissions, expectedVersion } = req.body || {};
    if (role.is_client) {
      // Hidden in the UI; anything arriving here is a stale tab or a crafted
      // request — refuse rather than silently drop.
      const badSections = Object.keys(sections || {}).filter(
        (sec) => BLOCKED_CLIENT_SECTIONS.has(sec) && (sections[sec]?.read || sections[sec]?.write)
      );
      const badPerms = Object.keys(permissions || {}).filter(
        (perm) => BLOCKED_CLIENT_PERMISSIONS.has(perm) && permissions[perm]
      );
      if (badSections.length || badPerms.length) {
        return res.status(400).json({
          error: "Эти права недоступны клиентской роли",
          code: "CLIENT_ROLE_RESTRICTED",
          badSections,
          badPerms,
        });
      }
    }
    // The optimistic-concurrency guard is MANDATORY: a missing/invalid version
    // must hard-fail rather than silently bump unconditionally (which would
    // re-open the exact lost-update this endpoint closes). A stale pre-deploy tab
    // hits this and the admin just reloads.
    if (!Number.isInteger(expectedVersion)) {
      return res.status(400).json({
        error: "Не передана версия роли. Обновите страницу и повторите.",
        code: "ROLE_VERSION_REQUIRED",
      });
    }
    // Sections + permissions + the version bump are saved atomically (all-or-
    // nothing) so a partial failure can't leave half the checkboxes saved, and so
    // the optimistic-concurrency guard can't bump without the edits landing.
    const VERSION_CONFLICT = Symbol("role_version_conflict");
    let newVersion = null;
    let conflict = false;
    try {
      await withTransaction(async (db) => {
        // Guarded bump first: if another admin saved since this tab loaded the
        // role (expectedVersion stale), abort the whole transaction → 409.
        newVersion = await bumpRoleVersion(db, roleId, expectedVersion);
        if (newVersion === null) { conflict = true; throw VERSION_CONFLICT; }
        if (sections && typeof sections === "object") {
          const existingSections = await getRoleSections(roleId, db);
          const existingById = {};
          for (const row of existingSections) existingById[row.section_id] = row;
          for (const [secId, perms] of Object.entries(sections)) {
            if (!perms || typeof perms !== "object") continue;
            const prev = existingById[secId];
            let canRead = perms.read === undefined ? !!prev?.can_read : !!perms.read;
            const canWrite = perms.write === undefined ? !!prev?.can_write : !!perms.write;
            // Write implies read — never persist write=true with read=false.
            if (canWrite) canRead = true;
            await upsertRoleSection(roleId, secId, canRead, canWrite, db);
          }
        }
        if (permissions) {
          for (const [perm, granted] of Object.entries(permissions)) {
            await upsertRolePermission(roleId, perm, granted ? true : false, db);
          }
        }
      });
    } catch (e) {
      if (e !== VERSION_CONFLICT) throw e;
    }
    if (conflict) {
      const cur = await getRoleById(roleId);
      return res.status(409).json({
        error: "Роль изменена другим администратором. Обновите страницу и повторите.",
        code: "ROLE_VERSION_CONFLICT",
        currentVersion: cur?.version ?? null,
      });
    }
    invalidatePermissionsCache();
    // Live revocation: every open tab of users with this role re-reads perms.
    try { sseBroadcast("permissions-updated", { roleName: role.name }); } catch (_) {}
    res.json({ ok: true, version: newVersion });
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

// GET /api/references (any authenticated user) and /api/admin/references
// (admin-only) share the same body — both routes mount the same handler.
const readRefHandler = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) return res.status(400).json({ error: "type обязателен" });
    const items = await listRefData(type);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
router.get("/references", requireAuth(), readRefHandler);
router.get("/admin/references", requireAuth("admin"), readRefHandler);

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
    const prevName = String(existing.name || "").trim();
    const prevUserId = toSafeInt(existing.user_id);
    const doctorLinkChanged =
      prevUserId &&
      (prevUserId !== nextUserId || prevName.toLowerCase() !== nextName.toLowerCase());

    if (name != null) await pool.query("UPDATE doctors SET name = $1 WHERE id = $2", [nextName, id]);
    if (role != null) await pool.query("UPDATE doctors SET role = $1 WHERE id = $2", [String(role).trim(), id]);
    if (user_id !== undefined) await pool.query("UPDATE doctors SET user_id = $1 WHERE id = $2", [nextUserId, id]);

    if (doctorLinkChanged) {
      await cleanupDoctorUserAssignments({ doctorName: prevName, userId: prevUserId });
    }
    await syncDoctorUserAssignments({ doctorName: nextName, userId: nextUserId, assignedBy: req.user?.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/doctors/:id
router.delete("/admin/doctors/:id", requireAuth("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existingRes = await pool.query("SELECT id, name, user_id FROM doctors WHERE id = $1", [id]);
    const existing = existingRes.rows[0] || null;
    if (!existing) return res.status(404).json({ error: "Врач не найден" });
    await pool.query("DELETE FROM doctors WHERE id = $1", [id]);
    await cleanupDoctorUserAssignments({ doctorName: existing.name, userId: existing.user_id });
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
    const { rows: [stats] } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM clients) AS clients_count,
        (SELECT COUNT(*) FROM stages) AS stages_count,
        (SELECT COUNT(*) FROM users WHERE active = true) AS users_count,
        (SELECT COUNT(*) FROM doctors) AS doctors_count,
        (SELECT ts FROM activity_log ORDER BY ts DESC LIMIT 1) AS last_activity_ts
    `);
    res.json({
      ok: true,
      clientsCount: parseInt(stats.clients_count, 10),
      stagesCount: parseInt(stats.stages_count, 10),
      usersCount: parseInt(stats.users_count, 10),
      doctorsCount: parseInt(stats.doctors_count, 10),
      lastActivityTs: stats.last_activity_ts || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
