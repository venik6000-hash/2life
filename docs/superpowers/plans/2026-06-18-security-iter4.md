# Security Iteration 4 — implementation record

**Goal:** Close the open iter4 audit items carried over from iter3 (named in the
iter3 self-review as "out of scope by agreement"): RLS, client-create TOCTOU, SSE
client-id leak, doctors-list exposure, role-perms lost-update, plus the admin
empty-DB lockout and a doctor-sync N+1.

**Method:** one atomic commit per item, each with a runnable verify script on the
throwaway-DB harness (`docker compose run` against a `ttest` clone — see the iter3
plan's "Test harness"). Frontend changes verified with a static `.mjs` check +
`npm run build`.

**Hard constraints honored:** raw `pg` + `CREATE … IF NOT EXISTS` / `runOnce`
(no Prisma); `app_2life` least-privilege runtime role untouched; **no
`users.token_version` bump** for any role/permission change (the new `roles.version`
is a separate column for optimistic concurrency); patient access model unchanged.

---

## Items

### 1. RLS — DEFERRED to a sub-stage (see `2026-06-18-security-iter4-rls-substage.md`)
Real per-role RLS requires per-request session-GUC context because the runtime
uses a single shared `app_2life` role for all users; that is a large cross-cutting
change unsafe to land in one pass on a live medical DB. Carved out with a concrete,
ready-to-run plan per the explicit allowance. The other six items shipped.

### 2. Client-create TOCTOU — DONE (`9428fa0`)
`PUT /clients/:id` create path did `getOneClient()` (no lock) → `saveOneClient()`
(`ON CONFLICT DO UPDATE`); two concurrent creators of the same id both saw "no
client" and both wrote, the loser silently overwriting the winner. Added
`createOneClientExclusive()` (`INSERT … ON CONFLICT DO NOTHING` claim inside the
write txn); loser now gets `409 CLIENT_ALREADY_EXISTS`.
Verify: `verify:client-create-race`.

### 3. SSE client-id leak — DONE (`844ddaf`)
`broadcast("client-updated",{clientId})` fanned out to every stream. Added
`broadcastToClientWatchers()` (fails closed) and scoped delivery to users with
client access via the existing `getUsersWithClientAccess` (parity with
`canAccessClient`). `permissions-updated`/control events stay global.
Verify: `verify:sse-client-scope`.

### 4. `GET /api/doctors` exposure — DONE (`c29ee6c`)
Was bare `requireAuth()` — readable by client roles, `user_id` linkage included.
New `services/doctorsAccess.js`: block client roles; strip `user_id` for non-admins
(admin panel uses the separate `/api/admin/doctors`). Frontend bootstrap already
tolerates a 403.
Verify: `verify:doctors-access`.

### 5. Role-perms lost-update + concurrency — DONE (`7bb7aad`)
Two admins could silently overwrite each other; the UI also dropped clicks made
during an in-flight save. Server: `roles.version` (additive) + `bumpRoleVersion()`;
`PUT /admin/roles/:id/sections` takes `expectedVersion`, bumps inside the same txn,
returns `409 ROLE_VERSION_CONFLICT` on a stale version; `is_client` toggle bumps too;
`GET /admin/roles` exposes `version`. Frontend: send `expectedVersion`, handle 409,
and `subtractSavedRoleChanges` keeps mid-save edits.
Verify: `verify:role-perms-concurrency` + `verify:role-perms-pending`.

### 6. Admin empty-DB lockout — DONE (`ac94fd2`)
`dashboard.jsx` early-returned `<NoClientsScreen/>` before the shell/sidebar, so an
admin on an empty DB could never reach the admin panel. The early return is now
bypassed for an admin in the admin section; the empty screen offers "Открыть
админку"; Sidebar/SidebarClientPicker made null-client safe.
Verify: `verify:admin-empty-db` + `npm run build`.

### 7. Doctor-sync N+1 — DONE (`d37c6d2`)
`syncDoctorAssignmentsForAllClients` built every client's full card via
`getClients()` then ran `getDoctorByName()` per name per client. Replaced with three
flat queries + in-memory maps; behavior preserved exactly.
Verify: `verify:doctor-sync-batch`.

---

## Verify commands

Server (throwaway DB via the iter3 harness — mount services+scripts+routes+middleware):
```
verify:client-create-race  verify:sse-client-scope  verify:doctors-access
verify:role-perms-concurrency  verify:doctor-sync-batch
```
Frontend (host): `node scripts/verifyAdminEmptyDbAccess.mjs`,
`node scripts/verifyRolePermsPending.mjs`, `npm run build`.

Regression sweep (all PASS): `verifyPermissions`, `verifyMigrations`,
`verifyClientRoleHardLimits`, `verifyClientAssignmentSources`,
`verifyDoctorSyncAtomicity`, `verifyAppDbRole`, `verifyIsClientFlag`.

---

## Deploy implications

All six shipped items are code + one additive, idempotent column (`roles.version`,
added in `initSchema` like `is_client`). No data migration, no backfill, no
`token_version` bump. Standard process: **`pg_dump` first**, then `git pull` +
`docker compose up -d --build`. `roles.version` is created on boot by `initSchema`
(safe on existing DBs). RLS (item 1) is a separate, larger rollout — see its
sub-stage plan; `pg_dump` is mandatory before that one.
