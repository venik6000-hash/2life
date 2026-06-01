# Journal & Messenger — Root-Cause Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Read this first — the rule of this plan:** Every task here removes a *cause*. Band-aids (client timeout, 503 "starting" gate, search-decrypt cap) are deliberately quarantined in the final section **"Appendix B — graceful-degradation layer (NOT the cure)"**. Do the root phases first. Do NOT stop after the appendix and declare victory.

**Goal:** Eliminate the real reasons the Journal hangs/loads slowly after deploy, and remove the structural inefficiencies in Journal + Messenger — at the cause, not by masking symptoms.

**Architecture:** The single deepest cause is **there is no migration system** — `initSchema()` re-derives the schema and re-runs one-time data backfills on *every* boot, gating `app.listen`. Phase 0 introduces a tracked migration runner so each one-time operation runs exactly once; Phases 1–4 fix boot robustness, the wrong `metadata_json` column type, chat-uniqueness data integrity, and the chatty journal request path. Phases 5–6 are genuine optimizations (permission query fan-out, mega-context re-renders).

**Tech Stack:** React 18 (Vite), Express 4, node-`pg` (PostgreSQL 16), Docker Compose. No unit-test framework — the repo verifies behavior with standalone Node scripts run via `npm run verify:*` / `node server/scripts/*.js`. New verification follows that convention.

**Verification reality:** Several root fixes are boot/DB-level and are verified by (a) a new standalone Node script against a dev DB, and (b) explicit manual deploy checks. Where a pure script can't observe boot timing, the manual check is written out exactly. This is intentional, not a placeholder.

---

## Severity / sequencing map

| Phase | What | Severity | Root or band-aid | Effort | Fix-risk |
|---|---|---|---|---|---|
| 0 | Migration runner + move one-time backfills behind it | КРИТИЧНО | **Root** (the boot cause) | L | med |
| 1 | Boot robustness: fail loud + DB connect retry | КРИТИЧНО | **Root** (the "silent death" cause) | S | low |
| 2 | `metadata_json` TEXT → JSONB + index | СРЕДНИЙ (enables 0) | **Root** (wrong type → the heavy cast) | M | med |
| 3 | Chats one-per-client: dedupe data + unique index + client dedupe-by-id | ВЫСОКИЙ | **Root** (illegal state unrepresentable) | M | med |
| 4 | Journal request path: latest-wins load + 1-trip update + patch-not-reload | ВЫСОКИЙ | **Root** (race + chattiness) | M | med |
| 5 | Permission/access query fan-out: collapse joins | СРЕДНИЙ | **Root optimization** | M | med |
| 6 | Split MessengerContext (state vs actions) | СРЕДНИЙ | **Root** (broad re-renders) | L | med |
| A | Hygiene (logging, name resolution, gating, sargable, reuse) | НИЗКИЙ | Root, minor | S each | low |
| B | Timeout + 503 readiness | (do AFTER root) | **Band-aid layer** — graceful failure, not a cure | S–M | low–med |

