# Security Iteration 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four confirmed audit gaps: journal reminders ignore `journal.read`, WS/push deliver messenger content to users with messenger disabled, client roles have no mandatory server-side restrictions, and the app connects to PostgreSQL as superuser.

**Architecture:** All permission checks funnel through `getPermissionsForRole(Cached)` — client-role restrictions are enforced there (runtime), in the admin routes (write-time), and in the UI (visibility). The DB least-privilege switch happens at boot: admin connection runs schema/seeds, then the exported pool facade swaps to a freshly-passworded restricted role. Push/WS delivery filters recipients by role permission before sending.

**Tech Stack:** Node/Express, pg (Pool), ws, web-push, React (Vite). Tests are `server/scripts/verify*.js` assertion scripts run against a throwaway DB via the docker compose harness (see "Test harness" below).

---

## Test harness (used by every task)

Scripts that touch schema run on a THROWAWAY DB, never the shared `2life` dev DB:

```bash
BASE_URL=$(docker compose exec -T server printenv DATABASE_URL | tr -d '\r')
T_URL="${BASE_URL%/*}/ttest"
docker compose exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS ttest;" -c "CREATE DATABASE ttest;"
docker compose run --rm --no-deps -e DATABASE_URL="$T_URL" \
  -v "$PWD/server/services:/app/services" -v "$PWD/server/scripts:/app/scripts" \
  -v "$PWD/server/routes:/app/routes" \
  server node scripts/<SCRIPT>.js
docker compose exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS ttest;"
```

Frontend: `npm run build` host-side. Each verify script must refuse to run unless `current_database()` matches `/test|ttest|throwaway/i` (copy the guard from `server/scripts/verifyIsClientFlag.js`).

---

### Task 1: Journal reminders respect `journal.read` (and exclude client roles)

**Files:**
- Modify: `server/services/journalStore.js` (functions `listUsersForJournalDigest` ~line 194, `listDueJournalReminders` ~line 216)
- Test: `server/scripts/verifyJournalReminderPerms.js`
- Modify: `server/package.json` (add script `verify:journal-reminder-perms`)

- [x] **Step 1: Write the failing test**

`server/scripts/verifyJournalReminderPerms.js`:

```js
/**
 * verifyJournalReminderPerms.js — iteration-3 task 1
 * Exact-time journal reminders must honor journal.read/write (like the digest
 * already does) and must never target client (is_client) roles.
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyJournalReminderPerms.js
 */
"use strict";
const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { listDueJournalReminders, listUsersForJournalDigest } = require("../services/journalStore");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`); process.exit(2);
  }
  await initSchema();

  // Roles: with_journal (read), no_journal (none), clientish (is_client + read)
  const mkRole = async (name, canRead, isClient) => {
    const r = await pool.query(
      "INSERT INTO roles (name, display_name, is_system, is_client) VALUES ($1,$1,false,$2) ON CONFLICT (name) DO UPDATE SET is_client=$2 RETURNING id",
      [name, isClient]);
    if (canRead != null) await pool.query(
      "INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1,'journal',$2,false) ON CONFLICT (role_id, section_id) DO UPDATE SET can_read=$2",
      [r.rows[0].id, canRead]);
    return r.rows[0].id;
  };
  await mkRole("t3_with_journal", true, false);
  await mkRole("t3_no_journal", null, false);
  await mkRole("t3_clientish", true, true);

  const mkUser = async (name, role) => (await pool.query(
    "INSERT INTO users (username, password_hash, role, active) VALUES ($1,'x',$2,true) RETURNING id",
    [name, role])).rows[0].id;
  const uYes = await mkUser("t3_u_yes", "t3_with_journal");
  const uNo = await mkUser("t3_u_no", "t3_no_journal");
  const uClient = await mkUser("t3_u_client", "t3_clientish");

  await pool.query("INSERT INTO clients (id, name) VALUES ('t3c','T3 Client') ON CONFLICT (id) DO NOTHING");
  for (const uid of [uYes, uNo, uClient]) {
    await pool.query("INSERT INTO client_assignments (user_id, client_id) VALUES ($1,'t3c') ON CONFLICT DO NOTHING", [uid]);
  }
  await pool.query(
    `INSERT INTO journal_items (client_id, type, title, status, is_team_task, due_date, due_time)
     VALUES ('t3c','task','t3 task','open',true,'2020-01-01','09:00')`);

  const due = await listDueJournalReminders("2020-01-02T00:00:00");
  const dueUsers = new Set(due.map((r) => r.user_id));
  assert.equal(dueUsers.has(uYes), true, "user WITH journal.read must get the reminder");
  assert.equal(dueUsers.has(uNo), false, "user WITHOUT journal access must NOT get the reminder");
  assert.equal(dueUsers.has(uClient), false, "client-role user must NOT get the reminder");
  console.log("✓ exact reminders honor journal.read and skip client roles");

  const digest = await listUsersForJournalDigest("2020-01-02");
  const digestUsers = new Set(digest.map((r) => r.id));
  assert.equal(digestUsers.has(uYes), true, "digest keeps user with journal.read");
  assert.equal(digestUsers.has(uClient), false, "digest must skip client roles");
  console.log("✓ digest skips client roles");
  await pool.end?.();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [x] **Step 2: Run test to verify it fails**

