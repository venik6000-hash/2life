import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mustContain = (source, needle, label) => assert.ok(source.includes(needle), label);
const mustNotContain = (source, needle, label) => assert.ok(!source.includes(needle), label);

const clientsRoute = read("server/routes/clients.js");
const messengerRoute = read("server/routes/messenger.js");
const importRoute = read("server/routes/import.js");
const authMiddleware = read("server/middleware/auth.js");
const authRoute = read("server/routes/auth.js");
const dbService = read("server/services/db.js");
const adminRoute = read("server/routes/admin.js");
const clientsRouteForDoctorSync = clientsRoute;
const devScript = read("dev.sh");
const wsService = read("server/services/ws.js");
const devCompose = read("docker-compose.dev.yml");
const migrationsService = read("server/services/migrations.js");
const doctorsRoute = read("server/routes/doctors.js");
const serverPackageJson = read("server/package.json");
const nginxConfig = read("nginx.conf");
const sseService = read("server/services/sse.js");
const indexService = read("server/index.js");

mustContain(authMiddleware, "loadCurrentUser", "auth middleware must load the current active user before trusting token role");
mustContain(authMiddleware, "JWT_SECRET.length < 32", "auth middleware must reject weak JWT secrets");
mustContain(authMiddleware, "active = true", "auth middleware must reject inactive users");
mustContain(authMiddleware, "currentUser.role", "auth middleware must authorize against the current DB role");
mustContain(authMiddleware, "isSseTicketRequest", "SSE tickets must be scoped to the /events endpoint");
mustNotContain(authRoute, ": req.user;", "/auth/me must not fall back to stale JWT payload when user row is missing");

mustContain(
  clientsRoute,
  'router.post("/clients", requireAuth("admin"), requirePermission("delete_client")',
  "bulk client replace must be limited to admins with destructive permission",
);
mustContain(clientsRoute, "BULK_CLIENT_REPLACE_EMPTY", "bulk client replace must reject accidental empty payloads");

mustContain(messengerRoute, "Number.isInteger(messageId)", "read receipts must validate message id");
mustContain(messengerRoute, "getMessageById(chatId, messageId)", "read receipts must verify the message belongs to the chat");
mustContain(messengerRoute, "READ_MESSAGE_NOT_FOUND", "read receipts must return a controlled missing-message response");
mustContain(wsService, "loadCurrentWsUser", "websocket auth must reload the current active user from DB");
mustContain(wsService, "refreshWsUser", "websocket handlers must refresh user role/activity before privileged actions");
mustContain(wsService, "revoked_auth_tokens", "websocket auth must check persisted session revocations");
mustContain(wsService, "currentUser.token_revoked", "websocket active sessions must close after persisted logout revocation");
mustContain(wsService, "forceLogoutJti", "logout must be able to close matching websocket sessions immediately");
mustContain(wsService, "forceLogoutUser", "password resets and deactivation must be able to close user websocket sessions");
mustContain(wsService, "startRevocationSweep", "idle websocket sockets must have a periodic revocation sweep, mirroring SSE");
mustContain(indexService, "startWsRevocationSweep", "server boot must start the websocket revocation sweep");
mustContain(wsService, "getMessageById(chatId, messageId)", "websocket read receipts must verify the message belongs to the chat");
mustContain(wsService, "READ_MESSAGE_NOT_FOUND", "websocket read receipts must handle missing messages without writing receipts");

mustContain(importRoute, "IMPORT_UPLOAD_MAX_BYTES", "import upload must have an app-level size limit");
mustContain(importRoute, "fileFilter", "import upload must filter accepted file types");
mustContain(importRoute, "multer.MulterError", "import upload must return controlled errors for rejected files");
mustContain(importRoute, "safeUnlink", "import upload must always clean temporary files safely");