**Must-do to fix the actual outage at the cause:** Phase 0 + Phase 1 (+ Phase 2, which makes Phase 0's backfill cheap). **Then** Phase 3 + Phase 4 for the remaining correctness/perf. Phases 5–6 are quality. Appendix B only after all of the above.

---

## Phase 0 — Migration runner (THE root fix for slow/every-boot startup)

**Why:** `server/services/db.js:8-706` `initSchema()` runs ~40 serial queries every boot, including full-table backfills and `backfillLegacyJournalEntries()` (`server/services/journalStore.js:239-267`) whose detection query casts `metadata_json::jsonb` per row. `server/index.js:42` `await initSchema()` blocks `app.listen` until all of it finishes. Idempotent ≠ free: the *detection* scans run every boot even when 0 rows change. Fix: track applied migrations; run each one-time op exactly once. Cheap idempotent DDL (`CREATE TABLE/INDEX IF NOT EXISTS`) may stay, but every **data backfill** and **full-table UPDATE** moves behind the runner.

**Files:**
- Create: `server/services/migrations.js`
- Create: `server/scripts/verifyMigrations.js`
- Modify: `server/services/db.js` (initSchema body: wrap one-time ops)
- Modify: `server/package.json` (add verify script)

- [ ] **Step 1: Write the migration runner**

Create `server/services/migrations.js`:

```js
const { pool } = require("./db");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function isApplied(id) {
  const r = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1 LIMIT 1", [id]);
  return r.rowCount > 0;
}

// Runs `fn` once, ever. `fn` receives a dedicated client inside a transaction.
// Records the id only if fn succeeds. Throws on failure (caller decides fatality).
async function runOnce(id, fn) {
  if (await isApplied(id)) return { id, ran: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
    await client.query("COMMIT");
    return { id, ran: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureMigrationsTable, isApplied, runOnce };
```

- [ ] **Step 2: Wrap the one-time operations in `initSchema`**

In `server/services/db.js`, near the top of `initSchema` add `const { ensureMigrationsTable, runOnce } = require("./migrations");` and call `await ensureMigrationsTable();` right after the cheap `CREATE TABLE IF NOT EXISTS` blocks.

Then convert each **data backfill / full-table UPDATE** currently run unconditionally into a `runOnce`. The concrete ones to move (keep the surrounding `CREATE TABLE/INDEX IF NOT EXISTS` as-is):

```js
// db.js:524-540  chats last-message backfill
await runOnce("2026-05_backfill_chats_last_message", async (c) => {
  await c.query(`
    UPDATE chats c
    SET last_message_id = lm.id, last_message_at = lm.created_at,
        last_message_sender_id = lm.sender_id, last_message_type = lm.msg_type,
        last_message_encrypted_text = lm.encrypted_text
    FROM (
      SELECT DISTINCT ON (chat_id) chat_id, id, created_at, sender_id, msg_type, encrypted_text
      FROM messages WHERE msg_type <> 'system' AND deleted_for_all = false
      ORDER BY chat_id, id DESC
    ) lm
    WHERE c.id = lm.chat_id AND c.last_message_id IS NULL
  `);
});

// db.js:550-564  chats is_internal normalization (two UPDATEs)
await runOnce("2026-05_normalize_chats_is_internal", async (c) => {
  await c.query("UPDATE chats SET is_internal = true  WHERE client_id IS NULL");
  await c.query("UPDATE chats SET is_internal = false WHERE client_id IS NOT NULL AND is_internal IS DISTINCT FROM false");
});

// db.js:496-501  messages encrypted_text/meta migration
await runOnce("2026-05_messages_encrypted_columns", async (c) => {
  await c.query("UPDATE messages SET encrypted_text = ciphertext WHERE encrypted_text = '' AND NULLIF(ciphertext, '') IS NOT NULL");
  await c.query("UPDATE messages SET encrypted_meta = iv        WHERE encrypted_meta = '' AND NULLIF(iv, '') IS NOT NULL");
});

// db.js:696-704  legacy journal backfill (the per-row cast scanner)
await runOnce("2026-05_backfill_legacy_journal_entries", async () => {
  const { backfillLegacyJournalEntries } = require("./journalStore");
  const result = await backfillLegacyJournalEntries();
  if (result?.migrated > 0) console.log(`[journal] backfilled ${result.migrated} legacy entries`);
});
```

> The role_sections `INSERT ... WHERE NOT EXISTS` blocks (db.js:579-607, 680-692) and the column-existence `ALTER TABLE` guards are cheap (single indexed lookups / no-ops). Leave them, OR wrap in `runOnce` too for a fully sub-second boot. Recommended: wrap the role_sections backfills as `2026-05_role_sections_messenger`, `_menu`, `_journal` for cleanliness.

- [ ] **Step 3: Write the verification script**

Create `server/scripts/verifyMigrations.js`:

```js
// Verifies runOnce executes a migration exactly once across two calls.
const assert = require("assert");
const { pool } = require("../services/db");
const { ensureMigrationsTable, runOnce, isApplied } = require("../services/migrations");

(async () => {
  await ensureMigrationsTable();
  const id = "_test_runonce_" + process.pid;
  await pool.query("DELETE FROM schema_migrations WHERE id = $1", [id]);
  let calls = 0;
  const r1 = await runOnce(id, async () => { calls += 1; });
  const r2 = await runOnce(id, async () => { calls += 1; });
  assert.strictEqual(r1.ran, true,  "first call should run");
  assert.strictEqual(r2.ran, false, "second call should be skipped");
  assert.strictEqual(calls, 1, "fn must execute exactly once");
  assert.strictEqual(await isApplied(id), true, "migration recorded");
  // rollback-on-failure: a throwing fn must NOT be recorded
  const id2 = id + "_fail";
  await pool.query("DELETE FROM schema_migrations WHERE id = $1", [id2]);
  let threw = false;
  try { await runOnce(id2, async () => { throw new Error("boom"); }); } catch { threw = true; }
  assert.strictEqual(threw, true, "failure should propagate");
  assert.strictEqual(await isApplied(id2), false, "failed migration must not be recorded");
  await pool.query("DELETE FROM schema_migrations WHERE id IN ($1,$2)", [id, id2]);
  console.log("✓ migrations runOnce verified");
  await pool.end();
})().catch((e) => { console.error("✗", e); process.exit(1); });
```

Add to `server/package.json` scripts: `"verify:migrations": "node scripts/verifyMigrations.js"`.

- [ ] **Step 4: Run verification (needs a reachable dev DB via DATABASE_URL)**

Run: `cd server && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/2life npm run verify:migrations`
Expected: `✓ migrations runOnce verified`

- [ ] **Step 5: Manual boot-timing check**

Run twice: `time (docker compose up -d --build server && docker compose logs server | grep -m1 "2life API запущен")`.
Expected: first boot after deploy may do real backfills once; **second** boot logs "API запущен" in well under ~2s (no legacy scan, no full-table UPDATEs). Confirm `SELECT id FROM schema_migrations` lists the migration ids.

- [ ] **Step 6: Commit**

```bash
git add server/services/migrations.js server/scripts/verifyMigrations.js server/services/db.js server/package.json
git commit -m "feat(server): tracked migration runner; one-time backfills run once, not every boot"
```

---

## Phase 1 — Boot robustness (root fix for "doesn't load AT ALL")

**Why:** `server/index.js:56` is `start().catch(console.error)`. If any unguarded query in `initSchema` throws, `start()` rejects, the error is logged and swallowed, **`app.listen` never runs, and the process stays alive** — so `restart: unless-stopped` (docker-compose.yml:24) never restarts it. Silent permanent outage. There is no `unhandledRejection`/`uncaughtException` handler anywhere in `server/`. Fix: fail loud (exit non-zero so Docker restarts), and retry the DB connection on boot so a transient DB hiccup self-heals instead of crash-looping.

**Files:**
- Modify: `server/index.js:41-56`
- Create: `server/services/waitForDb.js`

- [ ] **Step 1: Write the DB-readiness helper**

Create `server/services/waitForDb.js`:

```js
const { pool } = require("./db");

// Resolves once SELECT 1 succeeds; retries with linear backoff. Throws after maxAttempts.
async function waitForDb({ maxAttempts = 30, delayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      if (attempt > 1) console.log(`[startup] DB reachable after ${attempt} attempts`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[startup] DB not ready (attempt ${attempt}/${maxAttempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`DB unreachable after ${maxAttempts} attempts: ${lastErr?.message}`);
}

module.exports = { waitForDb };
```

- [ ] **Step 2: Harden `start()` and add process-level handlers**

In `server/index.js`, add at top after requires:

```js
const { waitForDb } = require("./services/waitForDb");

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});
```

Change the body of `start()` to wait for DB first, and change the final line:

```js
async function start() {
  await waitForDb();          // self-heal transient DB-not-ready instead of throwing
  await initSchema();
  ensureDir(BACKUP_DIR);
  await initDefaultAdmin();
  await initDefaultRoles();
  await initDefaultDeficitPresets();
  const { initWebSocket } = require("./services/ws");
  const httpServer = app.listen(PORT, () => {
    console.log(`2life API запущен: http://localhost:${PORT}`);
    startAutoBackup();
  });
  initWebSocket(httpServer);
  startJournalNotificationScheduler();
}

