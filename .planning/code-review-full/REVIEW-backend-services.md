---
phase: code-review-full / backend-services
reviewed: 2026-05-19T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - server/services/backup.js
  - server/services/chatAccessSync.js
  - server/services/messengerAccessNotifications.js
  - server/services/messengerSearch.js
  - server/services/messengerStore.js
  - server/services/permissions.js
  - server/services/setup.js
  - server/services/sseTickets.js
  - server/services/storage.js
  - server/services/tokenBlacklist.js
  - server/services/wsTickets.js
findings:
  critical: 4
  warning: 9
  info: 6
  total: 19
status: issues_found
---

# Backend Services: Deep Code Review

**Reviewed:** 2026-05-19
**Depth:** deep
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Deep cross-file review of eleven non-recently-modified backend service modules.
The cluster covers backups, chat access sync (E2E key rewrapping), messenger
notifications, search, persistent device/sync storage, role permissions,
bootstrap, SSE/WS tickets, storage paths, and the JWT blacklist.

The headline risks are: (1) `pg_dump` is invoked with the full `DATABASE_URL`
as a CLI argument — credentials leak into the OS process table and into any
error message logged by the catch handler; (2) the `pg_dump` output is loaded
entirely into a Node Buffer in memory before being written to disk, which can
OOM and silently produces a truncated dump if stdout exceeds Node's
`maxBuffer` (default 1 MB) — at that point the catch branch logs the failure
but `cleanupOldPgDumps` later still keeps the (missing) file, and successful
small databases mask the problem; (3) the in-memory token blacklist and
SSE/WS ticket maps are not shared across processes, so any horizontally
scaled deploy will silently fail to revoke tokens or honor tickets on the
"other" node; (4) `chatAccessSync.upsertParticipant` is bound by a non-
parameterised plain string ON CONFLICT clause that uses `<> ''` comparison
on a value that the schema may not actually default to empty string —
combined with the resolver swallowing every cryptographic failure as a silent
`""`, users can be added as chat participants with no usable encrypted key
and no error surfaced to callers.

A number of secondary issues exist: missing context propagation between
`upsertMessengerDevice` and `recordDeviceSession` (NULL jti after first push
subscribe), race conditions in the in-memory ticket maps under load, missing
expiry cleanup leading to slow leaks, regex-based snippet matching that does
not normalize Unicode, and inconsistent role/permission seeding.

---

## Critical Issues

### CR-01: Database credentials leaked to process table and logs via `pg_dump` argv

**File:** `server/services/backup.js:18,48-52`

**Issue:** `DATABASE_URL` (which includes the password, e.g.
`postgresql://postgres:postgres@localhost:5432/2life`) is passed as the last
positional argument to `pg_dump`. On Linux, every other user on the host can
read it via `/proc/<pid>/cmdline` or `ps -ef`. Worse, when `pg_dump` fails
for any reason, `err.message` typically includes the connection string verbatim
(e.g. `"pg_dump: error: connection to server on socket ...: FATAL ..."`); the
catch branch logs `err.message` with `console.error`, persisting credentials
into log aggregation/SIEM systems indefinitely. The default fallback of
`postgresql://postgres:postgres@localhost:5432/2life` also encodes a weak
default password.