mustContain(dbService, "assignment_source", "client assignments must record whether access is manual or doctor-derived");
mustContain(dbService, "backfill_doctor_assignment_source", "existing doctor-derived assignments must be backfilled as doctor source");
mustContain(dbService, "deleteDoctorClientAssignments", "doctor-derived assignments must have a dedicated cleanup helper");
mustContain(dbService, "replaceDoctorClientAssignments", "client doctor sync must prune stale doctor-derived assignments");
mustContain(adminRoute, "cleanupDoctorUserAssignments", "doctor unlink/delete must revoke doctor-derived assignments");
mustContain(clientsRouteForDoctorSync, "replaceDoctorClientAssignments", "client auto-assignment must replace stale doctor-derived assignments");
mustContain(clientsRouteForDoctorSync, "syncBulkDoctorAssignments", "bulk client replace must resync doctor-derived assignments and chat access");
mustContain(dbService, "VALUES ($1, $2, $3, 'doctor')", "doctor assignment replacement must mark doctor-derived access with doctor source");
mustContain(doctorsRoute, "syncDoctorAssignmentsForAllClients", "legacy /api/doctors bulk save must resync doctor-derived assignments and chat access");
mustContain(doctorsRoute, "replaceDoctorClientAssignments", "legacy doctor save must prune stale doctor-derived assignments");
mustContain(dbService, "getClientAssignment", "manual unassign must inspect assignment source before deleting");
mustContain(clientsRouteForDoctorSync, "DOCTOR_DERIVED_ASSIGNMENT", "manual unassign must not delete doctor-derived assignments");
mustContain(dbService, "manual_doctor", "client assignments must support overlapping manual and doctor-derived sources");
mustContain(dbService, "assignment_source = 'doctor'", "manual unassign of overlapping assignment must preserve doctor-derived access");

mustContain(authRoute, "ensureCanDemoteAdmin", "admin PATCH must protect the last active admin invariant");
mustContain(authRoute, "pg_advisory_xact_lock", "last-active-admin guard must serialize concurrent admin demotions");
mustContain(authRoute, "UPDATE users SET active = false", "admin delete must deactivate users instead of hard-deleting rows referenced by messenger");
mustContain(authRoute, "UPDATE users SET active = false, token_version = token_version + 1", "deactivation must revoke old JWTs before any later reactivation");
mustContain(dbService, "token_version", "users must store a token version for revoking all old JWTs");
mustContain(authMiddleware, "payload.token_version", "auth middleware must reject stale token versions after password changes");
mustContain(authRoute, "token_version = token_version + 1", "password changes/resets must revoke existing sessions by incrementing token version");
mustContain(authRoute, "DUMMY_PASSWORD_HASH", "login must equalize missing-user password checks");
mustContain(authRoute, 'req.user.role !== "admin" && safeCurrentPassword == null', "non-admin self password changes must require current password");
mustContain(authRoute, 'return res.status(400).json({ error: "Неверный текущий пароль" })', "wrong current password must be a form error, not a session-ending 401");
mustContain(serverPackageJson, "verify:password-change-rules", "password change product rules must have a focused route-level verifier");
mustContain(serverPackageJson, "verify:ws-auth-freshness", "websocket auth freshness must have a focused behavioral verifier");
mustContain(dbService, "revoked_auth_tokens", "logout revocations must persist across server restarts");
mustContain(nginxConfig, "Content-Security-Policy", "production frontend must send a restrictive CSP");
mustContain(authRoute, "resetMessengerCredentials(client, id)", "admin password reset must fall back to resetting messenger credentials when recovery is unavailable");
const adminPatchBlock = authRoute.slice(authRoute.indexOf('router.patch("/admin/users/:id"'));
assert.ok(
  adminPatchBlock.indexOf("forceLogoutReason =") < adminPatchBlock.indexOf("await client.query(\"COMMIT\")") &&
  adminPatchBlock.indexOf("await client.query(\"COMMIT\")") < adminPatchBlock.indexOf("forceLogoutUser(id, forceLogoutReason)"),
  "admin update websocket logout must run only after commit",
);

// SSE session revocation: long-lived /events streams must be torn down on logout /
// password change / role downgrade / deactivation, not held for the full token TTL.
mustContain(sseService, "closeConnectionsForUser", "SSE must be able to close all streams of a revoked/role-changed user");
mustContain(sseService, "closeConnectionsForJti", "SSE must be able to close the stream bound to a logged-out token");
mustContain(sseService, "revoked_auth_tokens", "SSE sweep must check persisted session revocations across processes");
mustContain(sseService, "token_version", "SSE sweep must drop streams whose token_version no longer matches");
mustContain(sseService, "String(auth.role) !== String(row.role)", "SSE sweep must also close streams whose role changed (role changes do not bump token_version)");
mustContain(clientsRoute, "addConnection(res, {", "SSE /events must bind each stream to the token that opened it");
mustContain(indexService, "startRevocationSweep", "server boot must start the SSE revocation sweep");
mustContain(authRoute, "sseCloseJti", "logout must close the matching SSE stream immediately");
mustContain(authRoute, "sseCloseUser", "password reset / role change / deactivation must close the user's SSE stream");
mustContain(serverPackageJson, "verify:sse-auth-freshness", "SSE auth freshness must have a focused behavioral verifier");
mustContain(authRoute, "loginIpLimiter", "login must apply a coarse per-IP rate limit on top of the per-username limit");
mustContain(indexService, 'app.set("trust proxy"', "server must trust the nginx proxy so per-IP rate limiting keys on the real client IP, not the proxy");
mustContain(dbService, "unsafe characters for DDL interpolation", "app DB-role password must be asserted safe before interpolation into the privileged DDL");

