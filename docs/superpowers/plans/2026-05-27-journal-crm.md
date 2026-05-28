# Journal CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the employee-only cross-stage CRM Journal inside a client card, with tasks, events, notes, comments, stage checklists, client-list badges, and browser push reminders.

**Architecture:** Move Journal from `stages[*].journal` to dedicated server-owned journal tables and API routes. Keep the UI scoped to the selected client, fetch journal data independently from the legacy client payload, and reuse the existing Web Push device infrastructure for reminders.

**Tech Stack:** React 18 + Vite, Node.js + Express, PostgreSQL via `pg`, existing JWT/RBAC middleware, existing service worker/Web Push infrastructure, focused Node verification scripts.

---

## Scope Check

This is one vertical feature, not separate specs. The storage, API, UI, badge counts, and push reminders are coupled by one domain model and one permission boundary: employee-only CRM Journal data for accessible clients.

## File Structure

### Create

- `server/services/journalStore.js` — all Journal SQL reads/writes, validation helpers, checklist initialization, badge counts, notification delivery facts.
- `server/routes/journal.js` — employee Journal API and admin checklist-template API.
- `server/services/journalNotifications.js` — digest/reminder selection and Web Push delivery orchestration.
- `scripts/verifyJournalRules.mjs` — pure rule checks for statuses, badge eligibility, and date/time helpers.
- `scripts/verifyJournalApi.mjs` — API smoke for permissions, CRUD, checklist initialization, and badges.
- `scripts/verifyJournalNotifications.mjs` — static/service-level duplicate-delivery checks.
- `src/utils/journalApi.js` — frontend API wrapper for Journal endpoints.
- `src/utils/journalRules.js` — shared frontend helpers for status labels, open-status detection, date grouping, and badge/count display.
- `src/components/JournalCurrentPanel.jsx` — top "Актуальное" panel.
- `src/components/JournalChecklistPanel.jsx` — checklist groups by stage.
- `src/components/JournalFeed.jsx` — cross-stage feed and filters.
- `src/components/JournalItemCard.jsx` — task/event/note card.
- `src/components/JournalItemEditor.jsx` — create/edit form for task/event/note.
- `src/components/JournalComments.jsx` — threaded comments inside an item.
- `src/components/JournalBadge.jsx` — red badge for client list.
- `src/components/AdminJournalTemplatePanel.jsx` — admin checklist template editor.

### Modify

- `server/services/db.js` — add additive schema DDL and export migration/bootstrap helpers.
- `server/index.js` — mount `journal` router and start notification scheduler.
- `server/services/messengerPush.js` — export a generic push sender or add a Journal-specific sender using the same device lookup path.
- `server/services/messengerReset.js` — include new Journal tables in protected allowlist logic so messenger reset cannot touch them.
- `src/sections/Journal.jsx` — replace legacy note list with CRM Journal container.
- `src/dashboard.jsx` — pass `clientId`, stages, doctors/users context, and `readOnly` into Journal.
- `src/context/DashboardContext.jsx` — load/store `journalBadges`, expose refresh helper, merge badge updates after client/journal changes.
- `src/sections/Sidebar.jsx` and `src/components/SidebarClientPicker.jsx` — render red Journal badge next to each client.
- `src/components/AdminSectionPanel.jsx` — add admin panel for checklist template.
- `public/sw.js` — route Journal notification clicks to dashboard Journal URLs while preserving messenger behavior.
- `ARCHITECTURE.md` — document new tables, routes, endpoint mapping, and push reuse.
- `package.json` and `server/package.json` — add focused verify scripts.

## Acceptance Contract

Done means employees with Journal access can manage the selected client’s cross-stage CRM Journal, see correct client-list badge counts, and receive deduplicated push reminders when Web Push is configured.

Primary pass/fail criteria:

- Employee sees one cross-stage Journal for the selected client.
- Employee can create/edit/delete tasks, events, notes, and comments according to `journal.write`.
- Stage checklists initialize from the admin template and remain locally editable.
- Red badges count only current employee + team open tasks/events due today or overdue.
- Client role cannot see or fetch Journal data.

Secondary signals:

- `npm run verify:journal-rules`
- `npm run verify:journal-api` against a running local server
- `npm run verify:journal-notifications`
- `npm run build`
- `npm --prefix server run smoke:journal-store`

---

### Task 1: Shared Journal Rules

**Files:**
- Create: `src/utils/journalRules.js`
- Create: `scripts/verifyJournalRules.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the failing verification script**

Create `scripts/verifyJournalRules.mjs`:

```js
import assert from "node:assert/strict";
import {
  JOURNAL_OPEN_STATUSES,
  isJournalOpenStatus,
  isJournalBadgeEligible,
  normalizeJournalDate,
  compareJournalDueAsc,
} from "../src/utils/journalRules.js";

assert.deepEqual(JOURNAL_OPEN_STATUSES, ["open", "in_progress", "waiting_client"]);
assert.equal(isJournalOpenStatus("open"), true);
assert.equal(isJournalOpenStatus("done"), false);
assert.equal(isJournalOpenStatus("cancelled"), false);

const today = "2026-05-27";
const base = {
  type: "task",
  status: "open",
  dueDate: today,
  assigneeUserId: null,
  isTeamTask: true,
};

assert.equal(isJournalBadgeEligible(base, { today, userId: 7 }), true, "team task due today counts");
assert.equal(isJournalBadgeEligible({ ...base, dueDate: "2026-05-26" }, { today, userId: 7 }), true, "overdue counts");
assert.equal(isJournalBadgeEligible({ ...base, dueDate: "2026-05-28" }, { today, userId: 7 }), false, "future does not count");
assert.equal(isJournalBadgeEligible({ ...base, status: "waiting_client" }, { today, userId: 7 }), true, "waiting client is open");
assert.equal(isJournalBadgeEligible({ ...base, status: "done" }, { today, userId: 7 }), false, "done does not count");
assert.equal(isJournalBadgeEligible({ ...base, type: "note" }, { today, userId: 7 }), false, "notes do not count");
assert.equal(isJournalBadgeEligible({ ...base, isTeamTask: false, assigneeUserId: 7 }, { today, userId: 7 }), true, "my assigned task counts");
assert.equal(isJournalBadgeEligible({ ...base, isTeamTask: false, assigneeUserId: 8 }, { today, userId: 7 }), false, "other assignee does not count");

assert.equal(normalizeJournalDate("27.05.2026"), "2026-05-27");
assert.equal(normalizeJournalDate("2026-05-27"), "2026-05-27");
assert.equal(normalizeJournalDate("bad"), "");