**Fix:** Pass connection parameters via environment variables (`PGHOST`,
`PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) parsed from the URL once at
startup, and call `pg_dump` with no URL argument. Scrub `err.message` before
logging.

```js
const { URL } = require("url");
const parsed = new URL(DATABASE_URL);
const pgEnv = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: parsed.pathname.replace(/^\//, ""),
};
execFile(PG_DUMP_BIN, ["--no-password", "--clean", "--if-exists"],
  { env: pgEnv, maxBuffer: 1024 * 1024 * 1024 },
  (err, stdout) => { ... });
```

---

### CR-02: `pg_dump` buffered to memory; silent truncation past default `maxBuffer`

**File:** `server/services/backup.js:44-58`

**Issue:** `execFile` buffers `stdout` into a Node Buffer and defaults to a
`maxBuffer` of 1 MiB. Any non-trivial production database will exceed that.
When the limit is hit, `execFile` kills the child and reports an error — the
error message is logged, but a partial `outFile` is never written (good).
However, even when under the limit, the *entire* dump is held in Node heap
before `fs.writeFileSync` synchronously writes it, which (a) doubles RSS and
(b) blocks the event loop for hundreds of ms on multi-hundred-MB dumps,
stalling all HTTP/WS handling. The same issue applies to `tar` in
`createUploadsBackup` (`server/services/backup.js:84`) — although stdout
isn't captured there, the default `maxBuffer` still applies to any stderr
chatter from `tar` warnings (e.g. "file changed as we read it"), which can
abort the backup of large upload trees and leave no successful snapshot.

**Fix:** Use streaming. Spawn `pg_dump` with `child_process.spawn`, pipe
`stdout` directly to a `fs.createWriteStream(outFile)`, and treat
non-zero exit codes as failure. For `tar`, pass an explicit large
`maxBuffer` or use `spawn` with `stdio: ['ignore', 'ignore', 'pipe']`
and accumulate stderr only on error.

```js
const { spawn } = require("child_process");
const child = spawn(PG_DUMP_BIN,
  ["--no-password", "--clean", "--if-exists"],
  { env: pgEnv });
const out = fs.createWriteStream(outFile);
child.stdout.pipe(out);
let stderr = "";
child.stderr.on("data", chunk => { stderr += chunk.toString(); });
child.on("close", code => {
  if (code !== 0) {
    fs.unlink(outFile, () => {});
    console.error("[backup] pg_dump exit", code, stderr.slice(0, 500));
    return resolve(false);
  }
  cleanupOldPgDumps();
  resolve(true);
});
```

---

### CR-03: JWT blacklist and SSE/WS ticket stores are in-process; horizontal scale silently breaks auth

**File:** `server/services/tokenBlacklist.js:7-19`,
`server/services/sseTickets.js:6-26`,
`server/services/wsTickets.js:6-29`

**Issue:** All three modules keep their state in a Node `Map` that lives in
a single process. In any deployment with more than one app instance behind a
load balancer (a normal production configuration), the following will silently
malfunction:

- A user calls `POST /logout` which adds `jti` to the blacklist on node A;
  the next request lands on node B which still treats the token as valid.
- The client opens an SSE/WS connection using a ticket created on node A;
  the upgrade lands on node B which returns 401 (`consumeTicket → null`).

Neither failure mode raises an alarm in logs — they look like benign user
errors. There is also no upper bound on the blacklist; `blacklistToken`
schedules a delete per entry via `setTimeout`, which means up to `TOKEN_TTL_MS`
of timers (8 h) can accumulate per process. For tickets there is no cleanup
*at all* — abandoned tickets sit in the map until the process restarts, slowly
leaking memory under sustained traffic that creates more tickets than it
consumes.

**Fix:** Move both stores to a shared backend (Redis with TTL is the typical
choice). At minimum, add periodic sweepers that drop expired ticket entries,
and document that the system does not support horizontal scaling without
these stores being externalised.

```js
// Sweeper for tickets (sseTickets / wsTickets)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tickets) if (now > v.expiry) tickets.delete(k);
}, 60_000).unref();
```

---

### CR-04: `syncChatParticipantsByClientAccess` adds users to chats with empty encrypted key, silently

**File:** `server/services/chatAccessSync.js:191-203, 205-231, 391-409`

**Issue:** `buildEncryptedChatKeyForUser` returns the empty string `""` on
*any* failure: missing target public key, missing existing participants,
inability to unwrap any existing key, or thrown crypto exception (caught in
the `for` loop's `try {} catch(_) {}`). `upsertParticipant` then inserts the
participant unconditionally with `encrypted_chat_key = ""`. The
`ON CONFLICT` branch is `WHEN EXCLUDED.encrypted_chat_key <> '' THEN ... ELSE
chat_participants.encrypted_chat_key` — meaning an empty new key keeps a
previous good key (fine), but the *initial* insert leaves the column as `""`
forever. From the calling user's perspective, they are now a "member" of a
chat they can never decrypt; from another participant's perspective, the chat
participant list shows a member whose presence implies access.

This is also a security/authorization smell: the chat membership row exists
without the cryptographic capability that was supposed to be its proof of
access. Subsequent code that authorises operations using
`SELECT ... FROM chat_participants` will let this user perform writes,
mutations, deletes etc. on the chat even though they don't hold the chat key.

`syncUserChatAccessByClientPermissions` (lines 318-345) has the same flaw.

**Fix:** Make `buildEncryptedChatKeyForUser` distinguish "no key needed yet"
from "failed to produce key". Refuse to add a participant when the key
cannot be produced (or insert them in a clearly distinct "pending" state),
and surface the failure to the caller so the operator can be notified rather
than silently leaving a half-provisioned member.

```js
if (!encryptedChatKey) {
  // log + skip; do not silently insert empty key
  pendingChatIds.push(chat.id);
  continue;
}
await upsertParticipant(db, chat.id, safeUserId, roleInChat, encryptedChatKey);
```

Also: the `ON CONFLICT` branch compares `EXCLUDED.encrypted_chat_key <> ''`
but the column may actually be `NULL` for legacy rows, so `<> ''` is `NULL`
(neither true nor false). Use `COALESCE(EXCLUDED.encrypted_chat_key, '') <> ''`.

---

## Warnings

### WR-01: `recordDeviceSession` and `upsertMessengerDevice` race on the same row, both with destructive UPDATE clauses

**File:** `server/services/messengerStore.js:26-63`

**Issue:** Both functions perform `INSERT ... ON CONFLICT (user_id, device_id) DO UPDATE`. The two `DO UPDATE` clauses touch different columns and assume mutually exclusive caller intent:

- `upsertMessengerDevice` (called from push-subscription endpoint) overwrites `endpoint`, `p256dh`, `auth`, `user_agent` but does NOT touch `jti`. On a fresh INSERT it leaves `jti` NULL (because the parameter list excludes it). If the first action for a device is a push subscribe before any authenticated request hit auth.js middleware, `getDeviceJti` will return NULL forever for that row until the user re-authenticates.
- `recordDeviceSession` (called from auth middleware on every request) does `COALESCE(EXCLUDED.jti, messenger_devices.jti)` — but on first INSERT, EXCLUDED.jti is the new value, so this is correct. However the `user_agent` update only fires when `EXCLUDED.user_agent <> ''`, so once a user agent is recorded it's sticky even if the client genuinely changed UA.

Under concurrent execution there is also a lost-update window: both INSERTs race; the loser executes its `DO UPDATE`, which for `upsertMessengerDevice` resets `endpoint` etc. that the other side might also be trying to set. Postgres serialises the two correctly but the *application* observable result depends on race order.

**Fix:** Either combine the two paths into one canonical upsert that takes an optional `jti` and optional push-subscription block, or ensure both paths use `COALESCE(EXCLUDED.x, table.x)` consistently so each is purely additive.

---

### WR-02: `listSyncEventsForUser` authorization predicate allows reading events for chats user no longer participates in (after a deletion) but joined was created — and conversely misses events for chats deleted

**File:** `server/services/messengerStore.js:12-24`

**Issue:** The query is
```
WHERE e.id > $2 AND (e.user_id = $1 OR cp.user_id = $1)
```
with a LEFT JOIN of `chat_participants` on `cp.chat_id = e.chat_id AND cp.user_id = $1`. The authorisation decision is made at *query time*, not at *event-emission time*. Therefore:

1. A user who was removed from a chat will stop seeing all of that chat's events, *including the `participant_removed` event addressed to them* (the event row has `user_id = removed_user` so they would receive it via `e.user_id = $1` — that branch saves it, OK). But other event types that targeted that user before removal but were generated with `user_id = NULL` are lost.
2. Conversely, a newly added user will, on first sync, see the *entire historical event stream* of every chat they are now in, because `cp.user_id = $1` matches against the live participant table even for events that pre-date their membership. This includes potentially sensitive metadata (deleted-message ids, edit history).

**Fix:** Either denormalise `recipient_user_id` onto each event row (and filter by that), or record `joined_at` on `chat_participants` and add `AND e.created_at >= cp.joined_at` to the predicate.

---

### WR-03: `chatAccessSync.getUsersWithClientAccess` / `userHasClientAccess` treat `client_id` as opaque string but the FK is `text`/`uuid` — type confusion possible

**File:** `server/services/chatAccessSync.js:256-292`

**Issue:** `clientId` is normalised with `String(clientId || "").trim()`. The query parameterises it as text, but `chats.client_id` may be declared as a different type (uuid, integer); when an attacker (or buggy caller) passes `"' OR 1=1"` the parameterisation prevents SQL injection (good), but a numeric or uuid mismatch will cause Postgres to throw and abort the entire access-sync transaction — i.e. it converts an authorisation lookup into a 500. Worse, `chat.client_id` from `getChatMeta` is compared with `allowedClientIds.has(chat.client_id)` (line 321) using JS `===` semantics via `Set`; if `getAllowedClientIdsForUser` returns numeric ids and `chat.client_id` is a string, every chat will be considered "not allowed" and all participants will be silently removed.

**Fix:** Coerce both sides to the same primitive (`String(row.client_id)`) before constructing/querying the Set, and validate the expected column type once at startup.

---

### WR-04: `chatAccessSync` performs O(N×M) queries inside `for` loops with no transaction

**File:** `server/services/chatAccessSync.js:318-365, 391-435`

**Issue:** For a user being granted access, the function iterates every chat in the database, doing `getChatParticipantRows` and an UPSERT per chat. None of this is wrapped in a transaction, so a partial failure leaves chat membership in an inconsistent state (some chats added, others not), and a second invocation will retry the failed ones but may re-trigger `notifyAddedChat` for chats already partially added. (Out of scope to fix the N×M cost per project rules, but the transactional integrity is a correctness issue.)

**Fix:** Wrap the per-user sync in a single transaction (`BEGIN`/`COMMIT`) using a dedicated `pool.connect()` client, and only emit `addedChatIds` / `removedChatIds` after `COMMIT`.

---

### WR-05: `chatAccessSync.upsertParticipant` does not parameterise `roleInChat`; only valid values are `'owner'`/`'member'` but no enforcement

**File:** `server/services/chatAccessSync.js:191-203, 323, 393`

**Issue:** `roleInChat` is parameterised (good — no SQL injection), but the function trusts that callers pass `'owner'` or `'member'`. The two call sites derive it from `chat.created_by === userId ? "owner" : "member"`, which is safe. However if a future caller passes another value (e.g. `'admin'`), it lands in the DB and other code that branches on role will produce unexpected behavior. Add an explicit whitelist.

**Fix:**
```js
const ROLE_WHITELIST = new Set(["owner", "member"]);
if (!ROLE_WHITELIST.has(roleInChat)) throw new Error("invalid role");
```

---

### WR-06: `messengerSearch.matchAndSnippet` is locale-naive — `toLowerCase` mis-handles Turkish `İ`, German `ß`, etc., and `text.slice` operates on UTF-16 code units

**File:** `server/services/messengerSearch.js:5-20`

**Issue:** `normalize` uses `.toLowerCase()` (not `toLocaleLowerCase`). For Turkish text "İSTANBUL".toLowerCase() === "i̇stanbul" (with combining dot) but the user's query "istanbul" will not match. `text.slice` operates on UTF-16 code units, so an emoji or astral-plane character at the boundary will produce a half-surrogate and a mojibake snippet returned to the client. `matchStart`/`matchLength` are likewise byte-ish indices that don't survive grapheme boundaries.

**Fix:** Use `String.prototype.normalize("NFC").toLocaleLowerCase()` and split into an array of code points (`[...text]`) before slicing, then re-join.

---

### WR-07: `messengerAccessNotifications.notifyAddedChat` reads `participants` AFTER the access-sync transaction may have committed but BEFORE the WS broadcast — stale view possible

**File:** `server/services/messengerAccessNotifications.js:21-49`

**Issue:** Three parallel queries are issued for chat/participants/receipts. If a concurrent `removeChatParticipant` lands between the `Promise.all` and the `broadcastToChat`, the broadcast carries a `participants` array that includes a user already removed. The receiver UI will then immediately observe a `participant_removed` event and may flicker. More importantly, the `ownParticipant.is_pinned` lookup runs against `participants` rather than against the freshly inserted row — `is_pinned` is initialised to false in `chat_participants` and this is fine, but if the user happened to have pinned the chat previously and was re-added, their old `is_pinned` value (if the row was soft-cleared) won't be reflected.

**Fix:** Either lock with `SELECT ... FOR SHARE` inside a transaction, or include a sequence number / version in the broadcast payload so the client can reconcile.

---

### WR-08: `setup.initDefaultAdmin` race on first boot; multiple processes can each insert an admin

**File:** `server/services/setup.js:5-20`

**Issue:** The function does `SELECT COUNT(*) FROM users`, then `createUser(...)`. With more than one app instance starting concurrently against the same fresh database, both will see count = 0 and both will try to insert; depending on the unique constraint on `username`, one will fail with a Postgres error — but the catch chain in the caller likely turns this into `process.exit(1)`, taking down a healthy node. Same issue in `initDefaultRoles` and `initDefaultDeficitPresets`.

**Fix:** Wrap each init in `INSERT ... ON CONFLICT DO NOTHING` semantics, or take a Postgres advisory lock (`pg_advisory_xact_lock`) before the check.

---

### WR-09: `permissions.getPermissionsForRole` `client`↔`viewer` fallback is order-dependent and partially recursive

**File:** `server/services/permissions.js:13-16`

**Issue:**
```js
let role = await getRoleByName(roleName);
if (!role && roleName === "client") role = await getRoleByName("viewer");
if (!role && roleName === "viewer") role = await getRoleByName("client");
```
If neither `viewer` nor `client` exists in the DB *and* the input is
`"viewer"`, the second branch fires and looks up `"client"`. If a future
maintainer reorders the two branches or adds a third alias the fallback
becomes ambiguous. Also `roleName` is taken as-is — passing `"VIEWER"` or
`" viewer "` produces no match where the human intent obviously matches.

**Fix:**
```js
const canonical = String(roleName || "").trim().toLowerCase();
const ALIASES = { client: ["viewer"], viewer: ["client"] };
let role = await getRoleByName(canonical);
for (const alias of ALIASES[canonical] || []) {
  if (role) break;
  role = await getRoleByName(alias);
}
```

---

## Info

### IN-01: `backup.js` filename sort relies on lexicographic stamp; correct *today* but fragile

**File:** `server/services/backup.js:33-42`

The `2life-YYYYMMDD-HHMMSS-...` format sorts correctly for the next ~8000
years; comment this invariant or sort by `fs.statSync(...).mtimeMs`.

---

### IN-02: `storage.js` `sameJson` is unused dead export by some callers; verify and prune

**File:** `server/services/storage.js:15`

`sameJson` compares JSON serialisations — non-deterministic for objects with
different key order. Either document the constraint or use a canonicalising
hash. If not used outside this module, remove it.

---

### IN-03: `messengerAccessNotifications` emits `participant_added` payload that includes the *full* participants list — leaks membership of unrelated participants to user being added

**File:** `server/services/messengerAccessNotifications.js:36-37`

The broadcast carries `participants` for every connected participant. This is
the expected behavior for a member list, but on a newly-added user this is the
first time they learn the entire member roster of a chat that may have been
private for a long time. If access-control policy ever requires per-member
visibility (e.g. anonymous members), this leaks it. Document or revisit.

---

### IN-04: `messengerStore.upsertMessengerDevice` accepts arbitrary `endpoint` / `p256dh` / `auth` strings with no length cap

**File:** `server/services/messengerStore.js:26-40`

A malicious client could store multi-MB strings in `messenger_devices` (no
column length limit usually). Add length validation (e.g. `endpoint ≤ 2048`,
`p256dh ≤ 256`, `auth ≤ 64` per Web-Push spec).

---

### IN-05: `setup.js` `initDefaultAdmin` logs the chosen username verbatim — fine, but message is mixed Cyrillic/quoted and may break log parsers

**File:** `server/services/setup.js:19`

Minor; consider structured logging.

---

### IN-06: `tokenBlacklist.js` uses one `setTimeout` per entry; large logout volume creates a timer-heap of equal size

**File:** `server/services/tokenBlacklist.js:13-19`

For a moderately sized service this is fine, but a logout storm (e.g. forced
password reset across all users) will allocate one timer per user that lives
for the full 8 hours. Prefer a single periodic sweeper that iterates a `Map<jti, expiry>` and deletes expired entries.

---

_Reviewed: 2026-05-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