const authContext = read("src/context/AuthContext.jsx");
mustContain(authContext, "const requestToken = token", "frontend authFetch must bind each request to the token it used");
mustContain(authContext, "localStorage.getItem(TOKEN_KEY) === requestToken", "stale 401 responses must not clear a newer rotated session");
mustContain(authContext, 'fetch("/api/auth/me"', "frontend bootstrap must still verify the cached session");
mustContain(authContext, "if (localStorage.getItem(TOKEN_KEY) !== requestToken) return", "stale /auth/me responses must not clear or overwrite a newer rotated session");
const messengerSettings = read("src/components/MessengerSettingsPanel.jsx");
mustContain(messengerSettings, "applySession(data.token, data.user, data.permissions)", "messenger settings password change must apply the new token returned by the server");
mustContain(messengerSettings, "pwNew.length < 8", "messenger settings password form must match server minimum length");
mustContain(messengerSettings, "const currentPassword = pwCurrent.trim()", "blank current password must be normalized before password change submit");
mustContain(messengerSettings, ": { newPassword: pwNew }", "blank current password must be omitted so admins can reset without the old password");

const dashboardContext = read("src/context/DashboardContext.jsx");
mustContain(dashboardContext, "doctorsLoaded", "dashboard doctor autosave must know whether doctors were loaded");
mustContain(dashboardContext, "doctorsDirty", "dashboard doctor autosave must only run after local doctor edits");
mustContain(dashboardContext, "allowEmptyDoctorsSaveRef", "dashboard must distinguish intentional empty doctor saves from failed bootstrap");
mustContain(dashboardContext, '"/api/doctors?confirmEmpty=1"', "intentional empty doctor registry saves must pass explicit confirmation");
mustContain(dashboardContext, "if (!res?.ok) return null", "failed doctor bootstrap must not become an empty doctors list");
mustContain(dashboardContext, "scheduleReconnect", "SSE client must reconnect with a fresh one-time ticket after a server-initiated close, not retry the consumed one");
mustContain(doctorsRoute, "DOCTORS_BULK_EMPTY", "legacy doctor save must reject accidental empty autosaves unless explicitly confirmed");
mustContain(authRoute, "messengerReset = true", "admin self password change without old password must reset messenger credentials when they cannot be rewrapped");

mustContain(devScript, "ALLOW_STOP_PROD_CONTAINERS", "dev script must require explicit opt-in before stopping production containers");
assert.ok(
  devScript.indexOf("ALLOW_STOP_PROD_CONTAINERS") < devScript.indexOf("docker compose stop server frontend"),
  "dev script must guard production container stop behind explicit opt-in",
);
mustContain(devScript, "COMPOSE_PROJECT_NAME", "dev script must use an isolated compose project name");
mustContain(devScript, "PROD_COMPOSE_PROJECT_NAME", "dev script opt-in stop must target the production compose project explicitly");
mustContain(devScript, "DEV_COMPOSE_PROJECT_NAME", "dev script must not inherit production COMPOSE_PROJECT_NAME for dev commands");
mustContain(devScript, 'export COMPOSE_PROJECT_NAME="$DEV_COMPOSE_PROJECT_NAME"', "dev script must force the dev compose project after loading .env");
mustNotContain(devCompose, "external: true", "dev compose must not reuse the production external postgres volume");
mustNotContain(devCompose, "2life-dashboard_postgres_data", "dev compose volume must not point at the production volume name");

mustContain(migrationsService, "ON CONFLICT DO NOTHING RETURNING id", "runOnce must atomically claim a migration id before running side effects");
assert.ok(
  migrationsService.indexOf("ON CONFLICT DO NOTHING RETURNING id") < migrationsService.indexOf("await fn(client)"),
  "runOnce must claim the migration id before executing fn",
);

console.log("security hardening static verification ok");