const sorted = [
  { dueDate: "2026-05-28", dueTime: "" },
  { dueDate: "2026-05-27", dueTime: "15:00" },
  { dueDate: "2026-05-27", dueTime: "09:00" },
].sort(compareJournalDueAsc);
assert.deepEqual(sorted.map((item) => `${item.dueDate} ${item.dueTime}`.trim()), [
  "2026-05-27 09:00",
  "2026-05-27 15:00",
  "2026-05-28",
]);

console.log("journal rules ok");
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add:

```json
"verify:journal-rules": "node scripts/verifyJournalRules.mjs"
```

- [ ] **Step 3: Run the verification and confirm it fails**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-rules
```

Expected: fail because `src/utils/journalRules.js` does not exist.

- [ ] **Step 4: Implement the rules helper**

Create `src/utils/journalRules.js`:

```js
export const JOURNAL_ITEM_TYPES = ["task", "event", "note"];
export const JOURNAL_OPEN_STATUSES = ["open", "in_progress", "waiting_client"];
export const JOURNAL_TERMINAL_STATUSES = ["done", "cancelled"];

export const JOURNAL_STATUS_LABELS = {
  open: "Открыто",
  in_progress: "В работе",
  waiting_client: "Ожидаем клиента",
  done: "Выполнено",
  cancelled: "Отменено",
};

export const JOURNAL_TYPE_LABELS = {
  task: "Задача",
  event: "Событие",
  note: "Заметка",
};

export const isJournalOpenStatus = (status) =>
  JOURNAL_OPEN_STATUSES.includes(String(status || ""));

export const normalizeJournalDate = (value) => {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
};

export const formatJournalDateRu = (value) => {
  const iso = normalizeJournalDate(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
};

export const getTodayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export const isJournalBadgeEligible = (item, { today = getTodayIso(), userId } = {}) => {
  const type = String(item?.type || "");
  if (type !== "task" && type !== "event") return false;
  if (!isJournalOpenStatus(item?.status)) return false;
  const dueDate = normalizeJournalDate(item?.dueDate ?? item?.due_date);
  if (!dueDate || dueDate > today) return false;
  if (item?.isTeamTask ?? item?.is_team_task) return true;
  const assignee = Number(item?.assigneeUserId ?? item?.assignee_user_id);
  return Number.isInteger(assignee) && assignee > 0 && assignee === Number(userId);
};

export const compareJournalDueAsc = (a, b) => {
  const aDate = normalizeJournalDate(a?.dueDate ?? a?.due_date) || "9999-12-31";
  const bDate = normalizeJournalDate(b?.dueDate ?? b?.due_date) || "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  const aTime = String(a?.dueTime ?? a?.due_time ?? "99:99");
  const bTime = String(b?.dueTime ?? b?.due_time ?? "99:99");
  return aTime.localeCompare(bTime);
};
```

- [ ] **Step 5: Run the verification and commit**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-rules
```

Expected: `journal rules ok`.

Commit:

```bash
git add package.json scripts/verifyJournalRules.mjs src/utils/journalRules.js
git commit -m "feat: add journal rule helpers"
```

---

### Task 2: Add Journal Storage Schema And Store Service

**Files:**
- Modify: `server/services/db.js`
- Create: `server/services/journalStore.js`
- Create: `server/scripts/smokeJournalStore.js`
- Modify: `server/package.json`

- [ ] **Step 1: Add failing store smoke**

Create `server/scripts/smokeJournalStore.js`:

```js
const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const {
  JOURNAL_DEFAULT_TEMPLATE_TITLES,
  listJournalTemplateItems,
  createJournalItem,
  listJournalItems,
  countJournalBadgesForUser,
  recordJournalNotificationDelivery,
  wasJournalNotificationDelivered,
} = require("../services/journalStore");

async function main() {
  await initSchema();

  const tables = await pool.query(`
    SELECT to_regclass('public.journal_items') AS items,
           to_regclass('public.journal_comments') AS comments,
           to_regclass('public.journal_checklist_template_items') AS template,
           to_regclass('public.journal_notification_deliveries') AS deliveries
  `);
  assert.equal(tables.rows[0].items, "journal_items");
  assert.equal(tables.rows[0].comments, "journal_comments");
  assert.equal(tables.rows[0].template, "journal_checklist_template_items");
  assert.equal(tables.rows[0].deliveries, "journal_notification_deliveries");

  const template = await listJournalTemplateItems({ includeInactive: false });
  assert.equal(template.length, JOURNAL_DEFAULT_TEMPLATE_TITLES.length);
  assert.equal(template[0].title, "Отправить клиента в лабораторию / выдать список анализов");

  const clientId = `journal-smoke-${Date.now()}`;
  const stage = await pool.query(
    `WITH c AS (
       INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
       VALUES ($1, 'Journal Smoke', 'Journal Smoke', '', 0, '', 'JS', '#888')
       RETURNING id
     )
     INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status)
     SELECT id, 1, 'Stage', '', '', '', '', '', 'active' FROM c
     RETURNING id`,
    [clientId]
  );
  const stageId = stage.rows[0].id;

  const item = await createJournalItem({
    clientId,
    stageId,
    type: "task",
    title: "Smoke task",
    description: "",
    status: "open",
    dueDate: "2026-05-27",
    dueTime: "",
    assigneeUserId: null,
    isTeamTask: true,
    priority: "normal",
    createdBy: 1,
    sourceTemplateItemId: null,
    metadata: {},
  });
  assert.ok(item.id);

  const items = await listJournalItems(clientId);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Smoke task");

  const badgeCounts = await countJournalBadgesForUser({ userId: 1, role: "admin", today: "2026-05-27" });
  assert.ok(Number(badgeCounts[clientId]) >= 1);

  const key = `smoke-${Date.now()}`;
  assert.equal(await wasJournalNotificationDelivered({ userId: 1, kind: "digest", deliveryKey: key }), false);
  await recordJournalNotificationDelivery({ userId: 1, journalItemId: null, kind: "digest", deliveryKey: key });
  assert.equal(await wasJournalNotificationDelivered({ userId: 1, kind: "digest", deliveryKey: key }), true);

  await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
  console.log("journal store ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => pool.end());
```

- [ ] **Step 2: Add server smoke script**

In `server/package.json`, add:

```json
"smoke:journal-store": "node scripts/smokeJournalStore.js"
```

- [ ] **Step 3: Run smoke and confirm it fails**

Run with a local database:

```bash
cd server && npm run smoke:journal-store
```

Expected: fail because `server/services/journalStore.js` does not exist and tables are missing.

- [ ] **Step 4: Add additive DDL to `initSchema`**

In `server/services/db.js`, inside `initSchema()` after the legacy `journal_entries` DDL, add:

