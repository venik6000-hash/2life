---
phase: code-review-full-backend-routes
reviewed: 2026-05-19T00:00:00Z
depth: deep
files_reviewed: 10
files_reviewed_list:
  - server/index.js
  - server/middleware/auth.js
  - server/parsers/analytics.js
  - server/parsers/questionnaire.js
  - server/routes/analyticsFiles.js
  - server/routes/auth.js
  - server/routes/clients.js
  - server/routes/doctors.js
  - server/routes/import.js
  - server/routes/menu.js
findings:
  critical: 7
  blocker: 7
  warning: 13
  info: 6
  total: 26
status: issues_found
---

# Backend Routes / Middleware / Parsers — Deep Code Review

**Reviewed:** 2026-05-19
**Depth:** deep (cross-file analysis)
**Scope:** server/index.js, server/middleware/auth.js, server/parsers/{analytics,questionnaire}.js, server/routes/{analyticsFiles,auth,clients,doctors,import,menu}.js

**Excluded (reviewed separately):** server/routes/admin.js, server/routes/messenger.js

## Summary

Backend exhibits a generally consistent auth pattern (`requireAuth + requireSection*`) but several BLOCKER-grade defects exist:

1. **Path-traversal on uploaded filenames** in `analyticsFiles.js` — the latin1→utf8 decoded `originalName` is propagated to `display_name` and used as a `Content-Disposition filename*` without sanitization, and `storage_path` is joined to disk without verifying it stays inside the uploads dir.
2. **IDOR on dish admin endpoints** — POST/PATCH/DELETE `/menu/dishes` only require `requireSectionWrite("menu")` but are completely client-agnostic (any role with menu-write can mutate the global dish catalogue, and DELETE is a soft-delete masquerading as a destructive op).
3. **Missing authorization on doctors registry** — `GET /doctors` allows ANY authenticated user (including `role: "client"`) to enumerate the doctor list with personal data.
4. **No client-access check in `GET /clients/:clientId/menu` paths for menu items GET-by-week vs the `getMenuItemForClient` admin-cross-tenant scope leak** (mostly OK, see WR-04).
5. **Missing client-access enforcement on `GET /admin/users/:userId/clients`** — admin-only, OK, but `targetUserId` is not validated (`NaN` → `hasAllClientsAccess(NaN)` may misbehave depending on SQL coercion).
6. **`change-password` BCRYPT before transaction begins** — Not bug, but `await bcrypt.hash(newPassword, 12)` is invoked INSIDE the transaction (line 226), holding `FOR UPDATE` row locks on `users` and `user_public_keys` for ~250ms. Under concurrent password changes / admin patches this serializes auth traffic.
7. **`import-questionnaire` / `import-analytics` use `XLSX.readFile` on attacker-controlled file** — the `xlsx` package has a long history of prototype-pollution CVEs (e.g. GHSA-4r6h-8v6p-xvw6 in CVE-2023-30533, regex DoS GHSA-5pgg-2g8v-p4x9). No version pin verified here; combined with `app.use(express.json({ limit: "50mb" }))` and 50 MB upload limit, parser can be DoS'd.
8. **Express body limit set to 50 MB globally** — applied to every JSON endpoint including unauthenticated `/auth/login`, enabling cheap memory-exhaustion DoS pre-auth.

Below, findings are grouped by severity. Each BLOCKER finding documents the threat model and concrete fix.

---

## Critical Issues (BLOCKER)

### CR-01 / BL-01: Path-traversal risk in analytics file download / delete

**File:** `server/routes/analyticsFiles.js:141, 163`
**Issue:** `existing.storage_path` is read from the DB row and joined directly with `path.join(ANALYTICS_UPLOADS_DIR, existing.storage_path)`. While `storage_path` is currently written by the server as `${uuid}.ext`, there is no defense-in-depth check that the resolved path stays within `ANALYTICS_UPLOADS_DIR`. Any future codepath, migration, or DB write that puts `../../etc/passwd` into `storage_path` becomes an arbitrary-file-read (download) and arbitrary-file-delete vulnerability. The DB is treated as a trusted source of filenames — it should not be.
Additionally, `path.extname(file.originalname)` (line 23) is preserved verbatim from the uploaded filename — a user uploading `evil.pdf.exe` or `..%2F..%2Fpath.png` will have the extension reflected into the on-disk filename. The mimetype filter (line 30-36) only checks declared MIME; the extension is unbounded.
**Fix:**
```js
const filePath = path.resolve(ANALYTICS_UPLOADS_DIR, existing.storage_path);
if (!filePath.startsWith(ANALYTICS_UPLOADS_DIR + path.sep)) {
  return res.status(400).json({ error: "Invalid storage path" });
}
// And in the multer filename callback:
const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
cb(null, `${uuidv4()}${ext}`);
```

