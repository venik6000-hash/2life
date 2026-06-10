const express = require("express");
const router  = express.Router();

const { getClients, getOneClient, getClientsForUser, saveClients, saveOneClient, patchClientLocked, deleteOneClient, saveAnalyticsForClient } = require("../services/clientStore");
const { buildActionLogs, appendActivityLog } = require("../services/logger");
const { createBackupSnapshot } = require("../services/backup");
const { requireAuth, requirePermission, requireSectionWrite, requireAnySectionRead, requireAnySectionWrite } = require("../middleware/auth");
const { getPermissionsForRole } = require("../services/permissions");
const { pool, withTransaction, upsertClientAssignment, deleteClientAssignment, getClientAssignment, getAssignmentsByClient, getAssignmentsByUser, getDoctorByName, hasAllClientsAccess, replaceDoctorClientAssignments } = require("../services/db");
const { syncUserChatAccessByClientPermissions } = require("../services/chatAccessSync");
const { notifyUserChatAccessChanges } = require("../services/messengerAccessNotifications");
const { addConnection, removeConnection, broadcast } = require("../services/sse");
const { canAccessClient } = require("../services/clientAccess");
const {
  CLIENT_OVERVIEW_FIELD_SET,
  STAGE_FIELD_SECTION_MAP,
  STAGE_FIELDS_BY_SECTION,
  PROTECTED_SECTIONS,
  sectionsForClient,
  filterClientForPermissions,
} = require("../services/sectionMap");

// ─── Clients list ────────────────────────────────────────────────────────────