```js
    CREATE TABLE IF NOT EXISTS journal_checklist_template_items (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS journal_items (
      id                      SERIAL PRIMARY KEY,
      client_id               TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      stage_id                INTEGER REFERENCES stages(id) ON DELETE SET NULL,
      type                    TEXT NOT NULL DEFAULT 'note',
      title                   TEXT NOT NULL DEFAULT '',
      description             TEXT NOT NULL DEFAULT '',
      status                  TEXT NOT NULL DEFAULT 'open',
      due_date                DATE,
      due_time                TIME,
      assignee_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_team_task            BOOLEAN NOT NULL DEFAULT true,
      priority                TEXT NOT NULL DEFAULT 'normal',
      created_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at            TIMESTAMPTZ,
      cancelled_at            TIMESTAMPTZ,
      source_template_item_id INTEGER REFERENCES journal_checklist_template_items(id) ON DELETE SET NULL,
      deleted_at              TIMESTAMPTZ,
      deleted_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
      delete_reason           TEXT NOT NULL DEFAULT '',
      metadata_json           TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS journal_comments (
      id              SERIAL PRIMARY KEY,
      journal_item_id INTEGER NOT NULL REFERENCES journal_items(id) ON DELETE CASCADE,
      author_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body            TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at      TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS journal_notification_deliveries (
      id              SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      journal_item_id  INTEGER REFERENCES journal_items(id) ON DELETE CASCADE,
      kind             TEXT NOT NULL,
      delivery_key     TEXT NOT NULL,
      delivered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, kind, delivery_key)
    );

    CREATE INDEX IF NOT EXISTS idx_ji_client ON journal_items(client_id);
    CREATE INDEX IF NOT EXISTS idx_ji_stage ON journal_items(stage_id);
    CREATE INDEX IF NOT EXISTS idx_ji_due ON journal_items(due_date, due_time);
    CREATE INDEX IF NOT EXISTS idx_ji_assignee ON journal_items(assignee_user_id);
    CREATE INDEX IF NOT EXISTS idx_jc_item ON journal_comments(journal_item_id);
    CREATE INDEX IF NOT EXISTS idx_jnd_user_kind_key ON journal_notification_deliveries(user_id, kind, delivery_key);
```

- [ ] **Step 5: Add default template seeding in `initSchema`**

In `server/services/db.js`, after table creation statements finish, call:

```js
  await seedJournalChecklistTemplate();
```

Define above `initSchema` or near setup helpers:

```js
const JOURNAL_DEFAULT_TEMPLATE_TITLES = [
  "Отправить клиента в лабораторию / выдать список анализов",
  "Проконтролировать сдачу анализов",
  "Проверить, что файлы анализов загружены",
  "Подготовить/обновить протокол",
  "Отправить протокол клиенту",
  "Подготовить/обновить питание",
  "Отправить рекомендации по питанию",
  "Уточнить, начал ли клиент принимать препараты",
  "Назначить промежуточную встречу/созвон",
  "Зафиксировать комментарии врача/нутрициолога по этапу",
  "Закрыть этап / назначить следующий шаг",
];

const seedJournalChecklistTemplate = async () => {
  const existing = await pool.query("SELECT COUNT(*)::int AS n FROM journal_checklist_template_items");
  if (existing.rows[0]?.n > 0) return;
  for (let i = 0; i < JOURNAL_DEFAULT_TEMPLATE_TITLES.length; i += 1) {
    await pool.query(
      "INSERT INTO journal_checklist_template_items (title, sort_order, active) VALUES ($1, $2, true)",
      [JOURNAL_DEFAULT_TEMPLATE_TITLES[i], i]
    );
  }
};
```

Export `JOURNAL_DEFAULT_TEMPLATE_TITLES` from `db.js`.

- [ ] **Step 6: Implement `journalStore`**

Create `server/services/journalStore.js`:

```js
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
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
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

module.exports = {
  JOURNAL_DEFAULT_TEMPLATE_TITLES,
  listJournalTemplateItems,
  createJournalItem,
  listJournalItems,
  countJournalBadgesForUser,
  recordJournalNotificationDelivery,
  wasJournalNotificationDelivered,
};
```

- [ ] **Step 7: Export default titles from `db.js`**

In `server/services/db.js`, add `JOURNAL_DEFAULT_TEMPLATE_TITLES` to `module.exports`.

- [ ] **Step 8: Run smoke and commit**

Run:

```bash
cd server && npm run smoke:journal-store
```

Expected: `journal store ok`.

Commit:

```bash
git add server/package.json server/scripts/smokeJournalStore.js server/services/db.js server/services/journalStore.js
git commit -m "feat: add journal storage"
```

---

### Task 3: Legacy Journal Backfill

**Files:**
- Modify: `server/services/journalStore.js`
- Create: `server/scripts/verifyJournalBackfill.js`
- Modify: `server/package.json`

- [ ] **Step 1: Add failing backfill verification**

Create `server/scripts/verifyJournalBackfill.js`:

```js
const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { backfillLegacyJournalEntries, listJournalItems } = require("../services/journalStore");

async function main() {
  await initSchema();
  const clientId = `journal-backfill-${Date.now()}`;
  const stageRes = await pool.query(
    `WITH c AS (
       INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
       VALUES ($1, 'Backfill Client', 'Backfill Client', '', 0, '', 'BC', '#999')
       RETURNING id
     )
     INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status)
     SELECT id, 1, 'Stage', '', '', '', '', '', 'active' FROM c
     RETURNING id`,
    [clientId]
  );
  const stageId = stageRes.rows[0].id;
  await pool.query(
    "INSERT INTO journal_entries (client_id, stage_id, entry_num, date, type, text, author) VALUES ($1,$2,0,'27.05.2026','Созвон','Обсудили анализы','Врач')",
    [clientId, stageId]
  );

  const first = await backfillLegacyJournalEntries();
  const second = await backfillLegacyJournalEntries();
  assert.ok(first.migrated >= 1);
  assert.equal(second.migrated, 0, "backfill must be idempotent");

  const items = await listJournalItems(clientId);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "note");
  assert.equal(items[0].description, "Обсудили анализы");
  assert.equal(items[0].metadata.legacy_type, "Созвон");
  assert.equal(items[0].metadata.legacy_author, "Врач");

  await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
  console.log("journal backfill ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => pool.end());
```

- [ ] **Step 2: Add script**

In `server/package.json`, add:

```json
"verify:journal-backfill": "node scripts/verifyJournalBackfill.js"
```

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
cd server && npm run verify:journal-backfill
```

Expected: fail because `backfillLegacyJournalEntries` is not exported.

- [ ] **Step 4: Implement idempotent backfill**

In `server/services/journalStore.js`, add:

```js
async function backfillLegacyJournalEntries() {
  const legacy = await pool.query(
    `SELECT je.*, s.id AS current_stage_id
     FROM journal_entries je
     JOIN stages s ON s.id = je.stage_id
     WHERE NOT EXISTS (
       SELECT 1 FROM journal_items ji
       WHERE ji.metadata_json::text LIKE '%' || ('"legacy_journal_entry_id":' || je.id)::text || '%'
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
```

Export it from `module.exports`.

- [ ] **Step 5: Run verification and commit**

Run:

```bash
cd server && npm run verify:journal-backfill
```

Expected: `journal backfill ok`.

Commit:

```bash
git add server/package.json server/scripts/verifyJournalBackfill.js server/services/journalStore.js
git commit -m "feat: backfill legacy journal notes"
```

---

### Task 4: Journal API Routes And Permissions

**Files:**
- Create: `server/routes/journal.js`
- Modify: `server/services/journalStore.js`
- Modify: `server/index.js`
- Create: `scripts/verifyJournalApi.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing API smoke**

Create `scripts/verifyJournalApi.mjs`:

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.JOURNAL_TEST_TOKEN;
const CLIENT_ID = process.env.JOURNAL_TEST_CLIENT_ID;
const STAGE_ID = Number(process.env.JOURNAL_TEST_STAGE_ID || 0);

if (!TOKEN || !CLIENT_ID || !STAGE_ID) {
  console.log("set JOURNAL_TEST_TOKEN, JOURNAL_TEST_CLIENT_ID, JOURNAL_TEST_STAGE_ID");
  process.exit(1);
}

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

const list0 = await call(`/api/clients/${CLIENT_ID}/journal`);
assert.equal(list0.status, 200);
assert.ok(Array.isArray(list0.data.items));

const created = await call(`/api/clients/${CLIENT_ID}/journal/items`, "POST", {
  type: "task",
  stageId: STAGE_ID,
  title: "API smoke task",
  description: "Created by verifyJournalApi",
  status: "open",
  dueDate: "2026-05-27",
  dueTime: "",
  isTeamTask: true,
});
assert.equal(created.status, 200);
assert.equal(created.data.item.title, "API smoke task");

const updated = await call(`/api/clients/${CLIENT_ID}/journal/items/${created.data.item.id}`, "PATCH", {
  status: "waiting_client",
});
assert.equal(updated.status, 200);
assert.equal(updated.data.item.status, "waiting_client");

const comment = await call(`/api/clients/${CLIENT_ID}/journal/items/${created.data.item.id}/comments`, "POST", {
  body: "Комментарий врача",
});
assert.equal(comment.status, 200);
assert.equal(comment.data.comment.body, "Комментарий врача");

const badges = await call("/api/journal/badges");
assert.equal(badges.status, 200);
assert.ok(Number(badges.data.badges[CLIENT_ID]) >= 1);

const deleted = await call(`/api/clients/${CLIENT_ID}/journal/items/${created.data.item.id}`, "DELETE", {
  reason: "api smoke cleanup",
});
assert.equal(deleted.status, 200);

console.log("journal api ok");
```

- [ ] **Step 2: Add script**

In root `package.json`, add:

```json
"verify:journal-api": "node scripts/verifyJournalApi.mjs"
```

- [ ] **Step 3: Run and confirm failure**

With a running server and env vars, run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-api
```

Expected: fail with 404 for `/api/clients/:clientId/journal`.

- [ ] **Step 4: Add update/comment/delete functions**

In `server/services/journalStore.js`, add functions:

```js
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
```

Export these functions.

- [ ] **Step 5: Extract shared `canAccessClient`**

The current `canAccessClient` helper lives inside `server/routes/clients.js`. Move it into a shared service before adding the Journal router.

Create `server/services/clientAccess.js`:

```js
const { getAssignmentsByUser, hasAllClientsAccess } = require("./db");

async function canAccessClient(user, clientId) {
  if (!user) return false;
  if (user.role === "admin" || await hasAllClientsAccess(user.id)) return true;
  const assigned = await getAssignmentsByUser(user.id);
  return assigned.some((row) => row.client_id === clientId);
}

module.exports = { canAccessClient };
```

In `server/routes/clients.js`, import:

```js
const { canAccessClient } = require("../services/clientAccess");
```

Then delete the local `const canAccessClient = async (user, clientId) => { ... }` definition from `server/routes/clients.js`.

- [ ] **Step 6: Implement `server/routes/journal.js`**

Create `server/routes/journal.js`:

```js
const express = require("express");
const router = express.Router();
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const { pool } = require("../services/db");
const {
  listJournalItems,
  createJournalItem,
  getJournalItemById,
  updateJournalItem,
  softDeleteJournalItem,
  createJournalComment,
  countJournalBadgesForUser,
} = require("../services/journalStore");
const { canAccessClient } = require("../services/clientAccess");

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

async function assertClientAccess(req, res) {
  if (await canAccessClient(req.user, req.params.clientId)) return true;
  res.status(403).json({ error: "Нет доступа к этому клиенту" });
  return false;
}

async function assertItemBelongsToClient(req, res) {
  const item = await getJournalItemById(Number(req.params.itemId));
  if (!item) {
    res.status(404).json({ error: "Запись журнала не найдена" });
    return null;
  }
  if (item.clientId !== req.params.clientId) {
    res.status(404).json({ error: "Запись журнала не найдена" });
    return null;
  }
  return item;
}

router.get("/clients/:clientId/journal", requireAuth(), requireSectionRead("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    const items = await listJournalItems(req.params.clientId);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

router.post("/clients/:clientId/journal/items", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    const item = await createJournalItem({ ...req.body, clientId: req.params.clientId, createdBy: req.user.id });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректная запись журнала" });
  }
});

router.patch("/clients/:clientId/journal/items/:itemId", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    if (!(await assertItemBelongsToClient(req, res))) return;
    const item = await updateJournalItem(Number(req.params.itemId), req.body || {});
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректная запись журнала" });
  }
});