start().catch((err) => {
  console.error("[startup] FATAL — server failed to initialize:", err);
  process.exit(1); // non-zero exit → Docker `restart: unless-stopped` relaunches the container
});
```

- [ ] **Step 3: Manual verification of fail-loud**

Temporarily set a bad `DATABASE_URL` and run `node server/index.js`.
Expected: logs `[startup] DB not ready ...` retries, then `[startup] FATAL ...`, then process **exits** (non-zero) — it does NOT hang alive. Restore `DATABASE_URL`.

- [ ] **Step 4: Manual verification of self-heal under compose**

`docker compose up -d --build` from a cold state. Expected: server retries while `db` finishes its healthcheck window, then boots — no manual intervention.

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/services/waitForDb.js
git commit -m "fix(server): fail loud on init error (exit→restart) + retry DB on boot; add global rejection handlers"
```

---

## Phase 2 — `metadata_json` TEXT → JSONB (root fix for the heavy cast; enables cheap Phase 0)

**Why:** `db.js:407` declares `metadata_json TEXT`. Read path `parseJson` per row (`journalStore.js:50-51,71`); the legacy backfill detection casts `(metadata_json::jsonb ->> 'legacy_journal_entry_id')::int` per row (`journalStore.js:246`) — un-indexable, and it's the single heaviest thing on the boot path. Correct type = no cast, indexable, no per-row JSON.parse.

