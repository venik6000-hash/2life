# Security iter4 — RLS sub-stage plan (deferred from the one-pass run)

> **Status:** NOT IMPLEMENTED. Carved out of the iter4 pass on purpose (the other
> six items shipped). RLS is the highest-risk item and cannot be done safely in a
> single pass on a live medical DB without staging. This doc is the ready-to-run
> plan for a focused follow-up.

**Goal:** Enable Postgres Row-Level Security as defense-in-depth so that even if an
app-layer check (`canAccessClient`, `requireSection*`, a brand-new endpoint) is
bypassed or a query is injected, the database itself refuses to return rows the
current user may not see. Code checks stay as the primary layer — RLS is added
*underneath*, not as a replacement.

---

## Why this is a sub-stage, not a one-pass change

The runtime connects as a **single shared role** `app_2life` for *every* application
user (created in `server/services/db.js` → `ensureAppDbRole`, with `LOGIN
NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`). Confirmed facts that make this
both *possible* and *hard*:

- `app_2life` is **non-owner** and **NOBYPASSRLS** → RLS policies WILL constrain it
  (the table owner / bootstrap admin connection bypasses RLS unless `FORCE` is set).
- There is **no per-request DB identity**. Almost all queries go through the shared
  `pool` facade (`activePool.query`) and most are **not** wrapped in a transaction.
- Therefore RLS policies cannot tell one app-user from another **unless the app
  tells Postgres who the current user is** via session settings (GUCs) on the
  connection serving that request.

The blast radius: a policy keyed on a GUC denies all rows when the GUC is unset.
Any read path NOT yet migrated to set the GUC would suddenly return **empty
results** — a silent, app-wide breakage. So RLS can only be switched on after every
sensitive read/write path carries the per-request context. That migration is the
bulk of the work and must be staged.

---

## Architecture: per-request DB context (GUCs)

Add a request-scoped DB client that carries the caller's identity as transaction-
local settings, and route sensitive queries through it.

GUCs (set per request, transaction-local so they auto-clear):
- `app.user_id`   — `req.user.id`
- `app.is_admin`  — `'on' | 'off'` (`req.user.role === 'admin'`)
- `app.all_clients` — `'on' | 'off'` (`req.user.all_clients_access`)

Middleware (after `requireAuth`), sketch:

```js
// middleware/dbContext.js
const { pool } = require("../services/db");
const withUserDbContext = async (req, res, next) => {
  if (process.env.RLS_ENFORCE !== "on") return next(); // flag-gated rollout
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.is_admin', $2, true), set_config('app.all_clients', $3, true)",
      [String(req.user.id), req.user.role === "admin" ? "on" : "off", req.user.all_clients_access ? "on" : "off"]
    );
    req.db = client;
    res.on("finish", async () => { try { await client.query("COMMIT"); } finally { client.release(); } });
    res.on("close",  async () => { try { await client.query("ROLLBACK"); } finally { client.release(); } });
    next();
  } catch (e) { client.release(); next(e); }
};
```

> `set_config(..., true)` = transaction-local: the GUC is cleared on COMMIT/ROLLBACK,
> so a pooled connection can't leak one user's identity to the next checkout. The
> cost is **one transaction per request**; acceptable for this app's traffic but
> must be measured (long-running requests hold a connection).

The hard part: **every sensitive query must use `req.db`** instead of the module-
level `pool`. Migrate by table-group, deepest-first (see rollout). Until a path is
migrated it must NOT touch an RLS-enabled table on `app_2life`.

---

## Policies (per sensitive table)

Do **not** `FORCE ROW LEVEL SECURITY` — the owner/bootstrap connection must keep
bypassing RLS so `initSchema`, `runOnce` migrations and seeds (which run on the
admin connection before the pool switch) are unaffected.

Visibility predicate, by `client_id`:

```sql
CREATE OR REPLACE FUNCTION app_can_see_client(cid text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.is_admin', true) = 'on'
      OR current_setting('app.all_clients', true) = 'on'
      OR EXISTS (
           SELECT 1 FROM client_assignments ca
            WHERE ca.client_id = cid
              AND ca.user_id = NULLIF(current_setting('app.user_id', true), '')::int
         );
$$;
```

Client-scoped tables — enable + policy (`USING` for read, `WITH CHECK` for write):