router.delete("/clients/:clientId/journal/items/:itemId", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    if (!(await assertItemBelongsToClient(req, res))) return;
    await softDeleteJournalItem(Number(req.params.itemId), { deletedBy: req.user.id, reason: req.body?.reason || "" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

router.post("/clients/:clientId/journal/items/:itemId/comments", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    if (!(await assertItemBelongsToClient(req, res))) return;
    const comment = await createJournalComment({ journalItemId: Number(req.params.itemId), authorUserId: req.user.id, body: req.body?.body });
    res.json({ ok: true, comment });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректный комментарий" });
  }
});

router.get("/journal/badges", requireAuth(), requireSectionRead("journal"), async (req, res) => {
  try {
    const badges = await countJournalBadgesForUser({ userId: req.user.id, role: req.user.role, today: todayIso() });
    res.json({ ok: true, badges });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

module.exports = router;
```

- [ ] **Step 7: Mount the router**

In `server/index.js`, add:

```js
const journalRouter = require("./routes/journal");
```

and mount:

```js
app.use("/api", journalRouter);
```

- [ ] **Step 8: Run API verification and commit**

Run with server env vars:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-api
```

Expected: `journal api ok`.

Commit:

```bash
git add package.json scripts/verifyJournalApi.mjs server/index.js server/routes/journal.js server/routes/clients.js server/services/clientAccess.js server/services/journalStore.js
git commit -m "feat: add journal api"
```

---

### Task 5: Checklist Template Admin API And Stage Initialization

**Files:**
- Modify: `server/services/journalStore.js`
- Modify: `server/routes/journal.js`
- Create: `scripts/verifyJournalChecklist.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing checklist verification**

Create `scripts/verifyJournalChecklist.mjs`:

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const ADMIN_TOKEN = process.env.JOURNAL_ADMIN_TOKEN;
const TOKEN = process.env.JOURNAL_TEST_TOKEN;
const CLIENT_ID = process.env.JOURNAL_TEST_CLIENT_ID;
const STAGE_ID = Number(process.env.JOURNAL_TEST_STAGE_ID || 0);

if (!ADMIN_TOKEN || !TOKEN || !CLIENT_ID || !STAGE_ID) {
  console.log("set JOURNAL_ADMIN_TOKEN, JOURNAL_TEST_TOKEN, JOURNAL_TEST_CLIENT_ID, JOURNAL_TEST_STAGE_ID");
  process.exit(1);
}

const call = async (token, path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

const template = await call(ADMIN_TOKEN, "/api/admin/journal/checklist-template");
assert.equal(template.status, 200);
assert.ok(template.data.items.length >= 11);

const init = await call(TOKEN, `/api/clients/${CLIENT_ID}/journal/stages/${STAGE_ID}/checklist/initialize`, "POST");
assert.equal(init.status, 200);
assert.ok(init.data.created >= 0);

const second = await call(TOKEN, `/api/clients/${CLIENT_ID}/journal/stages/${STAGE_ID}/checklist/initialize`, "POST");
assert.equal(second.status, 200);
assert.equal(second.data.created, 0, "checklist initialization is idempotent");

console.log("journal checklist ok");
```

- [ ] **Step 2: Add script**

In root `package.json`, add:

```json
"verify:journal-checklist": "node scripts/verifyJournalChecklist.mjs"
```

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-checklist
```

Expected: fail with 404 for template or initialize endpoint.

- [ ] **Step 4: Add store functions**

In `server/services/journalStore.js`, add:

```js
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
```

Export the new functions.

- [ ] **Step 5: Add admin and initialize routes**

In `server/routes/journal.js`, import:

```js
  listJournalTemplateItems,
  upsertJournalTemplateItem,
  deleteJournalTemplateItem,
  initializeStageChecklist,
```

Add routes:

```js
router.get("/admin/journal/checklist-template", requireAuth("admin"), async (_req, res) => {
  try {
    const items = await listJournalTemplateItems({ includeInactive: true });
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

router.post("/admin/journal/checklist-template", requireAuth("admin"), async (req, res) => {
  try {
    const item = await upsertJournalTemplateItem(req.body || {});
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректный пункт шаблона" });
  }
});

router.patch("/admin/journal/checklist-template/:id", requireAuth("admin"), async (req, res) => {
  try {
    const item = await upsertJournalTemplateItem({ ...req.body, id: Number(req.params.id) });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректный пункт шаблона" });
  }
});

router.delete("/admin/journal/checklist-template/:id", requireAuth("admin"), async (req, res) => {
  try {
    await deleteJournalTemplateItem(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

router.post("/clients/:clientId/journal/stages/:stageId/checklist/initialize", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    const result = await initializeStageChecklist({
      clientId: req.params.clientId,
      stageId: Number(req.params.stageId),
      createdBy: req.user.id,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});
```

- [ ] **Step 6: Run checklist verification and commit**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-checklist
```

Expected: `journal checklist ok`.

Commit:

```bash
git add package.json scripts/verifyJournalChecklist.mjs server/routes/journal.js server/services/journalStore.js
git commit -m "feat: add journal checklist template api"
```

---

### Task 6: Frontend API Wrapper And Dashboard Badge State

**Files:**
- Create: `src/utils/journalApi.js`
- Modify: `src/context/DashboardContext.jsx`
- Modify: `src/sections/Sidebar.jsx`
- Modify: `src/components/SidebarClientPicker.jsx`
- Create: `src/components/JournalBadge.jsx`
- Create: `scripts/verifyJournalFrontendStatic.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing static verification**

Create `scripts/verifyJournalFrontendStatic.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

assert.match(read("src/utils/journalApi.js"), /fetchJournal/);
assert.match(read("src/utils/journalApi.js"), /fetchJournalBadges/);
assert.match(read("src/context/DashboardContext.jsx"), /journalBadges/);
assert.match(read("src/components/SidebarClientPicker.jsx"), /JournalBadge/);
assert.match(read("src/components/JournalBadge.jsx"), /background:\s*\"#dc2626\"/);

console.log("journal frontend static ok");
```

- [ ] **Step 2: Add script**

In `package.json`, add:

```json
"verify:journal-frontend-static": "node scripts/verifyJournalFrontendStatic.mjs"
```

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-frontend-static
```

Expected: fail because `src/utils/journalApi.js` does not exist.

- [ ] **Step 4: Create Journal API wrapper**

Create `src/utils/journalApi.js`:

```js
const apiJson = async (authFetch, url, options = {}) => {
  const res = await authFetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Ошибка журнала");
  return data;
};

export const fetchJournal = (authFetch, clientId) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal`);

export const createJournalItem = (authFetch, clientId, payload) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateJournalItem = (authFetch, clientId, itemId, payload) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteJournalItem = (authFetch, clientId, itemId, reason = "") =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items/${itemId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });

export const createJournalComment = (authFetch, clientId, itemId, body) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items/${itemId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const initializeJournalChecklist = (authFetch, clientId, stageId) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/stages/${stageId}/checklist/initialize`, {
    method: "POST",
  });

export const fetchJournalBadges = (authFetch) =>
  apiJson(authFetch, "/api/journal/badges");
```

- [ ] **Step 5: Add badge component**

Create `src/components/JournalBadge.jsx`:

```jsx
export default function JournalBadge({ count }) {
  const safeCount = Number(count || 0);
  if (!safeCount) return null;
  return (
    <span
      title={`${safeCount} задач на сегодня или просрочено`}
      style={{
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "#dc2626",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {safeCount > 99 ? "99+" : safeCount}
    </span>
  );
}
```

- [ ] **Step 6: Add `journalBadges` to Dashboard context**

In `src/context/DashboardContext.jsx`, import:

```js
import { fetchJournalBadges } from "../utils/journalApi";
```

Add state:

```js
const [journalBadges, setJournalBadges] = useState({});
```

Add helper inside provider:

```js
const reloadJournalBadges = useCallback(async () => {
  if (!canReadSection("journal")) {
    setJournalBadges({});
    return {};
  }
  try {
    const data = await fetchJournalBadges(authFetch);
    const badges = data?.badges && typeof data.badges === "object" ? data.badges : {};
    setJournalBadges(badges);
    return badges;
  } catch (_) {
    return journalBadges;
  }
}, [authFetch, canReadSection, journalBadges]);
```

Call it after initial clients load and when `cid` changes:

```js
useEffect(() => {
  reloadJournalBadges();
}, [reloadJournalBadges, cid]);
```

Expose from context value:

```js
journalBadges,
reloadJournalBadges,
```

- [ ] **Step 7: Pass badges into sidebar picker**

In `src/sections/Sidebar.jsx`, destructure:

```js
journalBadges,
```

Pass prop:

```jsx
journalBadges={journalBadges}
```

In `src/components/SidebarClientPicker.jsx`, import and render:

```jsx
import JournalBadge from "./JournalBadge";
```

Add `journalBadges = {}` to props. In `SidebarClientMenuItem`, add `badgeCount` prop and render after the client name:

```jsx
<JournalBadge count={badgeCount} />
```

Pass:

```jsx
badgeCount={journalBadges[item.id] || 0}
```

- [ ] **Step 8: Run static verification, build, and commit**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-frontend-static
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: static script prints `journal frontend static ok`; build succeeds.

Commit:

```bash
git add package.json scripts/verifyJournalFrontendStatic.mjs src/utils/journalApi.js src/context/DashboardContext.jsx src/sections/Sidebar.jsx src/components/SidebarClientPicker.jsx src/components/JournalBadge.jsx
git commit -m "feat: show journal badges in client list"
```

---

### Task 7: Journal CRM UI

**Files:**
- Modify: `src/sections/Journal.jsx`
- Modify: `src/dashboard.jsx`
- Create: `src/components/JournalCurrentPanel.jsx`
- Create: `src/components/JournalChecklistPanel.jsx`
- Create: `src/components/JournalFeed.jsx`
- Create: `src/components/JournalItemCard.jsx`
- Create: `src/components/JournalItemEditor.jsx`
- Create: `src/components/JournalComments.jsx`
- Modify: `src/utils/journalApi.js`

- [ ] **Step 1: Add frontend container state**

Replace `src/sections/Journal.jsx` with a container that loads Journal data:

```jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  createJournalComment,
  createJournalItem,
  deleteJournalItem,
  fetchJournal,
  initializeJournalChecklist,
  updateJournalItem,
} from "../utils/journalApi";
import { compareJournalDueAsc, getTodayIso, isJournalBadgeEligible } from "../utils/journalRules";
import JournalCurrentPanel from "../components/JournalCurrentPanel";
import JournalChecklistPanel from "../components/JournalChecklistPanel";
import JournalFeed from "../components/JournalFeed";
import JournalItemEditor from "../components/JournalItemEditor";

export default function JournalSection({ clientId, stages = [], readOnly = false, onChanged }) {
  const { authFetch, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

  const loadJournal = async () => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchJournal(authFetch, clientId);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить журнал");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJournal();
  }, [clientId]);

  const today = getTodayIso();
  const currentItems = useMemo(() => (
    items
      .filter((item) => isJournalBadgeEligible(item, { today, userId: user?.id }))
      .sort(compareJournalDueAsc)
      .slice(0, 8)
  ), [items, today, user?.id]);

  const refreshAfterChange = async () => {
    await loadJournal();
    if (onChanged) await onChanged();
  };

  const saveItem = async (payload) => {
    if (editor?.item?.id) await updateJournalItem(authFetch, clientId, editor.item.id, payload);
    else await createJournalItem(authFetch, clientId, payload);
    setEditor(null);
    await refreshAfterChange();
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Удалить «${item.title || "запись журнала"}»?`)) return;
    await deleteJournalItem(authFetch, clientId, item.id, "Удалено из интерфейса журнала");
    await refreshAfterChange();
  };

  const addComment = async (item, body) => {
    await createJournalComment(authFetch, clientId, item.id, body);
    await refreshAfterChange();
  };

  const initChecklist = async (stageId) => {
    await initializeJournalChecklist(authFetch, clientId, stageId);
    await refreshAfterChange();
  };

  if (loading) return <div style={{ padding: 16 }}>Загрузка журнала...</div>;
  if (error) return <div style={{ padding: 16, color: "#dc2626" }}>{error}</div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <JournalCurrentPanel
        items={currentItems}
        readOnly={readOnly}
        onAddTask={() => setEditor({ type: "task" })}
        onAddEvent={() => setEditor({ type: "event" })}
        onAddNote={() => setEditor({ type: "note" })}
        onEdit={(item) => setEditor({ item })}
      />
      <JournalChecklistPanel
        stages={stages}
        items={items}
        readOnly={readOnly}
        onInitialize={initChecklist}
        onAdd={(stage) => setEditor({ type: "task", stageId: stage.id })}
        onEdit={(item) => setEditor({ item })}
        onDelete={removeItem}
        onComment={addComment}
      />
      <JournalFeed
        stages={stages}
        items={items}
        readOnly={readOnly}
        onEdit={(item) => setEditor({ item })}
        onDelete={removeItem}
        onComment={addComment}
      />
      {editor && (
        <JournalItemEditor
          stages={stages}
          initialType={editor.type}
          initialStageId={editor.stageId}
          item={editor.item}
          onClose={() => setEditor(null)}
          onSave={saveItem}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update dashboard props**

In `src/dashboard.jsx`, change Journal render:

```jsx
const renderJournalSection = () => (
  <JournalSection
    clientId={currentClient.id}
    stages={currentClient.stages || []}
    readOnly={!canWriteSection("journal")}
    onChanged={reloadJournalBadges}
  />
);
```

Destructure `reloadJournalBadges` from `useDashboard()`.

- [ ] **Step 3: Build UI components**

Create the listed components. Keep each focused:

`JournalCurrentPanel.jsx` renders the current list and three buttons.

`JournalChecklistPanel.jsx` groups `item.sourceTemplateItemId` or `item.metadata?.checklist` items by `stageId`.

`JournalFeed.jsx` renders filters and all non-deleted items.

`JournalItemCard.jsx` renders item status, type, due date/time, title, description, latest comments, edit/delete controls.

`JournalItemEditor.jsx` renders controlled fields:

```js
{
  type,
  stageId,
  title,
  description,
  status,
  dueDate,
  dueTime,
  assigneeUserId,
  isTeamTask,
  priority
}
```

`JournalComments.jsx` renders existing comments plus a textarea and save button.

- [ ] **Step 4: Ensure checklist status edits use item update**

In `JournalItemCard`, status select calls:

```jsx
onEdit({ ...item, status: event.target.value })
```

In `JournalChecklistPanel`, use the same edit handler path as the feed so checklist items and feed items stay one model.

- [ ] **Step 5: Validate UI build and commit**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build succeeds.

Commit:

```bash
git add src/sections/Journal.jsx src/dashboard.jsx src/components/JournalCurrentPanel.jsx src/components/JournalChecklistPanel.jsx src/components/JournalFeed.jsx src/components/JournalItemCard.jsx src/components/JournalItemEditor.jsx src/components/JournalComments.jsx src/utils/journalApi.js
git commit -m "feat: build journal crm interface"
```

---

### Task 8: Admin Checklist Template UI

**Files:**
- Create: `src/components/AdminJournalTemplatePanel.jsx`
- Modify: `src/components/AdminSectionPanel.jsx`
- Modify: `src/utils/journalApi.js`

- [ ] **Step 1: Add admin API client functions**

In `src/utils/journalApi.js`, add:

```js
export const fetchJournalTemplate = (authFetch) =>
  apiJson(authFetch, "/api/admin/journal/checklist-template");

export const createJournalTemplateItem = (authFetch, payload) =>
  apiJson(authFetch, "/api/admin/journal/checklist-template", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateJournalTemplateItem = (authFetch, id, payload) =>
  apiJson(authFetch, `/api/admin/journal/checklist-template/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteJournalTemplateItem = (authFetch, id) =>
  apiJson(authFetch, `/api/admin/journal/checklist-template/${id}`, {
    method: "DELETE",
  });
```

- [ ] **Step 2: Create admin template panel**

Create `src/components/AdminJournalTemplatePanel.jsx` with:

```jsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  createJournalTemplateItem,
  deleteJournalTemplateItem,
  fetchJournalTemplate,
  updateJournalTemplateItem,
} from "../utils/journalApi";
import Button from "./Button";
import Card from "./Card";
import Wrapper from "./Wrapper";

export default function AdminJournalTemplatePanel() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const data = await fetchJournalTemplate(authFetch);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить шаблон журнала");
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (item, patch) => {
    await updateJournalTemplateItem(authFetch, item.id, { ...item, ...patch });
    await load();
  };

  const add = async () => {
    await createJournalTemplateItem(authFetch, { title: "Новый пункт", sortOrder: items.length, active: true });
    await load();
  };

  return (
    <Card>
      <Wrapper gap="sm">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Шаблон чек-листа журнала</div>
          <Button onClick={add}>+ Пункт</Button>
        </div>
        {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}
        {items.map((item, index) => (
          <div key={item.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr 90px 70px", gap: 8, alignItems: "center" }}>
            <input value={item.sortOrder ?? index} onChange={(e) => save(item, { sortOrder: Number(e.target.value) || 0 })} />
            <input value={item.title} onChange={(e) => save(item, { title: e.target.value })} />
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={!!item.active} onChange={(e) => save(item, { active: e.target.checked })} /> Активен
            </label>
            <Button variant="bare" tone="danger" onClick={async () => { await deleteJournalTemplateItem(authFetch, item.id); await load(); }}>Удалить</Button>
          </div>
        ))}
      </Wrapper>
    </Card>
  );
}
```

- [ ] **Step 3: Mount in admin panel**

In `src/components/AdminSectionPanel.jsx`, import:

```js
import AdminJournalTemplatePanel from "./AdminJournalTemplatePanel";
```

Place `<AdminJournalTemplatePanel />` near other reference/admin configuration panels, not inside user list rows.

- [ ] **Step 4: Build and commit**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build succeeds.

Commit:

```bash
git add src/components/AdminJournalTemplatePanel.jsx src/components/AdminSectionPanel.jsx src/utils/journalApi.js
git commit -m "feat: manage journal checklist template"
```

---

### Task 9: Journal Push Notifications

**Files:**
- Modify: `server/services/messengerPush.js`
- Create: `server/services/journalNotifications.js`
- Modify: `server/services/journalStore.js`
- Modify: `server/index.js`
- Modify: `public/sw.js`
- Create: `scripts/verifyJournalNotifications.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing notification verification**

Create `scripts/verifyJournalNotifications.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("server/services/journalNotifications.js", "utf8");
const index = fs.readFileSync("server/index.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

assert.match(service, /runJournalDigest/);
assert.match(service, /runJournalExactReminders/);
assert.match(service, /wasJournalNotificationDelivered/);
assert.match(service, /recordJournalNotificationDelivery/);
assert.match(index, /startJournalNotificationScheduler/);
assert.match(sw, /payload\.url/);
assert.match(sw, /journal/);

console.log("journal notifications static ok");
```

- [ ] **Step 2: Add script**

In `package.json`, add:

```json
"verify:journal-notifications": "node scripts/verifyJournalNotifications.mjs"
```

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-notifications
```

Expected: fail because `journalNotifications.js` does not exist.

- [ ] **Step 4: Add generic push sender**

In `server/services/messengerPush.js`, export:

```js
async function sendPushToUsers({ userIds, title, body, url, exceptDeviceId = "" }) {
  if (!PUSH_READY) return { ok: false, skipped: "missing_vapid" };
  const uniqueUserIds = Array.from(new Set(Array.from(userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  const devices = await listPushDevicesForUsers(uniqueUserIds);
  const payload = JSON.stringify({ title, body, url });
  const results = [];
  for (const device of devices) {
    if (exceptDeviceId && device.device_id === exceptDeviceId) continue;
    const subscription = { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } };
    try {
      await webpush.sendNotification(subscription, payload);
      results.push({ deviceId: device.device_id, ok: true });
    } catch (error) {
      results.push({ deviceId: device.device_id, ok: false, statusCode: error.statusCode || 0 });
    }
  }
  return { ok: true, results };
}
```

Update `sendPrivateMessagePush` to call `sendPushToUsers` so there is one delivery implementation.

- [ ] **Step 5: Add notification query helpers**

In `server/services/journalStore.js`, add:

```js
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
       AND ji.due_time IS NOT NULL
       AND ((ji.due_date::text || 'T' || ji.due_time::text)::timestamp <= $1::timestamp)
       AND (ji.is_team_task = true OR ji.assignee_user_id = u.id)
       AND (u.role = 'admin' OR u.all_clients_access = true OR ca.user_id IS NOT NULL)`,
    [nowIso]
  );
  return res.rows;
}
```

Export both.

- [ ] **Step 6: Implement notification service**

Create `server/services/journalNotifications.js`:

```js
const { sendPushToUsers } = require("./messengerPush");
const {
  listDueJournalReminders,
  listUsersForJournalDigest,
  recordJournalNotificationDelivery,
  wasJournalNotificationDelivered,
} = require("./journalStore");

const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

async function runJournalDigest(now = new Date()) {
  const today = todayIso(now);
  const users = await listUsersForJournalDigest(today);
  for (const user of users) {
    const deliveryKey = today;
    if (await wasJournalNotificationDelivered({ userId: user.id, kind: "digest", deliveryKey })) continue;
    await sendPushToUsers({
      userIds: [user.id],
      title: "Журнал 2life",
      body: `На сегодня и просрочено: ${user.due_count}`,
      url: "/",
    });
    await recordJournalNotificationDelivery({ userId: user.id, kind: "digest", deliveryKey });
  }
  return { users: users.length };
}

async function runJournalExactReminders(now = new Date()) {
  const nowIso = now.toISOString().slice(0, 16);
  const rows = await listDueJournalReminders(nowIso);
  let sent = 0;
  for (const row of rows) {
    const deliveryKey = `${row.id}:${String(row.due_date).slice(0, 10)}:${String(row.due_time).slice(0, 5)}`;
    if (await wasJournalNotificationDelivered({ userId: row.user_id, kind: "exact", deliveryKey })) continue;
    await sendPushToUsers({
      userIds: [row.user_id],
      title: row.type === "event" ? "Событие в журнале" : "Задача в журнале",
      body: row.title || "Откройте журнал клиента",
      url: `/?cid=${encodeURIComponent(row.client_id)}&sec=journal`,
    });
    await recordJournalNotificationDelivery({ userId: row.user_id, journalItemId: row.id, kind: "exact", deliveryKey });
    sent += 1;
  }
  return { scanned: rows.length, sent };
}

function startJournalNotificationScheduler() {
  const tick = () => {
    runJournalExactReminders().catch((error) => console.warn("[journal] exact reminder failed", error?.message || error));
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() < 5) {
      runJournalDigest(now).catch((error) => console.warn("[journal] digest failed", error?.message || error));
    }
  };
  const timer = setInterval(tick, 5 * 60 * 1000);
  tick();
  return timer;
}

module.exports = { runJournalDigest, runJournalExactReminders, startJournalNotificationScheduler };
```

- [ ] **Step 7: Start scheduler**

In `server/index.js`, import and start after server setup:

```js
const { startJournalNotificationScheduler } = require("./services/journalNotifications");
```

Call:

```js
startJournalNotificationScheduler();
```

- [ ] **Step 8: Preserve service worker behavior**

In `public/sw.js`, make sure notification click uses `payload.url` for both messenger and journal:

```js
data: { url: payload.url || "/app/messenger", kind: payload.kind || "generic" },
```

Keep existing messenger fallback intact.

- [ ] **Step 9: Run verification and commit**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-notifications
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: static script prints `journal notifications static ok`; build succeeds.

Commit:

```bash
git add package.json scripts/verifyJournalNotifications.mjs server/index.js server/services/messengerPush.js server/services/journalNotifications.js server/services/journalStore.js public/sw.js
git commit -m "feat: add journal push reminders"
```

---

### Task 10: Protect Journal Tables From Messenger Reset

**Files:**
- Modify: `server/services/messengerReset.js`
- Modify: `server/scripts/verifyMessengerResetGuard.js`

- [ ] **Step 1: Extend reset guard verification**

In `server/scripts/verifyMessengerResetGuard.js`, add assertions that these tables are protected:

```js
assert.throws(() => assertMessengerTableAllowlist(["journal_items"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["journal_comments"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["journal_checklist_template_items"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["journal_notification_deliveries"]), /protected table/i);
```

- [ ] **Step 2: Run guard test**

Run:

```bash
cd server && npm run verify:messenger-reset
```

Expected: pass. If it fails, update `server/services/messengerReset.js` protected table checks so Journal tables are not allowlisted.

- [ ] **Step 3: Commit**

```bash
git add server/services/messengerReset.js server/scripts/verifyMessengerResetGuard.js
git commit -m "test: protect journal tables from messenger reset"
```

---

### Task 11: Documentation And Final Validation

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/superpowers/specs/2026-05-27-journal-crm-design.md` if implementation intentionally differs from the design

- [ ] **Step 1: Update architecture docs**

In `ARCHITECTURE.md`, update:

- table list to include `journal_items`, `journal_comments`, `journal_checklist_template_items`, `journal_notification_deliveries`;
- routes list to include `journal.js`;
- Section -> API Mapping for `journal` to use dedicated endpoints;
- push section to state Web Push is shared by messenger and Journal;
- migration note for legacy `journal_entries`.

- [ ] **Step 2: Run all focused Journal checks**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-rules
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-frontend-static
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-notifications
cd server && npm run smoke:journal-store && npm run verify:journal-backfill && npm run verify:messenger-reset
```

Expected:

- `journal rules ok`
- `journal frontend static ok`
- `journal notifications static ok`
- `journal store ok`
- `journal backfill ok`
- messenger reset guard passes

- [ ] **Step 3: Run runtime API checks**

With a running local server and valid tokens:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-api
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-checklist
```

Expected:

- `journal api ok`
- `journal checklist ok`

- [ ] **Step 4: Run production build**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 5: Manual UI smoke**

Start local dev:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run dev
```

In the browser:

1. Log in as an employee with `journal.read` and `journal.write`.
2. Open a client and go to `Журнал`.
3. Initialize checklist for at least one stage.
4. Create a task due today with no assignee and confirm red badge appears in client picker.
5. Assign a task to another employee and confirm current employee badge does not count it.
6. Add an event with a time and confirm it appears in "Актуальное".
7. Add a note and a comment.
8. Log in as a client role and confirm Journal is absent.

- [ ] **Step 6: Commit docs**

```bash
git add ARCHITECTURE.md docs/superpowers/specs/2026-05-27-journal-crm-design.md
git commit -m "docs: document journal crm architecture"
```

---

## Self-Review Checklist

- Spec coverage:
  - Cross-stage employee Journal: Tasks 4, 7.
  - Tasks/events/notes/comments: Tasks 2, 4, 7.
  - Editable stage checklist from admin template: Tasks 5, 8.
  - Red client-list badges: Tasks 4, 6.
  - Browser push digest and exact reminders: Task 9.
  - Client role exclusion and journal permissions: Tasks 4, 11.
  - Legacy journal migration: Task 3.
  - Documentation: Task 11.
- Placeholder scan: plan has concrete scripts, file paths, commands, and code snippets for each implementation step.
- Type consistency:
  - Frontend uses camelCase item fields.
  - Server storage uses snake_case columns and maps through `rowToItem`.
  - Badge rule uses `dueDate`, `assigneeUserId`, `isTeamTask` on frontend and maps snake_case fallback in pure helper.