Run via harness. Expected: FAIL — `user WITHOUT journal access must NOT get the reminder` (current SQL has no role_sections join) — or the client-role assertion fails.

- [x] **Step 3: Fix the two queries in `journalStore.js`**

In `listDueJournalReminders`, replace the query with:

```js
const res = await pool.query(
  `SELECT ji.*, u.id AS user_id
   FROM journal_items ji
   JOIN users u ON u.active = true
   JOIN roles r ON r.name = u.role
   LEFT JOIN role_sections rs ON rs.role_id = r.id AND rs.section_id = 'journal'
   LEFT JOIN client_assignments ca ON ca.client_id = ji.client_id AND ca.user_id = u.id
   WHERE ji.deleted_at IS NULL
     AND ji.type IN ('task','event')
     AND ji.status IN ('open','in_progress','waiting_client')
     AND ji.due_date IS NOT NULL
     AND ji.due_date <= $1::date
     AND ji.due_time IS NOT NULL
     AND ((ji.due_date::text || 'T' || ji.due_time::text)::timestamp <= $1::timestamp)
     AND (ji.is_team_task = true OR ji.assignee_user_id = u.id)
     AND r.is_client = false
     AND (u.role = 'admin' OR rs.can_read = true OR rs.can_write = true)
     AND (u.role = 'admin' OR u.all_clients_access = true OR ca.user_id IS NOT NULL)`,
  [nowIso]
);
```

In `listUsersForJournalDigest`, change the joins to the same shape (JOIN roles by name, LEFT JOIN role_sections) and add `AND r.is_client = false`. Keep the existing admin OR-branches. Note: the digest currently INNER-JOINs `role_sections` which silently drops admins without a journal row — the LEFT JOIN + OR shape fixes that too.

- [x] **Step 4: Run test to verify it passes** (harness). Expected: 2 ✓ lines, exit 0.

- [x] **Step 5: Also run existing** `verify:journal-notifications` (root package.json) to catch regressions, then commit:

```bash
git add server/services/journalStore.js server/scripts/verifyJournalReminderPerms.js server/package.json
git commit -m "security: journal exact reminders honor journal.read and skip client roles"
```

---

### Task 2: messenger.read gates WS delivery and push

**Files:**
- Modify: `server/services/ws.js` (`sendTo` ~line 32, `broadcastToChat` ~line 79)
- Modify: `server/services/messengerPush.js` (`sendPrivateMessagePush`)
- Test: `server/scripts/verifyMessengerReadDelivery.js`
- Modify: `server/package.json` (script `verify:messenger-read-delivery`)

