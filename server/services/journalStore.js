const { pool } = require("./db");

const OPEN_STATUSES = new Set(["open", "in_progress", "waiting_client"]);
const TERMINAL_STATUSES = new Set(["done", "cancelled"]);
const ITEM_TYPES = new Set(["task", "event", "note"]);

const toIntOrNull = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function resolveStageDbId(clientId, stageNum) {
  if (!clientId || stageNum == null || stageNum === "") return null;
  const n = toIntOrNull(stageNum);
  if (!n) return null;
  const res = await pool.query(
    "SELECT id FROM stages WHERE client_id = $1 AND stage_num = $2 LIMIT 1",
    [clientId, n]
  );
  return res.rows[0]?.id ?? null;
}

const toCleanString = (value) => String(value ?? "").trim();

const toDateOrNull = (value) => {
  const raw = toCleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

const toTimeOrNull = (value) => {
  const raw = toCleanString(value);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : null;
};

// pg returns DATE columns as JS Date objects (local midnight); String(date)
// yields "Wed May 28 2026 ..." which is not ISO. Normalize to YYYY-MM-DD.
const toIsoDateString = (value) => {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

const rowToItem = (row, comments = []) => ({
  id: row.id,
  clientId: row.client_id,
  stageId: row.stage_num != null ? Number(row.stage_num) : null,
  type: row.type,
  title: row.title,
  description: row.description,
  status: row.status,
  dueDate: toIsoDateString(row.due_date),
  dueTime: row.due_time ? String(row.due_time).slice(0, 5) : "",
  assigneeUserId: row.assignee_user_id,
  isTeamTask: !!row.is_team_task,
  priority: row.priority,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  metadata: row.metadata_json && typeof row.metadata_json === "object" && !Array.isArray(row.metadata_json) ? row.metadata_json : {},
  comments,
});

const rowToComment = (row) => ({
  id: row.id,
  journalItemId: row.journal_item_id,
  authorUserId: row.author_user_id,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeItemInput = (payload) => {
  const type = toCleanString(payload.type || "note");
  if (!ITEM_TYPES.has(type)) throw new Error("INVALID_JOURNAL_TYPE");
  const title = toCleanString(payload.title);
  const description = toCleanString(payload.description);
  if (type !== "note" && !title) throw new Error("JOURNAL_TITLE_REQUIRED");
  if (type === "note" && !title && !description) throw new Error("JOURNAL_NOTE_TEXT_REQUIRED");
  const status = type === "note" ? "done" : toCleanString(payload.status || "open");
  if (type !== "note" && !OPEN_STATUSES.has(status) && !TERMINAL_STATUSES.has(status)) throw new Error("INVALID_JOURNAL_STATUS");
  return {
    type,
    title: title || (type === "note" ? "Заметка" : ""),
    description,
    status,
    dueDate: type === "note" ? null : toDateOrNull(payload.dueDate),
    dueTime: type === "note" ? null : toTimeOrNull(payload.dueTime),
    assigneeUserId: toIntOrNull(payload.assigneeUserId),
    isTeamTask: payload.assigneeUserId ? false : payload.isTeamTask !== false,
    priority: toCleanString(payload.priority || "normal"),
    metadata: payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {},
  };
};

async function createJournalItem(payload) {
  const item = normalizeItemInput(payload);
  const dbStageId = await resolveStageDbId(payload.clientId, payload.stageId);
  const res = await pool.query(
    `INSERT INTO journal_items
      (client_id, stage_id, type, title, description, status, due_date, due_time,
       assignee_user_id, is_team_task, priority, created_by, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      payload.clientId,
      dbStageId,
      item.type,
      item.title,
      item.description,
      item.status,
      item.dueDate,
      item.dueTime,
      item.assigneeUserId,
      item.isTeamTask,
      item.priority,
      toIntOrNull(payload.createdBy),
      JSON.stringify(item.metadata),
    ]
  );
  return getJournalItemById(res.rows[0].id);
}

async function listJournalItems(clientId) {
  const itemRes = await pool.query(
    `SELECT ji.*, s.stage_num AS stage_num
     FROM journal_items ji
     LEFT JOIN stages s ON s.id = ji.stage_id
     WHERE ji.client_id = $1 AND ji.deleted_at IS NULL
     ORDER BY ji.created_at DESC, ji.id DESC`,
    [clientId]
  );
  const ids = itemRes.rows.map((row) => row.id);
  const commentsByItem = new Map();
  if (ids.length) {
    const comments = await pool.query(
      "SELECT * FROM journal_comments WHERE journal_item_id = ANY($1::int[]) AND deleted_at IS NULL ORDER BY created_at ASC, id ASC",
      [ids]
    );
    for (const row of comments.rows) {
      if (!commentsByItem.has(row.journal_item_id)) commentsByItem.set(row.journal_item_id, []);
      commentsByItem.get(row.journal_item_id).push(rowToComment(row));
    }
  }
  return itemRes.rows.map((row) => rowToItem(row, commentsByItem.get(row.id) || []));
}

async function countJournalBadgesForUser({ userId, role, today }) {
  const isAdmin = role === "admin";
  const params = [today, userId];
  const accessWhere = isAdmin ? "true" : `(u.all_clients_access = true OR ca.user_id IS NOT NULL)`;
  const res = await pool.query(
    `SELECT ji.client_id, COUNT(*)::int AS n
     FROM journal_items ji
     JOIN users u ON u.id = $2
     LEFT JOIN client_assignments ca ON ca.client_id = ji.client_id AND ca.user_id = $2
     WHERE ji.deleted_at IS NULL
       AND ji.type IN ('task', 'event')
       AND ji.status IN ('open', 'in_progress', 'waiting_client')
       AND ji.due_date IS NOT NULL
       AND ji.due_date <= $1::date
       AND ($3::boolean = true OR ${accessWhere})
       AND (ji.is_team_task = true OR ji.assignee_user_id = $2)
     GROUP BY ji.client_id`,
    [...params, isAdmin]
  );
  return Object.fromEntries(res.rows.map((row) => [row.client_id, row.n]));
}

async function wasJournalNotificationDelivered({ userId, kind, deliveryKey }) {
  const res = await pool.query(
    "SELECT 1 FROM journal_notification_deliveries WHERE user_id = $1 AND kind = $2 AND delivery_key = $3 LIMIT 1",
    [userId, kind, deliveryKey]
  );
  return !!res.rows[0];
}

async function recordJournalNotificationDelivery({ userId, journalItemId = null, kind, deliveryKey }) {
  await pool.query(
    `INSERT INTO journal_notification_deliveries (user_id, journal_item_id, kind, delivery_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, kind, delivery_key) DO NOTHING`,
    [userId, journalItemId, kind, deliveryKey]
  );
}

async function listUsersForJournalDigest(today) {
  const res = await pool.query(
    `SELECT u.id, u.role, COALESCE(u.display_name, u.username) AS name, COUNT(ji.id)::int AS due_count
     FROM users u
     JOIN role_sections rs ON rs.section_id='journal'
     JOIN roles r ON r.name = u.role AND r.id = rs.role_id
     JOIN journal_items ji ON ji.deleted_at IS NULL
       AND ji.type IN ('task','event')
       AND ji.status IN ('open','in_progress','waiting_client')
       AND ji.due_date IS NOT NULL
       AND ji.due_date <= $1::date
       AND (ji.is_team_task = true OR ji.assignee_user_id = u.id)
     LEFT JOIN client_assignments ca ON ca.client_id = ji.client_id AND ca.user_id = u.id
     WHERE u.active = true
       AND (u.role = 'admin' OR rs.can_read = true OR rs.can_write = true)
       AND (u.role = 'admin' OR u.all_clients_access = true OR ca.user_id IS NOT NULL)
     GROUP BY u.id, u.role, u.display_name, u.username`,
    [today]
  );
  return res.rows;
}

async function listDueJournalReminders(nowIso) {
  const res = await pool.query(
    `SELECT ji.*, u.id AS user_id
     FROM journal_items ji
     JOIN users u ON u.active = true
     LEFT JOIN client_assignments ca ON ca.client_id = ji.client_id AND ca.user_id = u.id
     WHERE ji.deleted_at IS NULL
       AND ji.type IN ('task','event')
       AND ji.status IN ('open','in_progress','waiting_client')
       AND ji.due_date IS NOT NULL
       AND ji.due_date <= $1::date
       AND ji.due_time IS NOT NULL
       AND ((ji.due_date::text || 'T' || ji.due_time::text)::timestamp <= $1::timestamp)
       AND (ji.is_team_task = true OR ji.assignee_user_id = u.id)
       AND (u.role = 'admin' OR u.all_clients_access = true OR ca.user_id IS NOT NULL)`,
    [nowIso]
  );
  return res.rows;
}

async function backfillLegacyJournalEntries() {
  const legacy = await pool.query(
    `SELECT je.*
     FROM journal_entries je
     JOIN stages s ON s.id = je.stage_id
     WHERE NOT EXISTS (
       SELECT 1 FROM journal_items ji
       WHERE (ji.metadata_json ->> 'legacy_journal_entry_id')::int = je.id
     )
     ORDER BY je.id`
  );
  let migrated = 0;
  for (const row of legacy.rows) {
    const metadata = {
      legacy_journal_entry_id: row.id,
      legacy_type: row.type || "",
      legacy_author: row.author || "",
      legacy_date: row.date || "",
    };
    await pool.query(
      `INSERT INTO journal_items
        (client_id, stage_id, type, title, description, status, is_team_task, priority, metadata_json)
       VALUES ($1, $2, 'note', 'Заметка', $3, 'done', true, 'normal', $4)`,
      [row.client_id, row.stage_id, row.text || "", JSON.stringify(metadata)]
    );
    migrated += 1;
  }
  return { migrated };
}

async function getJournalItemById(itemId) {
  const res = await pool.query(
    `SELECT ji.*, s.stage_num AS stage_num
     FROM journal_items ji
     LEFT JOIN stages s ON s.id = ji.stage_id
     WHERE ji.id = $1 AND ji.deleted_at IS NULL`,
    [itemId]
  );
  return res.rows[0] ? rowToItem(res.rows[0]) : null;
}

async function updateJournalItem(itemId, payload) {
  const current = await getJournalItemById(itemId);
  if (!current) return null;
  const merged = normalizeItemInput({ ...current, ...payload, type: current.type });
  const completedAtSql = merged.status === "done" ? "COALESCE(completed_at, now())" : "completed_at";
  const cancelledAtSql = merged.status === "cancelled" ? "COALESCE(cancelled_at, now())" : "cancelled_at";
  // current.stageId is already a stage_num (per rowToItem). Resolve the source stage_num:
  const rawStageNum = Object.prototype.hasOwnProperty.call(payload, "stageId") ? payload.stageId : current.stageId;
  // CRITICAL: match resolveStageDbId's coercion EXACTLY — 0 / null / "" / non-int all mean "no stage" (null),
  // NOT a lookup of stage_num=0 (which the stages table CAN contain, since stage_num defaults to 0).
  const stageNumParam = toIntOrNull(rawStageNum) || null;
  const res = await pool.query(
    `WITH upd AS (
       UPDATE journal_items
       SET title=$2, description=$3, status=$4, due_date=$5, due_time=$6,
           assignee_user_id=$7, is_team_task=$8, priority=$9,
           completed_at=${completedAtSql}, cancelled_at=${cancelledAtSql},
           metadata_json=$10, updated_at=now(),
           stage_id = (SELECT id FROM stages WHERE client_id=$11 AND stage_num=$12 LIMIT 1)
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING *
     )
     SELECT upd.*, s.stage_num AS stage_num
     FROM upd LEFT JOIN stages s ON s.id = upd.stage_id`,
    [itemId, merged.title, merged.description, merged.status, merged.dueDate, merged.dueTime,
     merged.assigneeUserId, merged.isTeamTask, merged.priority, JSON.stringify(merged.metadata),
     current.clientId, stageNumParam]
  );
  return res.rows[0] ? rowToItem(res.rows[0]) : null;
}

async function softDeleteJournalItem(itemId, { deletedBy, reason }) {
  const res = await pool.query(
    "UPDATE journal_items SET deleted_at=now(), deleted_by=$2, delete_reason=$3, updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING *",
    [itemId, toIntOrNull(deletedBy), toCleanString(reason)]
  );
  return !!res.rows[0];
}

async function createJournalComment({ journalItemId, authorUserId, body }) {
  const cleanBody = toCleanString(body);
  if (!cleanBody) throw new Error("JOURNAL_COMMENT_BODY_REQUIRED");
  const res = await pool.query(
    "INSERT INTO journal_comments (journal_item_id, author_user_id, body) VALUES ($1,$2,$3) RETURNING *",
    [toIntOrNull(journalItemId), toIntOrNull(authorUserId), cleanBody]
  );
  return rowToComment(res.rows[0]);
}

module.exports = {
  createJournalItem,
  listJournalItems,
  countJournalBadgesForUser,
  recordJournalNotificationDelivery,
  wasJournalNotificationDelivered,
  backfillLegacyJournalEntries,
  getJournalItemById,
  updateJournalItem,
  softDeleteJournalItem,
  createJournalComment,
  listUsersForJournalDigest,
  listDueJournalReminders,
};