### CR-02 / BL-02: `Content-Disposition` header injection via display_name / original filename

**File:** `server/routes/analyticsFiles.js:168`
**Issue:** `downloadName = file.display_name || file.original_name` is sent through `encodeURIComponent`, which IS safe against header splitting — BUT `display_name` is set by the client in PATCH/POST (line 80, 83, 113-118) with NO length cap and NO control-character stripping before insert. A malicious display_name containing `\r\n` is encoded so the actual HTTP header is safe, but the persisted DB value can still contain newlines / control chars that may corrupt other code paths (logs, exports, downstream HTML rendering on the frontend). Combine with CR-01: `display_name` is also written as a fallback for `originalName` (line 83), making it user-influenced on disk.
**Fix:**
```js
const safeName = String(display_name || "").replace(/[\r\n\x00-\x1F\x7F]/g, "").slice(0, 200);
```
Apply on both POST and PATCH, and reject if empty after sanitization in POST.

### CR-03 / BL-03: Doctor registry exposed to ALL authenticated users (incl. clients)

**File:** `server/routes/doctors.js:10`
**Issue:** `router.get("/doctors", requireAuth(), ...)` — no role or section check. The doctor registry contains personal info (name, role, possibly linked user_id) and is returned to any holder of a valid JWT, including users with `role: "client"` who should only see their own data. This is a privacy / data-exposure defect.
**Fix:**
```js
router.get("/doctors", requireAuth(), requireSectionRead("overview"), async (req, res) => { ... });
// or restrict to admin/doctor/nutritionist explicitly:
router.get("/doctors", requireAuth("admin", "doctor", "nutritionist"), ...);
```

### CR-04 / BL-04: IDOR — global dish catalogue mutable by anyone with menu:write