router.get("/clients", requireAuth(), requireAnySectionRead(), async (req, res) => {
  try {
    const clients = await getClientsForUser(req.user.id, req.user.role);
    const permissions = req.rolePermissions || await getPermissionsForRole(req.user?.role);
    // Strip sections the role may not read; clients without "overview" read disappear entirely.
    const visible = clients
      .map((c) => filterClientForPermissions(c, permissions))
      .filter(Boolean);
    res.json(visible);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SSE: подписка на обновления в реальном времени ─────────────────────────
// Браузер открывает это соединение один раз и держит его открытым.
// Когда кто-то сохраняет изменения — сервер сразу шлёт событие всем остальным.

router.get("/events", requireAuth(), requireAnySectionRead(), (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  addConnection(res);
  // Подтверждение подключения
  res.write("event: connected\ndata: {}\n\n");

  // Heartbeat каждые 25с — чтобы соединение не закрылось по таймауту
  const hb = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch (_) { clearInterval(hb); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(hb);
    removeConnection(res);
  });
});

// ─── Single client (for polling / stale-read refresh) ────────────────────────

router.get("/clients/:clientId", requireAuth(), requireAnySectionRead(), async (req, res) => {
  try {
    if (!(await canAccessClient(req.user, req.params.clientId))) {
      return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    }
    const client = await getOneClient(req.params.clientId);
    if (!client) return res.status(404).json({ error: "Клиент не найден" });
    const permissions = req.rolePermissions || await getPermissionsForRole(req.user?.role);
    const visible = filterClientForPermissions(client, permissions);
    if (!visible) return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    res.json(visible);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Bulk save (migration / import / restore) ────────────────────────────────

router.post("/clients", requireAuth("admin"), requirePermission("delete_client"), async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: "Ожидался массив клиентов", code: "BULK_CLIENT_REPLACE_INVALID_BODY" });
    }
    const nextClients = req.body;
    if (nextClients.length < 1) {
      return res.status(400).json({ error: "Пустая полная замена клиентов запрещена", code: "BULK_CLIENT_REPLACE_EMPTY" });
    }
    const prevClients = await getClients();
    const actionEntries = buildActionLogs(prevClients, nextClients, req);
    await createBackupSnapshot("before-save");
    await saveClients(nextClients);
    await syncBulkDoctorAssignments(nextClients, req.user.id);
    await appendActivityLog(actionEntries);
    res.json({ ok: true, saved: nextClients.length, loggedActions: actionEntries.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Granular single-client save ─────────────────────────────────────────────

router.put("/clients/:clientId", requireAuth(), requireAnySectionWrite(), async (req, res) => {
  try {
    const client = req.body;
    if (!client || toStr(client.id) !== req.params.clientId) {
      return res.status(400).json({ error: "ID mismatch" });
    }
    const prev = await getOneClient(client.id);
    if (prev && !(await canAccessClient(req.user, req.params.clientId))) {
      return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    }
    const permissions = req.rolePermissions || await getPermissionsForRole(req.user?.role);
    if (!permissions) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    if (!prev) {
      if (!hasRoleActionPermission(permissions, "create_client")) {
        return res.status(403).json({ error: "Недостаточно прав", code: "PUT_FORBIDDEN_CREATE" });
      }
      // Require write on every section the new client actually populates, not just overview.
      const requiredSections = Array.from(sectionsForClient(client));
      const deniedSections = requiredSections.filter((sectionId) => !hasSectionWritePermission(permissions, sectionId));
      if (deniedSections.length) {
        return res.status(403).json({ error: "Недостаточно прав на создание клиента", code: "PUT_FORBIDDEN_SECTIONS", deniedSections });
      }
    } else {
      const touchedSections = collectTouchedSectionsForPut(prev, client);
      const deniedSections = touchedSections.filter((sectionId) => !hasSectionWritePermission(permissions, sectionId));
      if (deniedSections.length) {
        return res.status(403).json({
          error: "Недостаточно прав для изменения некоторых разделов",
          code: "PUT_FORBIDDEN_SECTIONS",
          deniedSections
        });
      }
    }
    const actionEntries = buildActionLogs(prev ? [prev] : [], [client], req);
    await saveOneClient(client);
    if (!prev && req.user?.id && req.user?.role !== "admin") {
      await upsertClientAssignment(req.user.id, client.id, req.user.id);
    }
    await appendActivityLog(actionEntries);
    await autoAssignDoctors(client.id, req.user.id);
    broadcast("client-updated", { clientId: req.params.clientId }, res);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Granular patch save (field-level merge, concurrent-safe) ────────────────
// Uses SELECT ... FOR UPDATE to serialize concurrent patches to the same client.
// Two staff editing different fields simultaneously will both be applied in order.

router.patch("/clients/:clientId", requireAuth(), requireAnySectionWrite(), async (req, res) => {
  try {
    if (!(await canAccessClient(req.user, req.params.clientId))) {
      return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    }
    const rawOps = Array.isArray(req.body?.ops) ? req.body.ops : [];
    if (!rawOps.length) return res.json({ ok: true, applied: 0 });

    // Validate ops before acquiring the lock
    const ops = [];
    for (let i = 0; i < rawOps.length; i++) {
      const path = normalizePatchPath(rawOps[i]?.path);
      if (!path) throw new Error(`Invalid patch operation at index ${i}: bad path`);
      const type = String(rawOps[i]?.op || "");
      if (type !== "set" && type !== "delete") throw new Error(`Invalid patch operation at index ${i}: bad op`);
      ops.push({ op: type, path, value: rawOps[i]?.value });
    }

    const permissions = req.rolePermissions || await getPermissionsForRole(req.user?.role);
    if (!permissions) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const { unknownPaths, deniedPaths } = collectPatchPermissionViolations(ops, permissions);
    if (unknownPaths.length) {
      return res.status(400).json({
        error: "Запрос содержит неподдерживаемые пути патча",
        code: "PATCH_UNKNOWN_PATHS",
        unknownPaths
      });
    }
    if (deniedPaths.length) {
      return res.status(403).json({
        error: "Недостаточно прав для изменения некоторых полей",
        code: "PATCH_FORBIDDEN_PATHS",
        deniedPaths
      });
    }

    const result = await patchClientLocked(req.params.clientId, (prev) => applyClientPatchOps(prev, ops));
    if (!result) return res.status(404).json({ error: "Клиент не найден" });

    const actionEntries = buildActionLogs([result.prev], [result.next], req);
    await appendActivityLog(actionEntries);
    await autoAssignDoctors(req.params.clientId, req.user.id);
    broadcast("client-updated", { clientId: req.params.clientId }, res);
    res.json({ ok: true, applied: ops.length, loggedActions: actionEntries.length });
  } catch (e) {
    const msg = String(e?.message || "Ошибка патча");
    if (msg.startsWith("Invalid patch")) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// ─── Delete single client ────────────────────────────────────────────────────

router.delete("/clients/:clientId", requireAuth(), requirePermission("delete_client"), async (req, res) => {
  try {
    if (!(await canAccessClient(req.user, req.params.clientId))) {
      return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    }
    const prev = await getOneClient(req.params.clientId);
    if (!prev) return res.status(404).json({ error: "Клиент не найден" });
    await deleteOneClient(req.params.clientId);
    await appendActivityLog(buildActionLogs([prev], [], req));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Analytics (concurrent-safe upsert) ──────────────────────────────────────

router.put("/clients/:clientId/analytics", requireAuth(), requireSectionWrite("analytics"), async (req, res) => {
  try {
    if (!await canAccessClient(req.user, req.params.clientId)) {
      return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    }
    const { categories } = req.body || {};
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: "categories обязательны" });
    }
    await saveAnalyticsForClient(req.params.clientId, categories);
    broadcast("client-updated", { clientId: req.params.clientId }, res);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Client assignments (admin only) ─────────────────────────────────────────

// Список врачей, назначенных на клиента
router.get("/clients/:clientId/assignments", requireAuth("admin"), async (req, res) => {
  try {
    const rows = await getAssignmentsByClient(req.params.clientId);
    res.json({ ok: true, assignments: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Назначить врача на клиента
router.post("/clients/:clientId/assignments", requireAuth("admin"), async (req, res) => {
  try {
    const { userId } = req.body || {};
    const safeUserId = Number(userId);
    if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
      return res.status(400).json({ error: "userId обязателен" });
    }
    // Assignment + chat-access sync commit atomically; notifications go out
    // only after the transaction is committed.
    const syncResult = await withTransaction(async (db) => {
      await upsertClientAssignment(safeUserId, req.params.clientId, req.user.id, "manual", db);
      return syncUserChatAccessByClientPermissions(db, safeUserId);
    });
    await notifyUserChatAccessChanges(pool, safeUserId, syncResult);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Снять врача с клиента
router.delete("/clients/:clientId/assignments/:userId", requireAuth("admin"), async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "Некорректный userId" });
    }
    const assignment = await getClientAssignment(targetUserId, req.params.clientId);
    if (assignment?.assignment_source === "doctor") {
      return res.status(409).json({
        error: "Этот доступ выдан автоматически через врача этапа",
        code: "DOCTOR_DERIVED_ASSIGNMENT"
      });
    }
    // Removal + chat-access sync commit atomically: a failure between them
    // can't leave the removed doctor still holding chat access.
    const syncResult = await withTransaction(async (db) => {
      await deleteClientAssignment(targetUserId, req.params.clientId, db);
      return syncUserChatAccessByClientPermissions(db, targetUserId);
    });
    await notifyUserChatAccessChanges(pool, targetUserId, syncResult);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Список клиентов, назначенных на врача (для admin-панели).
// Лёгкий SELECT id+name — раньше тут собирались ПОЛНЫЕ карточки клиентов
// (этапы, анализы, ревизии) ради двух полей.
router.get("/admin/users/:userId/clients", requireAuth("admin"), async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    if (await hasAllClientsAccess(targetUserId)) {
      const r = await pool.query("SELECT id, name FROM clients ORDER BY id");
      return res.json({ ok: true, clients: r.rows });
    }
    const r = await pool.query(
      `SELECT c.id, c.name
       FROM clients c
       JOIN client_assignments ca ON ca.client_id = c.id AND ca.user_id = $1
       ORDER BY c.id`,
      [targetUserId]
    );
    res.json({ ok: true, clients: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// После сохранения клиента автоматически назначает доступ врачам,
// у которых в таблице doctors указан linked user_id.
const autoAssignDoctors = async (clientId, assignedByUserId) => {
  const client = await getOneClient(clientId);
  if (!client) return;
  const doctorNames = [...new Set((client.stages || []).map(s => s.doctor).filter(Boolean))];
  const nextDoctorUserIds = [];
  for (const name of doctorNames) {
    const doctor = await getDoctorByName(name);
    if (doctor?.user_id) {
      nextDoctorUserIds.push(Number(doctor.user_id));
    }
  }
  // Doctor-assignment replacement + chat-access sync for every touched user
  // commit atomically: a failure rolls back both, so an old doctor can't keep
  // chat access while assignments already point elsewhere. Notifications go
  // out only after commit.
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
};

const syncBulkDoctorAssignments = async (clients, assignedByUserId) => {
  for (const client of clients) {
    if (client?.id) await autoAssignDoctors(client.id, assignedByUserId);
  }
};


const toStr = (v) => (v == null ? "" : String(v));

const ALLOWED_CLIENT_PATCH_ROOTS = new Set([
  "name",
  "shortName",
  "dob",
  "age",
  "sex",
  "avatar",
  "color",
  "stages"
]);

// Section/field maps live in services/sectionMap.js (shared with read-filtering).
const CLIENT_OVERVIEW_FIELDS = CLIENT_OVERVIEW_FIELD_SET;

const isDeepEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a != null && typeof a === "object";
  const bObj = b != null && typeof b === "object";
  if (aObj || bObj) {
    if (!aObj || !bObj) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!isDeepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
};

const hasRoleActionPermission = (permissions, permissionId) => {
  if (!permissions) return false;
  if (permissions.isAdmin) return true;
  if (permissionId === "create_client") return !!permissions.canCreateClient;
  if (permissionId === "delete_client") return !!permissions.canDeleteClient;
  if (permissionId === "import_data") return !!permissions.canImportData;
  return false;
};

const hasSectionWritePermission = (permissions, sectionId) => {
  if (!permissions) return false;
  if (permissions.isAdmin) return true;
  return !!permissions.sections?.[sectionId]?.write;
};

const pathToString = (path = []) => path.reduce((acc, seg) => {
  if (typeof seg === "number") return `${acc}[${seg}]`;
  const key = String(seg);
  return acc ? `${acc}.${key}` : key;
}, "");

const getSectionForPatchPath = (path) => {
  if (!Array.isArray(path) || !path.length) return null;
  const root = String(path[0] || "");
  if (root !== "stages") {
    return CLIENT_OVERVIEW_FIELDS.has(root) ? "overview" : null;
  }
  // Whole-array (["stages"]) and whole-stage (["stages", i]) ops are handled
  // separately in collectPatchPermissionViolations — they touch every section.
  if (path.length <= 2) return null;
  const stageField = String(path[2] || "");
  return STAGE_FIELD_SECTION_MAP[stageField] || null;
};

const collectPatchPermissionViolations = (ops, permissions) => {
  const unknownPaths = [];
  const deniedPaths = [];
  for (const op of ops) {
    const strPath = pathToString(op.path);
    const root = String(op.path?.[0] || "");

    // Replacing/deleting a whole stage object or the whole stages array rewrites
    // ALL sections inside it (questionnaire, nutrition, protocol, …). Setting one
    // stage replaces every field; deleting one drops every field. Either way the
    // caller must hold write on every protected section — this closes the bypass
    // where "overview"-only write could rewrite closed sections via a stage object.
    if (root === "stages" && Array.isArray(op.path) && op.path.length <= 2) {
      for (const sectionId of PROTECTED_SECTIONS) {
        if (!hasSectionWritePermission(permissions, sectionId)) {
          deniedPaths.push({ path: strPath, section: sectionId });
        }
      }
      continue;
    }

    const sectionId = getSectionForPatchPath(op.path);
    if (!sectionId) {
      unknownPaths.push(strPath);
      continue;
    }
    if (!hasSectionWritePermission(permissions, sectionId)) {
      deniedPaths.push({ path: strPath, section: sectionId });
    }
  }
  return { unknownPaths: Array.from(new Set(unknownPaths)), deniedPaths };
};

const collectTouchedSectionsForPut = (prevClient, nextClient) => {
  const touched = new Set();
  if (!prevClient) return ["overview"];

  for (const field of CLIENT_OVERVIEW_FIELDS) {
    if (!isDeepEqual(prevClient?.[field], nextClient?.[field])) touched.add("overview");
  }

  const prevStages = Array.isArray(prevClient?.stages) ? prevClient.stages : [];
  const nextStages = Array.isArray(nextClient?.stages) ? nextClient.stages : [];

  const markAllSections = () => { for (const sectionId of PROTECTED_SECTIONS) touched.add(sectionId); };

  // Adding or removing a stage shifts every section's data — require write on all.
  if (prevStages.length !== nextStages.length) markAllSections();

  const maxLen = Math.max(prevStages.length, nextStages.length);
  for (let i = 0; i < maxLen; i += 1) {
    const prevStage = prevStages[i] || null;
    const nextStage = nextStages[i] || null;
    if (!prevStage || !nextStage) {
      // A stage appearing or disappearing creates/destroys all of its sections.
      markAllSections();
      continue;
    }
    for (const [sectionId, fields] of Object.entries(STAGE_FIELDS_BY_SECTION)) {
      for (const field of fields) {
        if (!isDeepEqual(prevStage[field], nextStage[field])) {
          touched.add(sectionId);
          break;
        }
      }
    }
  }

  return Array.from(touched);
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const isSafePathSegment = (segment) => {
  if (typeof segment === "number") return Number.isInteger(segment) && segment >= 0;
  if (typeof segment !== "string") return false;
  const s = String(segment).trim();
  if (!s) return false;
  if (s === "__proto__" || s === "constructor" || s === "prototype") return false;
  return true;
};

const normalizePatchPath = (rawPath) => {
  if (!Array.isArray(rawPath) || !rawPath.length) return null;
  const normalized = [];
  for (const seg of rawPath) {
    if (!isSafePathSegment(seg)) return null;
    normalized.push(typeof seg === "number" ? seg : String(seg));
  }
  if (!ALLOWED_CLIENT_PATCH_ROOTS.has(String(normalized[0]))) return null;
  return normalized;
};

const applySetPath = (target, path, value) => {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const seg = path[i];
    const nextSeg = path[i + 1];
    if (typeof seg === "number") {
      if (!Array.isArray(cursor)) return false;
      if (cursor[seg] == null || typeof cursor[seg] !== "object") {
        cursor[seg] = typeof nextSeg === "number" ? [] : {};
      }
      cursor = cursor[seg];
      continue;
    }
    if (cursor[seg] == null || typeof cursor[seg] !== "object") {
      cursor[seg] = typeof nextSeg === "number" ? [] : {};
    }
    cursor = cursor[seg];
  }

  const last = path[path.length - 1];
  if (typeof last === "number") {
    if (!Array.isArray(cursor)) return false;
    cursor[last] = value;
    return true;
  }
  cursor[last] = value;
  return true;
};

const applyDeletePath = (target, path) => {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const seg = path[i];
    if (typeof seg === "number") {
      if (!Array.isArray(cursor) || cursor[seg] == null) return true;
      cursor = cursor[seg];
      continue;
    }
    if (cursor[seg] == null || typeof cursor[seg] !== "object") return true;
    cursor = cursor[seg];
  }

  const last = path[path.length - 1];
  if (typeof last === "number") {
    if (!Array.isArray(cursor) || last < 0 || last >= cursor.length) return true;
    cursor.splice(last, 1);
    return true;
  }
  delete cursor[last];
  return true;
};

const applyClientPatchOps = (client, ops) => {
  const next = deepClone(client);
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    const type = String(op?.op || "");
    const path = normalizePatchPath(op?.path);
    if (!path) throw new Error(`Invalid patch operation at index ${i}: bad path`);
    if (type !== "set" && type !== "delete") {
      throw new Error(`Invalid patch operation at index ${i}: bad op`);
    }
    const ok = type === "set"
      ? applySetPath(next, path, op?.value)
      : applyDeletePath(next, path);
    if (!ok) throw new Error(`Invalid patch operation at index ${i}: incompatible path`);
  }
  next.id = client.id;
  return next;
};

module.exports = router;