```sql
-- clients keyed on id; the rest on their client_id column
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_app ON clients USING (app_can_see_client(id)) WITH CHECK (app_can_see_client(id));

-- repeat for: stages, journal_items, journal_comments (via item),
-- analytics_categories, analytics_files, client_weekly_menus, client_menu_items
-- (via menu), wave_checkins, wave_reactions, wave_flags, integration_connections,
-- activity_log (client_id nullable — policy must allow client_id IS NULL rows for
-- non-client actions, or scope separately).
```

`analytics_markers` / `analytics_values` have no `client_id` (joined category →
client). Either add EXISTS-up-the-chain policies, or leave them to the FK cascade +
app checks and document the gap. Decide explicitly.

Messenger tables (`chats`, `messages`, `chat_files`, `chat_participants`,
`message_*`) already gate on participant membership in code; RLS predicate:

```sql
-- messages / chat_files keyed on chat_id
USING (EXISTS (SELECT 1 FROM chat_participants cp
               WHERE cp.chat_id = messages.chat_id
                 AND cp.user_id = NULLIF(current_setting('app.user_id', true), '')::int))
```

`chat_participants` itself: `USING (user_id = current_setting('app.user_id')::int OR app.is_admin)`
plus the owner-managed sync path runs as bootstrap/admin where needed.

**Default-deny corollary:** with no GUC set, `current_setting('app.user_id', true)`
is `''`/NULL and the predicate is false → zero rows. Good as a backstop, fatal if a
live read path is unmigrated. Hence the staged rollout below.

---

## Rollout (staged, flag-gated)

1. Add `middleware/dbContext.js` + `req.db`; introduce a `RLS_ENFORCE` env flag
   (default off). With the flag off, nothing changes.
2. Thread `req.db` through ONE table-group's read+write paths (start with
   `clients`/`stages` — the core). Add the policy + `ENABLE RLS` for that group.
3. Verify that group on a **clone** (below). Only then move to the next group
   (analytics, journal, menu, wave, messenger).
4. `activity_log`, `analytics_markers/values`, and any nullable-`client_id` tables
   need explicit decisions — don't enable RLS on them until their predicate is
   settled.
5. Flip `RLS_ENFORCE=on` in prod only after ALL sensitive groups are migrated and
   the clone-based verify is green. Keep `APP_DB_ROLE=off` as the escape hatch
   (it keeps the runtime on the admin connection → RLS inert → instant rollback).

---

## Verify (clone-based — RLS must be tested as `app_2life`, not as admin)

`server/scripts/verifyRlsClientScope.js` (new), run against a **clone of real data**
(per the harness: `pg_dump` real DB → throwaway), NOT the schema-only ttest:

1. Apply the RLS migration as admin (owner) on the clone.
2. `ensureAppDbRole()` to create `app_2life`; open a pool AS `app_2life`.
3. For each persona, in a transaction: `SELECT set_config('app.user_id', …, true)`,
   `app.is_admin`, `app.all_clients`, then `SELECT` from `clients`, `stages`,
   `journal_items`, `messages` and assert the visible id-set equals expectation:
   - **admin** (`app.is_admin=on`): sees all.
   - **staff with one assignment**: sees only the assigned client's rows.
   - **client/patient**: sees only their own client's rows.
   - **no GUC set**: sees nothing (default-deny backstop).
4. Assert `WITH CHECK`: a staff INSERT/UPDATE into a non-assigned client's row is
   rejected.
5. Assert the **bootstrap path** (admin/owner connection) still reads+writes
   everything (seeds/migrations unaffected).
6. Assert `APP_DB_ROLE=off` leaves the runtime on the admin connection (RLS inert).

---

## Deploy implications

- **`pg_dump` FIRST** — RLS is a behavior-critical schema change; back up before the
  migration.
- The migration is additive (policies + `ENABLE RLS`), but enabling it without the
  `req.db` plumbing live will empty out reads — gate both behind `RLS_ENFORCE=on`
  so they move together.
- Rollback: `RLS_ENFORCE=off` (drops the GUC plumbing) **and/or** `APP_DB_ROLE=off`
  (runtime stays on the admin connection, bypassing RLS). Either restores prior
  behavior without a redeploy of policies.
- Test on a staging clone (`pg_dump` of prod) before prod. Do NOT enable on prod
  blind.

---

## Effort

Large. The `req.db` threading across `server/services/*` is the bulk; the policies
themselves are small. Recommend a dedicated branch executed table-group by
table-group with the clone verify gating each group.