- [x] **Step 1: Add the role filter to messengerPush.js (exported for tests)**

```js
const { getPermissionsForRoleCached } = require("./permissions");
const { pool } = require("./db");

// Drop recipients whose role has messenger.read disabled (admin always passes).
// Mirrors the HTTP requireSectionRead("messenger") gate for WS/push delivery.
async function filterMessengerReadUserIds(userIds) {
  const ids = Array.from(new Set((userIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (!ids.length) return [];
  const r = await pool.query("SELECT id, role FROM users WHERE id = ANY($1) AND active = true", [ids]);
  const out = [];
  for (const row of r.rows) {
    if (row.role === "admin") { out.push(row.id); continue; }
    const perms = await getPermissionsForRoleCached(row.role);
    if (perms?.sections?.messenger?.read) out.push(row.id);
  }
  return out;
}
```

Inside `sendPrivateMessagePush`, before building devices: `const allowedUserIds = await filterMessengerReadUserIds(userIds);` and use `allowedUserIds` downstream. Export `filterMessengerReadUserIds`.

- [x] **Step 2: Gate WS chat delivery in ws.js**

Add next to `canWriteMessenger` (module scope, near `sendTo`):

```js
const canRoleReadMessenger = async (role) => {
  if (role === "admin") return true;
  const perms = await getPermissionsForRoleCached(role);
  return !!perms?.sections?.messenger?.read;
};

// Chat payloads only — control frames (force logout, pong) keep using sendTo.
const sendChatPayloadTo = async (userId, payload) => {
  const set = connections.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.user?.jti && isBlacklisted(ws.user.jti)) {
      try { ws.close(4401, "token_revoked"); } catch (_) {}
      continue;
    }
    if (!(await canRoleReadMessenger(ws.user?.role))) continue;
    if (ws.readyState === 1 /* OPEN */) ws.send(data);
  }
};
```

`broadcastToChat` switches `sendTo(p.user_id, payload)` → `await sendChatPayloadTo(p.user_id, payload)`. Export `sendChatPayloadTo` alongside `broadcastToChat`. Check other `sendTo` call sites: anything delivering chat/messenger payloads (e.g. `messengerAccessNotifications` if it uses ws.sendTo) switches too; force-logout/system frames stay on `sendTo`.

- [x] **Step 3: Write the test** `server/scripts/verifyMessengerReadDelivery.js` (throwaway DB):