**File:** `server/routes/menu.js:191, 208, 229`
**Issue:** Dish CRUD endpoints (`POST/PATCH/DELETE /menu/dishes[/:dishId]`) are guarded only by `requireSectionWrite("menu")`. Dishes are GLOBAL — they're not scoped to a client. Any user/role that has `menu` section write (potentially many roles by default config) can:
- Create arbitrary dishes that appear in everyone's menu pickers.
- Edit any existing dish (changing recipe/ingredients of a dish actively assigned to other clients' menus → silent data corruption across clients).
- Soft-delete (set active=false) any dish, removing it from all menu pickers.
This should be admin-only or behind a dedicated `manage_dishes` permission.
**Fix:** Add `requireAuth("admin")` or a new fine-grained permission gate on POST/PATCH/DELETE; GET can stay open to menu readers.

### CR-05 / BL-05: `Buffer.from(latin1).toString("utf8")` filename decode breaks for genuinely non-latin1 UAs

**File:** `server/routes/analyticsFiles.js:79`
**Issue:** This works for Node's default multer behavior on RFC-2047 unencoded multipart, but newer browsers send filenames as proper UTF-8 in `Content-Disposition` (RFC 5987 / 6266). Re-interpreting a string that is ALREADY valid UTF-8 as latin1 will produce mojibake (e.g. `Анализы.pdf` → `Ð?нализы.pdf`). The original_name then gets stored corrupted AND becomes the fallback display_name AND the download filename. This is a correctness bug masquerading as a fix.
**Fix:** Detect whether `originalname` already contains a non-latin1 character sequence (i.e. valid UTF-8 byte sequence in the string) before applying the reverse-encode. A safer approach:
```js
const decode = (s) => {
  // Heuristic: if it round-trips as UTF-8 it was already UTF-8.
  const buf = Buffer.from(s, "latin1");
  const utf8 = buf.toString("utf8");
  return /�/.test(utf8) ? s : utf8;
};
```
Better: configure multer with `defParamCharset: "utf8"` and avoid manual re-decode entirely.

### CR-06 / BL-06: Unauthenticated 50 MB JSON body limit — pre-auth DoS

**File:** `server/index.js:26`
**Issue:** `app.use(express.json({ limit: "50mb" }))` applies before the auth router, so `/api/auth/login` accepts a 50 MB JSON payload that is parsed (CPU/RAM) before bcrypt is even called. A single attacker socket can repeatedly POST 50 MB JSON to /login and exhaust the server. Combined with `loginLimiter` keyed on `ip+username` (line 86), an attacker rotating usernames bypasses the limiter.
**Fix:**
```js
app.use("/api/auth/login", express.json({ limit: "16kb" }));
app.use(express.json({ limit: "2mb" })); // sensible default for write APIs
// And consider a separate limit just for /api/clients bulk endpoints.
```

### CR-07 / BL-07: `xlsx` (SheetJS community) on attacker-controlled files — known CVEs

**File:** `server/routes/import.js:24, 56`; `server/parsers/questionnaire.js:1`; `server/parsers/analytics.js:1`
**Issue:** `XLSX.readFile(req.file.path)` runs the community SheetJS parser against an untrusted user file. The community `xlsx` (npm `xlsx@<0.20.2`) has historical prototype-pollution and ReDoS CVEs. Endpoints are auth-gated (`requirePermission("import_data")`), but any authenticated user with import permission (often many doctors) can trigger them. Additionally, parsed sheets can have unbounded row counts — `sheet_to_json(..., { header: 1 })` materialises the whole sheet to a JS array; a deliberately crafted XLSX with 1M empty rows × wide columns will OOM the process synchronously inside the request handler.
Note: `import.js:20-42` declares the handler as a synchronous arrow `(req, res) => { ... }`, but `XLSX.readFile` is a CPU-blocking sync call holding the event loop for the entire parse — concurrent uploads will starve all other requests.
**Fix:** Pin `xlsx` to the maintained CDN build (>= 0.20.2) or migrate to `exceljs`. Wrap parsing in a worker thread / child process. Add row count and sheet count guards before parsing fully (`wb.SheetNames.length`, `worksheet['!ref']` range size).

---

## Warnings

### WR-01: `targetUserId = Number(req.params.userId)` not validated before DB query

**File:** `server/routes/clients.js:273`
**Issue:** `Number("foo")` is `NaN`; `hasAllClientsAccess(NaN)` and `getAssignmentsByUser(NaN)` pass NaN into pg query parameters. pg will coerce to `'NaN'` and reject as invalid integer, throwing — handled by the `catch`, but the error returned to the client (`{ error: e.message }`, line 283) is the raw Postgres message, leaking schema info.
**Fix:** Validate `Number.isInteger(targetUserId) && targetUserId > 0` before any DB call; return 400.

### WR-02: Raw `e.message` returned in 500 responses across routes

**Files:** `server/routes/clients.js:21,61,77,125,184,201,221,232,249,265,283`; `server/routes/doctors.js:15,27`; `server/routes/menu.js:187,204,225,238,256,299,346,360,403`; `server/routes/analyticsFiles.js:59,95,122,145,172`; `server/routes/import.js:40,293`
**Issue:** Returning `{ error: e.message }` from generic catch blocks leaks Postgres error text, file paths from filesystem errors, and stack-trace-adjacent context to clients. Auth router (`server/routes/auth.js`) does this correctly (`"Внутренняя ошибка сервера"` + `console.error`).
**Fix:** Standardize: `console.error(...); res.status(500).json({ error: "Внутренняя ошибка сервера" });`. Reserve `e.message` for known-safe 400 errors.

### WR-03: `bcrypt.hash` inside transaction holding row locks

**File:** `server/routes/auth.js:225-227`
**Issue:** `await bcrypt.hash(newPassword, 12)` (~200-300ms on commodity hardware) runs while the row `FOR UPDATE` lock on `users` is held (acquired line 199) AND `user_public_keys FOR UPDATE` (line 219). Concurrent admin password changes against unrelated users will serialize at the bcrypt step. Hash the password BEFORE `BEGIN`:
```js
const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
await client.query("BEGIN");
...
await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, req.user.id]);
```
Same applies to `server/routes/auth.js:368` inside admin PATCH user.

### WR-04: `loadMenuItems` race between commit and re-read

**File:** `server/routes/menu.js:295, 343, 357, 399`
**Issue:** After `COMMIT` or non-transactional UPDATE, `loadMenuItems` uses the global `pool` (not the transactional `client`). On default `read-committed`, concurrent inserts from another request between COMMIT and the subsequent SELECT can yield inconsistent results returned to the caller (saw N+M items instead of N). Minor — at worst the client gets a snapshot that includes a sibling's insert.
**Fix:** Acceptable for current usage, but consider returning the in-transaction result directly to guarantee causality.

### WR-05: `parseFloat` of attacker-controlled cells with NaN cascade

**File:** `server/routes/import.js:236, 251`
**Issue:** `parseFloat(rangeMatch[1]) || 0` silently coerces non-numeric refs to 0; downstream consumers cannot distinguish "norm=0" from "norm not parseable". For lab markers this is a semantic bug — a refMin of 0 means "any negative is abnormal" which is misleading.
**Fix:** Set null for non-numeric and update consumers to handle null.

### WR-06: `currentCategory.name` set to row 0 text WITHOUT length cap

**File:** `server/routes/import.js:219`
**Issue:** XLSX cell can be megabytes long. The parsed structure is JSON-serialised back to the client and (presumably) eventually persisted in the DB. No max length on `col0`/`col1`/`col2`/cell values. A malicious uploader can craft a file that returns 200 MB of JSON.
**Fix:** Cap each cell: `col0 = String(row[0] || "").slice(0, 4096);`

### WR-07: `XLSX.SSF.parse_date_code(parseInt(s, 10))` — out-of-range serials

**File:** `server/routes/import.js:104`
**Issue:** Excel date serials > 2958465 (year 9999) cause `parse_date_code` to return `{ y: 10000+ }` which yields a malformed date. Negative or zero serials likewise produce invalid output. Years/months can spill into the JSON unchecked.
**Fix:** Guard with `if (d && d.y > 1900 && d.y < 2100) { ... }`.

### WR-08: `display_name = String(display_name).trim()` without length cap

**File:** `server/routes/auth.js:153, 403`
**Issue:** `display_name` is trimmed but not length-capped on admin patch (line 403) — only on self-patch (line 152, capped at 80). Admin can store a 10 MB display_name. Use `.slice(0, 80)` on both.

### WR-09: SSE endpoint leaks `res` object reference to global connections list — memory leak on errors before `req.on("close")`

**File:** `server/routes/clients.js:29-48`
**Issue:** `addConnection(res)` happens before the heartbeat is registered. If `res.flushHeaders()` throws (e.g. client aborts mid-handshake), the connection is added but `req.on("close")` may not fire, leaking. Also `heartbeat` write errors clear the interval but never call `removeConnection`.
**Fix:**
```js
const cleanup = () => { clearInterval(hb); removeConnection(res); };
req.on("close", cleanup);
res.on("error", cleanup);
const hb = setInterval(() => {
  try { res.write(": heartbeat\n\n"); } catch (_) { cleanup(); }
}, 25_000);
```

### WR-10: `applyClientPatchOps` deep-clones via JSON.parse(JSON.stringify(...)) — silently drops Dates/undefined/Maps

**File:** `server/routes/clients.js:487, 562`
**Issue:** `deepClone` via `JSON.parse(JSON.stringify(value))` drops `undefined` values, converts `Date` objects to ISO strings, drops functions, and throws on cyclic data. For client objects loaded from the DB this is OK today but is brittle — adding any non-JSON value to the schema (e.g. a `Buffer` from a future binary column) will silently corrupt patches.
**Fix:** Use `structuredClone(value)` (Node 17+).

### WR-11: `normalizePatchPath` allows numeric strings to bypass array-vs-object intent

**File:** `server/routes/clients.js:498-507`
**Issue:** A path segment of `"0"` (string) is accepted (passes `isSafePathSegment`'s string branch). Combined with `applySetPath`, this can create object-style index `{ "0": value }` on what should be an array, or vice versa. Not exploitable today thanks to `ALLOWED_CLIENT_PATCH_ROOTS`, but path semantics should be explicit.
**Fix:** Reject string segments that look like numbers; require callers to send `typeof === "number"` for array indices.

### WR-12: `getMenuItemForClient` allows admin enumeration but route handlers don't enforce admin-only

**File:** `server/routes/menu.js:141, 305, 350`
**Issue:** OK — `canAccessClient` is checked before `getMenuItemForClient`. False alarm. Still, the query in `getMenuItemForClient` filters by clientId so this is defense-in-depth.

### WR-13: `req.file.path` unlink on error may race with `XLSX.readFile`

**File:** `server/routes/import.js:39, 292`
**Issue:** `fs.unlinkSync` in the catch path: if `XLSX.readFile` is the thrower, the file still exists and unlink is fine; but if a later error occurs after the file was already unlinked (line 27, 61, 86), the catch tries to `existsSync` then unlink again — race exists with concurrent fs ops. Minor; mainly resource-cleanup brittleness.

---

## Info

### IN-01: Hardcoded port `3001`
**File:** `server/index.js:20` — Make `PORT = Number(process.env.PORT) || 3001`.

### IN-02: `app.use(cors({ origin: ... }))` falls back to localhost in production
**File:** `server/index.js:23` — If `CORS_ORIGIN` is unset in production deploy, cors silently accepts only localhost. Should fail loudly (similar to JWT_SECRET fatal check).

### IN-03: `console.error/console.log` mixed with no structured logger
**File:** `server/routes/import.js:38, 280, 291`; auth.js multiple places. Use the `services/logger` consistently.

### IN-04: `pool` imported but unused in `server/routes/analyticsFiles.js:8`
**File:** `server/routes/analyticsFiles.js:8` — Dead import.

### IN-05: Magic numbers `8h`, `12`, `8`, `80`, `160`
**Files:** auth.js `TOKEN_TTL = "8h"` (line 11), `BCRYPT_ROUNDS = 12` (line 19), password min 8 (line 184, 313), display_name 80 (line 152), device id 160 (line 57, 170-171). Centralize in a config module.

### IN-06: `validateDishPayload` returns `existing?.meal_type` for `mealType` but expects camelCase `mealType` from existing object
**File:** `server/routes/menu.js:88` — `existing?.meal_type` is snake_case from DB row in PATCH path (which is correct), but mixing styles in the same defaulting expression is a foot-gun. The check `DISH_TYPES.has(next.mealType)` would still pass since DB values are constrained. Cosmetic.

---

## Cross-File Observations (deep)

- **Auth gating consistency:** Every route module except `doctors.js` consistently applies `requireAuth() + requireSection*` or `requirePermission`. `doctors.js` is the outlier (CR-03).
- **Transaction boundaries:** `change-password` and admin user PATCH correctly use pool.connect + BEGIN/COMMIT with `FOR UPDATE`. However, `routes/clients.js` PUT/PATCH endpoints (line 116, 171) do NOT wrap `saveOneClient`/`patchClientLocked` + `upsertClientAssignment` + `autoAssignDoctors` + `appendActivityLog` in a single transaction. If the activity-log write fails after `saveOneClient` commits, the client is updated but the log is missing — silent audit gap.
- **`autoAssignDoctors` (clients.js:291)** silently swallows failures via the outer route catch but emits chat-access notifications mid-loop; partial failures leave some doctors assigned and others not, with no rollback.
- **`broadcast(event, data, res)` (clients.js:122, 177, 217)** — Passing `res` as excludeRes works only if the SSE list comparison is by identity. The PUT/PATCH/PUT-analytics handlers do NOT register an SSE connection on their `res` (those are HTTP request responses, not SSE), so passing `res` as exclude is a no-op — it doesn't filter anyone. Harmless but misleading.
- **`canAccessClient` is duplicated** in `routes/clients.js:311`, `routes/menu.js:25`, `routes/analyticsFiles.js:39` with subtly different implementations (clients.js uses `||` short-circuit, others use sequential awaits). Extract to a shared module.
- **`questionnaire.js` parser (2765 lines, monolithic)** has no top-level guard for `raw.length === 0`; if a sheet is empty, `qDetectGender` iterates zero rows and returns "unknown", then 2000+ subsequent lines proceed against empty arrays — most are defensive, but the surface area is large and untested. Recommend extracting normalized-section extractors into separate modules.

---

_Reviewed: 2026-05-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
