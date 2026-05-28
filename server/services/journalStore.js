const { pool, JOURNAL_DEFAULT_TEMPLATE_TITLES } = require("./db");

const OPEN_STATUSES = new Set(["open", "in_progress", "waiting_client"]);
const TERMINAL_STATUSES = new Set(["done", "cancelled"]);
const ITEM_TYPES = new Set(["task", "event", "note"]);

const toIntOrNull = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toCleanString = (value) => String(value ?? "").trim();

const toDateOrNull = (value) => {
  const raw = toCleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

const toTimeOrNull = (value) => {
  const raw = toCleanString(value);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : null;
};

const parseJson = (value, fallback) => {
  try { return JSON.parse(value || ""); } catch (_) { return fallback; }
};

const rowToItem = (row, comments = []) => ({
  id: row.id,
  clientId: row.client_id,
  stageId: row.stage_id,
  type: row.type,
  title: row.title,
  description: row.description,
  status: row.status,
  dueDate: row.due_date ? String(row.due_date).slice(0, 10) : "",
  dueTime: row.due_time ? String(row.due_time).slice(0, 5) : "",
  assigneeUserId: row.assignee_user_id,
  isTeamTask: !!row.is_team_task,
  priority: row.priority,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  sourceTemplateItemId: row.source_template_item_id,
  metadata: parseJson(row.metadata_json, {}),
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
    sourceTemplateItemId: toIntOrNull(payload.sourceTemplateItemId),
    metadata: payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {},
  };
};

async function listJournalTemplateItems({ includeInactive = false } = {}) {
  const res = await pool.query(
    `SELECT * FROM journal_checklist_template_items
     WHERE ($1::boolean = true OR active = true)
     ORDER BY sort_order, id`,
    [!!includeInactive]
  );
  return res.rows.map((row) => ({
    id: row.id,
    title: row.title,
    sortOrder: row.sort_order,
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function createJournalItem(payload) {
  const item = normalizeItemInput(payload);
  const res = await pool.query(
    `INSERT INTO journal_items
      (client_id, stage_id, type, title, description, status, due_date, due_time,
       assignee_user_id, is_team_task, priority, created_by, source_template_item_id, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      payload.clientId,
      toIntOrNull(payload.stageId),
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
      item.sourceTemplateItemId,
      JSON.stringify(item.metadata),
    ]
  );
  return rowToItem(res.rows[0]);
}

async function listJournalItems(clientId) {
  const itemRes = await pool.query(
    "SELECT * FROM journal_items WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC",
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

async function backfillLegacyJournalEntries() {
  const legacy = await pool.query(
    `SELECT je.*
     FROM journal_entries je
     JOIN stages s ON s.id = je.stage_id
     WHERE NOT EXISTS (
       SELECT 1 FROM journal_items ji
       WHERE (ji.metadata_json::jsonb ->> 'legacy_journal_entry_id')::int = je.id
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
  const res = await pool.query("SELECT * FROM journal_items WHERE id = $1 AND deleted_at IS NULL", [itemId]);
  return res.rows[0] ? rowToItem(res.rows[0]) : null;
}

async function updateJournalItem(itemId, payload) {
  const current = await getJournalItemById(itemId);
  if (!current) return null;
  const merged = normalizeItemInput({ ...current, ...payload, type: current.type });
  const completedAtSql = merged.status === "done" ? "COALESCE(completed_at, now())" : "NULL";
  const cancelledAtSql = merged.status === "cancelled" ? "COALESCE(cancelled_at, now())" : "NULL";
  const res = await pool.query(
    `UPDATE journal_items
     SET title=$2, description=$3, status=$4, due_date=$5, due_time=$6,
         assignee_user_id=$7, is_team_task=$8, priority=$9,
         completed_at=${completedAtSql}, cancelled_at=${cancelledAtSql},
         metadata_json=$10, updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING *`,
    [itemId, merged.title, merged.description, merged.status, merged.dueDate, merged.dueTime, merged.assigneeUserId, merged.isTeamTask, merged.priority, JSON.stringify(merged.metadata)]
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

async function upsertJournalTemplateItem({ id, title, sortOrder = 0, active = true }) {
  const cleanTitle = toCleanString(title);
  if (!cleanTitle) throw new Error("JOURNAL_TEMPLATE_TITLE_REQUIRED");
  if (id) {
    const res = await pool.query(
      `UPDATE journal_checklist_template_items
       SET title=$2, sort_order=$3, active=$4, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [toIntOrNull(id), cleanTitle, Number(sortOrder) || 0, !!active]
    );
    return res.rows[0];
  }
  const res = await pool.query(
    `INSERT INTO journal_checklist_template_items (title, sort_order, active)
     VALUES ($1,$2,$3) RETURNING *`,
    [cleanTitle, Number(sortOrder) || 0, !!active]
  );
  return res.rows[0];
}

async function deleteJournalTemplateItem(id) {
  await pool.query("UPDATE journal_checklist_template_items SET active=false, updated_at=now() WHERE id=$1", [toIntOrNull(id)]);
}

async function initializeStageChecklist({ clientId, stageId, createdBy }) {
  const template = await listJournalTemplateItems({ includeInactive: false });
  let created = 0;
  for (const item of template) {
    const exists = await pool.query(
      `SELECT 1 FROM journal_items
       WHERE client_id=$1 AND stage_id=$2 AND source_template_item_id=$3 AND deleted_at IS NULL
       LIMIT 1`,
      [clientId, toIntOrNull(stageId), item.id]
    );
    if (exists.rows[0]) continue;
    await createJournalItem({
      clientId,
      stageId,
      type: "task",
      title: item.title,
      description: "",
      status: "open",
      dueDate: "",
      dueTime: "",
      assigneeUserId: null,
      isTeamTask: true,
      priority: "normal",
      createdBy,
      sourceTemplateItemId: item.id,
      metadata: { checklist: true },
    });
    created += 1;
  }
  return { created };
}

module.exports = {
  JOURNAL_DEFAULT_TEMPLATE_TITLES,
  listJournalTemplateItems,
  upsertJournalTemplateItem,
  deleteJournalTemplateItem,
  initializeStageChecklist,
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
};