```js
"use strict";
const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { filterMessengerReadUserIds } = require("../services/messengerPush");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) { console.error(`REFUSING non-throwaway '${dbName}'`); process.exit(2); }
  await initSchema();

  const mkRole = async (name, read) => {
    const r = await pool.query("INSERT INTO roles (name, display_name) VALUES ($1,$1) ON CONFLICT (name) DO UPDATE SET name=$1 RETURNING id", [name]);
    await pool.query(
      "INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1,'messenger',$2,$2) ON CONFLICT (role_id, section_id) DO UPDATE SET can_read=$2, can_write=$2",
      [r.rows[0].id, read]);
  };
  await mkRole("t3m_reader", true);
  await mkRole("t3m_muted", false);
  const mkUser = async (n, role) => (await pool.query(
    "INSERT INTO users (username, password_hash, role, active) VALUES ($1,'x',$2,true) RETURNING id", [n, role])).rows[0].id;
  const reader = await mkUser("t3m_reader_u", "t3m_reader");
  const muted = await mkUser("t3m_muted_u", "t3m_muted");
  const admin = await mkUser("t3m_admin_u", "admin");
  const inactive = (await pool.query(
    "INSERT INTO users (username, password_hash, role, active) VALUES ('t3m_off','x','t3m_reader',false) RETURNING id")).rows[0].id;

  const got = await filterMessengerReadUserIds([reader, muted, admin, inactive, 999999]);
  assert.deepEqual(new Set(got), new Set([reader, admin]),
    "only active users whose role has messenger.read (or admin) survive the filter");
  console.log("✓ push recipient filter honors messenger.read");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [x] **Step 4: Run via harness** — expected PASS (filter built test-first against new code). Grep check no chat payload path bypasses: `grep -n 'sendTo(' server/services/*.js` — every hit is either control-frame or switched.

- [x] **Step 5: Run existing messenger verifies** (`verify:messenger-access`, `verify:messenger-push` in server/package.json) + commit:

```bash
git add server/services/ws.js server/services/messengerPush.js server/scripts/verifyMessengerReadDelivery.js server/package.json
git commit -m "security: WS delivery and push honor messenger.read (REST parity)"
```

---

### Task 3: Client roles — mandatory server-side restrictions

Hard rules for `is_client` roles: no `journal` section, no action permissions (`create_client`/`delete_client`/`import_data`), and users carrying a client role can never have `all_clients_access`.

**Files:**
- Create: `server/services/clientRoleGuard.js`
- Modify: `server/services/permissions.js` (`getPermissionsForRole`)
- Modify: `server/routes/admin.js` (PATCH `/admin/roles/:id` ~line 113, PUT `/admin/roles/:id/sections` ~line 172)
- Modify: `server/routes/auth.js` (PATCH `/admin/users/:id` ~line 364)
- Test: `server/scripts/verifyClientRoleHardLimits.js`
- Modify: `server/package.json` (script `verify:client-role-hard-limits`)

- [x] **Step 1: Runtime strip in permissions.js** — in `getPermissionsForRole`, before the non-admin `return`:

```js
const isClient = !!r.rows[0].is_client;
if (isClient) {
  // Hard floor for client (patient) roles: even if DB rows grant these, the
  // resolved permission object never exposes journal or admin-grade actions.
  delete sectionsObj.journal;
  perms["create_client"] = false;
  perms["delete_client"] = false;
  perms["import_data"] = false;
}
```

(keep the existing return, with `canCreateClient: !!perms['create_client']` etc. now naturally false).

- [x] **Step 2: Create `server/services/clientRoleGuard.js`**

```js
const { LEGACY_ALIASES } = require("./roleFlags"); // export it from roleFlags
const BLOCKED_CLIENT_SECTIONS = new Set(["journal"]);
const BLOCKED_CLIENT_PERMISSIONS = new Set(["create_client", "delete_client", "import_data"]);

const roleNameVariants = (name) => {
  const n = String(name || "").trim().toLowerCase();
  const alias = LEGACY_ALIASES[n];
  return alias ? [n, alias] : [n];
};

// Strips grants a client role must never hold. Runs inside the caller's
// transaction; returns user ids whose all_clients_access was revoked so the
// caller can re-sync chat access.
const stripClientRoleDangerousGrants = async (db, role) => {
  await db.query("DELETE FROM role_sections WHERE role_id = $1 AND section_id = ANY($2)",
    [role.id, [...BLOCKED_CLIENT_SECTIONS]]);
  await db.query("DELETE FROM role_permissions WHERE role_id = $1 AND permission = ANY($2)",
    [role.id, [...BLOCKED_CLIENT_PERMISSIONS]]);
  const r = await db.query(
    "UPDATE users SET all_clients_access = false WHERE all_clients_access = true AND LOWER(TRIM(role)) = ANY($1) RETURNING id",
    [roleNameVariants(role.name)]);
  return r.rows.map((row) => row.id);
};

module.exports = { stripClientRoleDangerousGrants, BLOCKED_CLIENT_SECTIONS, BLOCKED_CLIENT_PERMISSIONS };
```

In `roleFlags.js` add `LEGACY_ALIASES` to module.exports.

- [x] **Step 3: Enforce in admin.js**

PATCH `/admin/roles/:id`, in the `hasIsClient && isClient === true` branch — wrap in `withTransaction`: call `stripClientRoleDangerousGrants(db, role)` + `updateRoleIsClient(true, roleId)` together; after commit, `syncUserChatAccessByClientPermissions` (own transaction per user, reuse the route's existing pattern via a loop) + `notifyUserChatAccessChanges` for each returned user id; keep existing cache invalidation + `sseBroadcast("permissions-updated", { roleName: role.name })`.

PUT `/admin/roles/:id/sections`, after `getRoleById`: if `role.is_client`, reject blocked keys:

```js
if (role.is_client) {
  const badSections = Object.keys(sections || {}).filter((s) => BLOCKED_CLIENT_SECTIONS.has(s));
  const badPerms = Object.keys(permissions || {}).filter((p) => BLOCKED_CLIENT_PERMISSIONS.has(p) && permissions[p]);
  if (badSections.length || badPerms.length) {
    return res.status(400).json({ error: "Эти права недоступны клиентской роли", code: "CLIENT_ROLE_RESTRICTED", badSections, badPerms });
  }
}
```

- [x] **Step 4: Enforce in auth.js PATCH `/admin/users/:id`** (inside the existing transaction, before the UPDATEs):

```js
const { isClientRoleName } = require("../services/roleFlags");
const effectiveRole = role != null ? role : (await client.query("SELECT role FROM users WHERE id=$1", [id])).rows[0]?.role;
const effectiveIsClient = await isClientRoleName(effectiveRole);
if (all_clients_access && effectiveIsClient) {
  await client.query("ROLLBACK");
  return res.status(400).json({ error: "Клиентской роли нельзя выдать доступ ко всем клиентам", code: "CLIENT_ROLE_RESTRICTED" });
}
```

and in the `role != null` branch, when the NEW role is a client role, force the flag off in the same statement: `UPDATE users SET role = $1, all_clients_access = CASE WHEN $3 THEN false ELSE all_clients_access END WHERE id = $2` with `[role, id, effectiveIsClient]`.

- [x] **Step 5: Test** `server/scripts/verifyClientRoleHardLimits.js` (throwaway DB): seed a role with journal rows + create_client + a user with `all_clients_access=true`; assert (1) `getPermissionsForRole` returns no journal section and `canCreateClient === false` once `is_client=true`; (2) `stripClientRoleDangerousGrants` deletes the rows and returns the user id, user flag now false; (3) `isClientRoleName` alias variant covered (role named `client`, user role `viewer`). Run via harness — expect FAIL before Steps 1-4 are in, PASS after.

- [x] **Step 6: Run existing** `verify:permissions`, `verify:is-client` equivalents (server/package.json) + commit:

```bash
git add server/services/clientRoleGuard.js server/services/permissions.js server/services/roleFlags.js server/routes/admin.js server/routes/auth.js server/scripts/verifyClientRoleHardLimits.js server/package.json
git commit -m "security: hard server-side floor for client roles (no journal/actions/all-clients)"
```

---

### Task 4: Client roles — hide restricted checkboxes in the admin UI

**Files:**
- Modify: `src/components/AdminSectionPanel.jsx` (role card ~lines 1089-1131, users tab ~line 871)

- [x] **Step 1: Role card.** Sections table: render `ALL_SECTIONS.filter(sec => !(role.isClient && sec === "journal"))`. The "Права" header + `ALL_PERMISSIONS` block: wrap in `{!role.isClient && (...)}` with a small hint when hidden: `Клиентская роль: журнал и административные права недоступны`.

- [x] **Step 2: Toggle behavior.** `handleToggleRoleIsClient` already refetches roles after PATCH — verify the stripped state renders (checkboxes reappear unchecked after un-marking, per the server now storing no rows). Also clear `pendingRoleChanges[roleId]` on toggle so stale hidden checkboxes are not resubmitted:

```js
setPendingRoleChanges(prev => { const n = { ...prev }; delete n[id]; return n; });
```

- [x] **Step 3: Users tab.** Where the all-clients toggle renders (`hasAllClientsAccess`, ~line 871): if the user's role is a client role, render a muted dash instead of the control. Use the `is_client` field listUsers already exposes (`u.is_client`), not a rolesData name lookup (avoids the client↔viewer alias pitfall).

- [x] **Step 4: Build + static checks**

Run: `npm run build` and `npm run verify:client-role-perms`. Expected: build OK, verify PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/AdminSectionPanel.jsx
git commit -m "ui: hide journal/action/all-clients controls for client roles"
```

---

### Task 5: Least-privilege DB role for the app

Boot still connects as the configured (admin) user for schema/seeds; after init the exported pool facade switches to role `app_2life` — `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, table DML + sequences only, fresh random password every boot (nothing stored, nothing for the operator to configure). On any failure it logs and stays on the admin connection (never blocks boot).

**Files:**
- Modify: `server/services/db.js` (pool construction, new `ensureAppDbRole`)
- Modify: `server/index.js` (`start()` ~line 71)
- Modify: `server/services/messengerReset.js` (~line 142: drop `RESTART IDENTITY`)
- Test: `server/scripts/verifyAppDbRole.js`
- Modify: `server/package.json` (script `verify:app-db-role`)

- [x] **Step 1: Pool facade in db.js.** Replace the top of db.js:

```js
const { Pool } = require("pg");
const crypto = require("crypto");

const ADMIN_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/2life";
const adminPool = new Pool({ connectionString: ADMIN_URL });
adminPool.on("error", (err) => console.error("[pg pool] idle client error:", err.message));

let activePool = adminPool; // swapped to the restricted role after boot init

// Stable facade: modules destructure { pool } at require-time, so the switch
// must happen behind one object rather than by reassigning the export.
const pool = {
  query: (...args) => activePool.query(...args),
  connect: (...args) => activePool.connect(...args),
  on: (...args) => activePool.on(...args),
  end: async () => { if (activePool !== adminPool) await activePool.end(); await adminPool.end(); },
};
```

Audit all `pool.` member uses in the codebase (`grep -rn 'pool\.\w' server --include='*.js' | grep -v node_modules | grep -oE 'pool\.\w+' | sort -u`) and extend the facade if anything beyond query/connect/on/end appears.

- [x] **Step 2: `ensureAppDbRole` in db.js** (export it):

```js
const APP_DB_ROLE = "app_2life";
const quoteIdent = (s) => '"' + String(s).replace(/"/g, '""') + '"';

const ensureAppDbRole = async () => {
  if (process.env.APP_DB_ROLE === "off") return { switched: false, reason: "disabled by APP_DB_ROLE=off" };
  try {
    const url = new URL(ADMIN_URL);
    const dbName = decodeURIComponent(url.pathname.slice(1));
    const password = crypto.randomBytes(24).toString("base64url"); // URL-safe, no quotes
    const ident = quoteIdent(APP_DB_ROLE);
    const exists = await adminPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_DB_ROLE]);
    if (!exists.rows.length) await adminPool.query(`CREATE ROLE ${ident} LOGIN`);
    await adminPool.query(`ALTER ROLE ${ident} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`);
    await adminPool.query(`GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${ident}`);
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${ident}`);
    // TRUNCATE: messenger full-reset uses it; same blast radius as DELETE.
    await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO ${ident}`);
    await adminPool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ident}`);

    const appUrl = new URL(ADMIN_URL);
    appUrl.username = APP_DB_ROLE;
    appUrl.password = password;
    const candidate = new Pool({ connectionString: appUrl.toString() });
    await candidate.query("SELECT 1"); // smoke-test before switching
    candidate.on("error", (err) => console.error("[pg pool] idle client error:", err.message));
    activePool = candidate;
    console.log(`[db] switched runtime pool to least-privilege role '${APP_DB_ROLE}'`);
    return { switched: true };
  } catch (e) {
    console.warn("[db] least-privilege role unavailable, staying on admin connection:", e.message);
    return { switched: false, reason: e.message };
  }
};
```

- [x] **Step 3: Call it at the right boot moment** in `server/index.js` `start()` — after ALL admin-needing init, right before `appReady = true`:

```js
await initDefaultDeficitPresets();
const { ensureAppDbRole } = require("./services/db");
await ensureAppDbRole();   // non-fatal: falls back to admin connection on failure
appReady = true;
```

(Schema/seeds/runOnce/backfill all run before this line on every boot, so future migrations still run as admin. `pg_dump` backup reads `DATABASE_URL` env directly — unaffected.)

- [x] **Step 4: messengerReset.js** — `TRUNCATE ... RESTART IDENTITY` needs sequence ownership the app role lacks. Drop `RESTART IDENTITY` (ids simply continue — reset semantics unaffected) and reset explicitly where a sequence exists:

```js
await client.query(`TRUNCATE TABLE ${existingTables.map(quoteIdentifier).join(", ")}`);
for (const t of existingTables) {
  await client.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)
     WHERE pg_get_serial_sequence($1, 'id') IS NOT NULL`, [t]);
}
```

(`setval` needs UPDATE on sequences — granted in Step 2.)

- [x] **Step 5: Test** `server/scripts/verifyAppDbRole.js` (throwaway DB): `initSchema()`; `ensureAppDbRole()` → assert `switched === true`; then through the exported `pool`: `SELECT 1` ok; INSERT into `roles` ok; `CREATE TABLE t3_x` REJECTED; `DROP TABLE users` REJECTED; `TRUNCATE chat_participants` ok; `pg_roles` row shows `rolsuper=false, rolbypassrls=false`. Also `APP_DB_ROLE=off` path returns `{switched:false}`. Run via harness (script-level, against ttest).

- [x] **Step 6: Boot smoke test on a throwaway DB** — run the real server entry with mounted code against ttest, assert clean readiness:

```bash
docker compose run --rm --no-deps -e DATABASE_URL="$T_URL" -e PORT=3009 \
  -v "$PWD/server/services:/app/services" -v "$PWD/server/routes:/app/routes" \
  -v "$PWD/server/index.js:/app/index.js" -v "$PWD/server/middleware:/app/middleware" \
  server sh -c "node index.js & sleep 8; wget -qO- http://localhost:3009/api/health; kill %1"
```

Expected output contains `[db] switched runtime pool` and health JSON.

- [x] **Step 7: Commit**

```bash
git add server/services/db.js server/index.js server/services/messengerReset.js server/scripts/verifyAppDbRole.js server/package.json
git commit -m "security: runtime DB pool runs as least-privilege app role (DML-only, random per-boot password)"
```

---

### Task 6: Regression sweep + push

- [x] **Step 1:** Run the iter1/iter2 suites against a throwaway DB: `verify:security-hardening` (root), `verify:client-role-perms` (root), `verify:journal-notifications` (root), server-side `verify:permissions`, `verify:migrations`, plus all four new scripts.
- [x] **Step 2:** `npm run build` host-side. Expected: success.
- [x] **Step 3:** `git push` (single push of the 5 commits). Deployment stays manual per the operator's process (pg_dump → git pull → compose up --build).

## Self-review notes

- Spec coverage: audit items — journal reminders (Task 1), WS/push messenger.read (Task 2), client-role mandatory floor incl. UI hide/return-on-toggle (Tasks 3-4), least-privilege DB key with zero operator friction (Task 5). Out of scope by agreement: RLS, TOCTOU client create, SSE id leak, doctors list exposure, lost-update UI races (next iterations).
- Type consistency: `stripClientRoleDangerousGrants(db, role)` matches its only caller (admin.js PATCH); `filterMessengerReadUserIds` exported and used by test + `sendPrivateMessagePush`; facade pool keeps `{query,connect,on,end}` shape that `withTransaction`/scripts rely on.
- The `users` UPDATE in auth.js role-branch changes signature to 3 params — double-check param order `[role, id, effectiveIsClient]` matches `$1/$2/$3` in the SQL.