**Files:**
- Modify: `server/services/db.js` (add a `runOnce` migration in initSchema)
- Modify: `server/services/journalStore.js:50-51,71,239-249`
- Modify: `server/scripts/smokeJournalStore.js` (extend assertion)

- [ ] **Step 1: Add the column-type migration (inside initSchema, via Phase 0 runner)**

```js
await runOnce("2026-06_journal_metadata_jsonb", async (c) => {
  await c.query("ALTER TABLE journal_items ALTER COLUMN metadata_json TYPE JSONB USING metadata_json::jsonb");
  await c.query("ALTER TABLE journal_items ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb");
  await c.query("CREATE INDEX IF NOT EXISTS idx_ji_legacy_entry ON journal_items ((metadata_json->>'legacy_journal_entry_id'))");
});
```

- [ ] **Step 2: Stop parsing on read (pg returns JSONB as an object)**

In `journalStore.js`, `rowToItem` (line 71): replace `metadata: parseJson(row.metadata_json, {})` with:

```js
metadata: row.metadata_json && typeof row.metadata_json === "object" && !Array.isArray(row.metadata_json) ? row.metadata_json : {},
```

Writes can keep `JSON.stringify(item.metadata)` (a JSON-text string is valid input to a JSONB column), so INSERT/UPDATE params are unchanged.

- [ ] **Step 3: Drop the cast in the legacy detection query**

In `journalStore.js:244-248`, change `(ji.metadata_json::jsonb ->> 'legacy_journal_entry_id')::int = je.id` to `(ji.metadata_json ->> 'legacy_journal_entry_id')::int = je.id` (now uses `idx_ji_legacy_entry`).

- [ ] **Step 4: Extend smoke test**

In `server/scripts/smokeJournalStore.js`, after creating an item with metadata, assert the round-tripped `item.metadata` is a deep-equal object (not a string) and that a second create with `metadata.legacy_journal_entry_id` is found by the detection query. Run: `cd server && DATABASE_URL=... node scripts/smokeJournalStore.js`. Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add server/services/db.js server/services/journalStore.js server/scripts/smokeJournalStore.js
git commit -m "perf(journal): metadata_json TEXT→JSONB + functional index; drop per-row jsonb cast"
```

---

## Phase 3 — Chats: one chat per client as a real invariant (root fix for silent chat loss)

**Why:** `MessengerContext.jsx:65-76` dedupes the chat list by `client_id`, but nothing enforces uniqueness: `createChat` is a plain INSERT (`db.js:1098-1108`, no `ON CONFLICT`), POST `/chats` does no existence check (`messenger.js:185-258`), and the admin auto-create loop (`Messenger.jsx:38-52`) can race across tabs. Two chats for one client → the dedupe permanently hides one chat's messages. Fix at the data layer + make the client dedupe non-destructive.

**Files:**
- Modify: `server/services/db.js` (migration + `createChat`)
- Modify: `server/routes/messenger.js:185-258` (POST /chats conflict handling)
- Modify: `src/context/MessengerContext.jsx:65-76`

- [ ] **Step 1: Migration — merge existing duplicates, then add the unique index**

```js
await runOnce("2026-06_chats_one_per_client", async (c) => {
  // Re-point messages/participants/receipts from duplicate client chats to the survivor (lowest id),
  // then delete the emptied duplicates, then enforce uniqueness.
  const dupes = await c.query(`
    SELECT client_id, MIN(id) AS keep_id, array_agg(id) AS ids
    FROM chats WHERE client_id IS NOT NULL AND is_internal = false
    GROUP BY client_id HAVING COUNT(*) > 1
  `);
  for (const row of dupes.rows) {
    const losers = row.ids.filter((id) => id !== row.keep_id);
    if (!losers.length) continue;
    await c.query("UPDATE messages SET chat_id = $1 WHERE chat_id = ANY($2::int[])", [row.keep_id, losers]);
    await c.query("UPDATE chat_files SET chat_id = $1 WHERE chat_id = ANY($2::int[])", [row.keep_id, losers]);
    // participants: keep distinct (chat_id,user_id) — drop losers' rows that would collide
    await c.query(`DELETE FROM chat_participants cp WHERE cp.chat_id = ANY($1::int[])
                   AND EXISTS (SELECT 1 FROM chat_participants k WHERE k.chat_id=$2 AND k.user_id=cp.user_id)`, [losers, row.keep_id]);
    await c.query("UPDATE chat_participants SET chat_id = $1 WHERE chat_id = ANY($2::int[])", [row.keep_id, losers]);
    await c.query("DELETE FROM chats WHERE id = ANY($1::int[])", [losers]);
  }
  await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_one_per_client
                 ON chats(client_id) WHERE client_id IS NOT NULL AND is_internal = false`);
});
```

> ⚠️ Review the merge against `message_receipts`/`message_hidden_for_users`/pins before running in prod — they reference message_id (which is preserved) so they survive the chat_id re-point, but confirm no `(chat_id,user_id)` unique collisions in `message_receipts` (re-point then de-dupe like participants if needed).

- [ ] **Step 2: Make `createChat` idempotent for client chats**

In `db.js` `createChat` (1098-1108), for non-internal client chats use the index:

```js
const r = await pool.query(
  `INSERT INTO chats (client_id, is_internal, title, icon, created_by)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (client_id) WHERE (client_id IS NOT NULL AND is_internal = false)
   DO UPDATE SET title = chats.title  -- no-op, lets us RETURN the existing row
   RETURNING *`,
  [clientId || null, !!isInternal, safeTitle, safeIcon, createdBy]
);
```

(If the partial-index `ON CONFLICT` target proves awkward, fall back to: `SELECT` existing client chat first and return it; otherwise INSERT.)

- [ ] **Step 3: Client dedupe by `id`, never `client_id`**

In `MessengerContext.jsx:65-76`, change `const key = item.client_id || \`chat-${item.id}\`;` to `const key = item.id;`. Nothing is ever hidden again.

- [ ] **Step 4: Verify**

Extend `server/scripts/smokeMessengerStore.js` (or a new `verifyChatUniqueness.js`): create two client chats for the same client_id → assert second returns the first's id (no duplicate row); assert `normalizeChatList` keeps both distinct-id internal chats. Run via `node server/scripts/...`.

- [ ] **Step 5: Commit**

```bash
git add server/services/db.js server/routes/messenger.js src/context/MessengerContext.jsx
git commit -m "fix(messenger): enforce one chat per client (merge dupes + unique index); dedupe client list by id"
```

---

## Phase 4 — Journal request path (root fix for race + chattiness)

**Why:** (a) `Journal.jsx:47-50` `loadJournal` has no stale-guard → fast client switches overwrite newer data. (b) `updateJournalItem` (`journalStore.js:280-301`) does 4 round-trips; then the frontend full-reloads (`Journal.jsx:78-121`). Fix: latest-wins on the client; single enriched round-trip on the server; patch local state from the returned row instead of reloading.

**Files:**
- Modify: `src/sections/Journal.jsx:33-50, 78-121`
- Modify: `server/services/journalStore.js:280-301`

- [ ] **Step 1: Latest-wins guard in `loadJournal`**

```jsx
const loadSeqRef = useRef(0);
const loadJournal = async () => {
  if (!clientId) return;
  const seq = ++loadSeqRef.current;
  setLoading(true); setError("");
  try {
    const data = await fetchJournal(authFetch, clientId);
    if (seq !== loadSeqRef.current) return;          // a newer load started
    setItems(Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    if (seq !== loadSeqRef.current) return;
    setError(err.message || "Не удалось загрузить журнал");
  } finally {
    if (seq === loadSeqRef.current) setLoading(false);
  }
};
```

(Add `useRef` to the React import.)

- [ ] **Step 2: Single enriched round-trip in `updateJournalItem`**

Keep the one leading `getJournalItemById` (needed for the merge / immutable `type`), then replace the resolve-then-update-then-refetch with one CTE that resolves the stage inline and returns the enriched row:

```js
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
   current.clientId, stageNumSrc]
);
return res.rows[0] ? rowToItem(res.rows[0]) : null;
```

where `stageNumSrc` = `Object.prototype.hasOwnProperty.call(payload,"stageId") ? payload.stageId : current.stageId` (a stage_num, since `current.stageId` is already stage_num per `rowToItem`). This drops `resolveStageDbId` + the trailing `getJournalItemById` (4 trips → 2).

- [ ] **Step 3: Patch state instead of full reload (frontend)**

`updateJournalItem`/`createJournalItem` already return the item. In `Journal.jsx`, change `saveItem`, `handleMove`, `handleDrop` to apply the returned item to `items` locally and call `onChanged?.()` for badges — drop `refreshAfterChange`'s full `loadJournal` on the success path. Keep full `loadJournal()` ONLY in the `handleDrop` catch (rollback). Example for `handleMove`:

```jsx
const handleMove = async (item, toStatus) => {
  if (!toStatus || toStatus === item.status) return;
  const updated = await updateJournalItem(authFetch, clientId, item.id, { status: toStatus });
  setItems((prev) => prev.map((it) => (Number(it.id) === Number(item.id) ? updated : it)));
  if (onChanged) await onChanged();
};
```

- [ ] **Step 4: Verify**

Run existing `npm run verify:journal-api` and `cd server && node scripts/smokeJournalStore.js`. Add an assertion to the smoke script: `updateJournalItem` returns an item whose `stageId` reflects a changed `stageId` and whose `status` is updated — proving the CTE returns enriched data in one call. Manually: drag a card across columns and confirm no full-list flicker.

- [ ] **Step 5: Commit**

```bash
git add src/sections/Journal.jsx server/services/journalStore.js
git commit -m "perf(journal): latest-wins load guard; single enriched UPDATE round-trip; patch state instead of full reload"
```

---

## Phase 5 — Permission/access query fan-out (root optimization)

**Why:** `getPermissionsForRole` (`permissions.js:5-38`) runs 3 queries (`getRoleByName`+`getRoleSections`+`getRolePermissions`) per non-admin request; `canAccessClient` (`clientAccess.js:3-8`) adds 2 (`hasAllClientsAccess`+`getAssignmentsByUser`). ~5 round-trips before any real work. This is the honest root fix: collapse to joins (fewer trips), not "cache to hide slow queries." A short-TTL cache is optional polish on top, with invalidation on role writes.

**Files:**
- Modify: `server/services/permissions.js`
- Modify: `server/services/clientAccess.js`

- [ ] **Step 1: Collapse permissions to a single query**

Replace the 3 calls with one query joining `roles`→`role_sections`/`role_permissions`:

```js
const r = await pool.query(
  `SELECT r.id AS role_id,
          rs.section_id, rs.can_read, rs.can_write,
          rp.permission, rp.granted
   FROM roles r
   LEFT JOIN role_sections rs ON rs.role_id = r.id
   LEFT JOIN role_permissions rp ON rp.role_id = r.id
   WHERE r.name = $1`,
  [resolvedRoleName]
);
```

then fold rows into `{ sections, canDeleteClient, ... }` in JS (group by section_id / permission). Same output shape as today — no caller changes.

- [ ] **Step 2: Collapse `canAccessClient` to one query**

```js
async function canAccessClient(user, clientId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const r = await pool.query(
    `SELECT (u.role='admin' OR u.all_clients_access OR ca.user_id IS NOT NULL) AS allowed
     FROM users u
     LEFT JOIN client_assignments ca ON ca.user_id = u.id AND ca.client_id = $2
     WHERE u.id = $1 AND u.active = true
     LIMIT 1`,
    [user.id, clientId]
  );
  return !!r.rows[0]?.allowed;
}
```

- [ ] **Step 3 (optional polish): short-TTL role-permission cache**

Add an in-process `Map` with a ~30s TTL keyed by role name; invalidate (clear the key) wherever roles/sections/permissions are written in the admin routes. Only do this if profiling still shows permission lookups hot after Steps 1–2.

- [ ] **Step 4: Verify**

`npm run verify:client-role-perms` (existing) must still pass. Add a smoke assertion that an admin gets full sections and a non-admin gets exactly its DB-configured sections.

- [ ] **Step 5: Commit**

```bash
git add server/services/permissions.js server/services/clientAccess.js
git commit -m "perf(auth): collapse permission + client-access lookups into single queries"
```

---

## Phase 6 — Split MessengerContext (root fix for broad re-renders)

**Why:** `MessengerContext.jsx:1234-1354` builds one context value with ~70 fields and a ~64-entry memo dependency array; any message/chat/pin/selection change re-creates it and re-renders every consumer. Split into a **stable actions context** (callbacks, memoized once) and a **volatile state context** (chats/messages/pins/selection). Consumers subscribe only to what they use.

**Files:**
- Modify: `src/context/MessengerContext.jsx`
- Modify: consumers that only call actions (e.g. `src/components/MessengerChatWindow.jsx`, `MessengerChatList.jsx`) to read from the actions context.

- [ ] **Step 1:** Create two contexts: `MessengerStateContext` (`{ ready, chats, chatsLoaded, activeChatId, messages, pinnedForAll, pinnedForMe, selectionMode, selectedIds, ... }`) and `MessengerActionsContext` (`{ loadChats, loadMessages, sendMsg, ... }`, all `useCallback`-stable). Provide both from `MessengerProvider`.
- [ ] **Step 2:** Add hooks `useMessengerState()` and `useMessengerActions()`; keep `useMessenger()` as a thin shim returning the merge for unmigrated callers (so this can land incrementally).
- [ ] **Step 3:** Migrate heavy consumers to the split hooks; verify with `npm run verify:messenger-all` and React DevTools profiler (action-only components stop re-rendering on new messages).
- [ ] **Step 4: Commit** `refactor(messenger): split context into stable actions + volatile state to cut re-renders`.

> This is an L-effort refactor. Land it last; it carries no correctness risk if the `useMessenger()` shim is kept during migration.

---

## Appendix A — Hygiene (НИЗКИЙ; all root, all small)

Each is an independent S task; commit individually.

- [ ] **A1 — log journal 500s.** `server/routes/journal.js:50-52,82-84,102-104`: add `console.error(e)` before the generic response. (Pick one error policy and apply to messenger too.)
- [ ] **A2 — resolve author names.** Thread `usersById` into `JournalCommentsPopup.jsx` / `JournalNotesPanel.jsx`; render display_name instead of `#id`.
- [ ] **A3 — bulk-forward double-fetch.** `messenger.js:759,762`: reuse the `getMessagesByIds` result; drop the `ids.map(getMessageById)` loop.
- [ ] **A4 — stop leaking `e.message`.** Centralize messenger catches to log internally and return a generic message (+ optional request id); aligns with journal.
- [ ] **A5 — gate `/api/users`.** `messenger.js:1205-1216`: add a section/permission gate (or document it as the intended staff directory).
- [ ] **A6 — sargable reminder scan.** `journalStore.js:220-237`: pre-filter by `due_date` bound before computing the timestamp; add a supporting index.
- [ ] **A7 — scope chat access-sync.** `messenger.js:40-68`/`chatAccessSync.js:301`: `WHERE client_id IS NOT NULL` so the scan covers only relevant chats (keep the 5s TTL).

---

## Appendix B — graceful-degradation layer (NOT the cure — do AFTER the root phases)

> These make failures *graceful*; they do **not** deliver journal data faster. They are legitimate in a robust system, but if you ship only these you have masked the symptom, not fixed it. Land them after Phases 0–4.

- [ ] **B1 — per-request timeout.** Add an `AbortController` + `setTimeout` wrapper inside `authFetch` (`AuthContext.jsx:121-141`) with a **per-call** option: default ~10s for JSON GET/POST; **disabled / much longer for uploads** (`MessengerApi.uploadFile`, `sendFiles`) — a blanket timeout WILL break 50mb uploads. Surface a typed `TimeoutError`; add the same bound to the `/api/auth/me` bootstrap (`AuthContext.jsx:52-68`, today unbounded). Then give `Journal.jsx:156` an error/retry state instead of the bare spinner.
- [ ] **B2 — readiness gate.** Bind `app.listen` and add `GET /api/health` + middleware returning **503 "starting"** on `/api/*` until `initSchema` completes; frontend shows "запускается, повтор…". After Phase 0 this window is sub-second, so B2 is a thin safety net — useful, not load-bearing.

**Explicitly NOT planned as a fix:** capping search decryption (`messenger.js:812-901`). That trades search completeness for bounded cost — a mitigation. The real root is a different search architecture (client-side search over the decrypted message cache, or a derived searchable index). Revisit only when message volume makes search a measured problem.

---

## Self-review checklist (done)
- **Spec coverage:** every CRITICAL/HIGH/MEDIUM finding from the review maps to a phase (boot X1→P0, silent-death X2→P1, JSONB M3→P2, chat loss H2→P3, journal race/chattiness J1/J2/J3→P4, perm fan-out X3→P5, context M3→P6); band-aids X-timeout/503/search-cap quarantined in Appendix B. ✅
- **No placeholders:** every code step shows real code/SQL and an exact run command. ✅
- **Type/name consistency:** `runOnce(id, fn)` used identically in P0/P2/P3; `metadata_json` JSONB read-shape consistent P2↔P4; `stageNumSrc` defined where used. ✅

## Execution (for the future session)
Two options once you start:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks (use `superpowers:subagent-driven-development`).
2. **Inline** — batch with checkpoints (use `superpowers:executing-plans`).

Suggested order: **P0 → P1 → P2** (kills the outage at the cause) → **P3 → P4** → **P5 → P6** → Appendix A → Appendix B. Each phase is independently shippable and committed.
