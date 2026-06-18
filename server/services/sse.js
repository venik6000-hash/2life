// Менеджер SSE-соединений (Server-Sent Events).
// Каждый браузер держит открытое соединение с сервером.
// Когда кто-то сохраняет изменения — сервер мгновенно уведомляет остальных.

const { pool } = require("./db");
const { isBlacklisted } = require("./tokenBlacklist");

// Each connection is the Express `res`. Authenticated streams carry
// res.__sseAuth = { userId, jti, tokenVersion } so a long-lived stream can be
// revoked after logout / password change / role downgrade / deactivation —
// without it, the /events stream stays authorized for the full 8h token TTL.
const connections = new Set();

// Добавить новое соединение (вызывается при GET /api/events)
const addConnection = (res, auth = null) => {
  if (auth) res.__sseAuth = auth;
  connections.add(res);
};

// Удалить соединение (вызывается когда браузер закрыл вкладку)
const removeConnection = (res) => {
  connections.delete(res);
};

const dropConnection = (res) => {
  connections.delete(res);
  try { res.end(); } catch (_) { /* already closed */ }
};

// Отправить событие всем подключённым браузерам.
// excludeRes — соединение которое само инициировало изменение (ему не нужно слать обратно).
const broadcast = (event, data, excludeRes = null) => {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    if (res === excludeRes) continue;
    // Instant same-process revocation: a logged-out jti must not keep receiving
    // live events between periodic sweeps. Mirrors the WS sendTo blacklist guard.
    const jti = res.__sseAuth?.jti;
    if (jti && isBlacklisted(jti)) { dropConnection(res); continue; }
    try {
      res.write(message);
    } catch (_) {
      // Соединение разорвалось — удаляем
      connections.delete(res);
    }
  }
};

// Like broadcast(), but for events scoped to a single client: only streams whose
// authenticated user may SEE that client receive it. Without this, a
// "client-updated" event (carrying the clientId) fans out to every staff stream
// — including users with no access to that client — leaking client-id existence
// and edit-activity timing. Mirrors the iter3 messenger.read delivery filter.
//
// `resolveAllowedUserIds(clientId)` is injected (returns an iterable of allowed
// user ids) so this module keeps its tiny dependency surface; the caller binds
// it to getUsersWithClientAccess(pool, …). Fails CLOSED: if access can't be
// resolved, nothing is sent rather than risking a leak.
const broadcastToClientWatchers = async (event, clientId, data, resolveAllowedUserIds, excludeRes = null) => {
  let allowed;
  try {
    const ids = await resolveAllowedUserIds(clientId);
    allowed = new Set(Array.from(ids || []).map(Number));
  } catch (_) {
    return; // fail closed — never leak a scoped event on a resolver error
  }
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    if (res === excludeRes) continue;
    const auth = res.__sseAuth;
    const jti = auth?.jti;
    // Same instant-revocation guard as broadcast().
    if (jti && isBlacklisted(jti)) { dropConnection(res); continue; }
    // Unauthenticated/legacy streams (no userId) are in no allow-set, so they
    // never receive client-scoped events — the safe default.
    if (!auth || !allowed.has(Number(auth.userId))) continue;
    try {
      res.write(message);
    } catch (_) {
      connections.delete(res);
    }
  }
};

// Close every stream owned by a user — role change, password reset, deactivation,
// deletion. The matching JWTs are already invalidated (token_version bump); this
// tears down the open stream so it cannot keep emitting until the tab is closed.
const closeConnectionsForUser = (userId) => {
  const uid = Number(userId);
  if (!Number.isInteger(uid)) return;
  for (const res of Array.from(connections)) {
    if (Number(res.__sseAuth?.userId) === uid) dropConnection(res);
  }
};

// Close the stream(s) bound to a specific revoked token — logout.
const closeConnectionsForJti = (jti) => {
  if (!jti) return;
  for (const res of Array.from(connections)) {
    if (res.__sseAuth?.jti === jti) dropConnection(res);
  }
};

// Backstop for revocations the per-process in-memory blacklist cannot see:
// a logout/password-change recorded by another process, token expiry, or a
// token_version bump. The WS layer re-validates on every inbound frame; SSE has
// no inbound frames, so a timer drives the same DB-backed freshness check.
const validateSseConnection = async (auth) => {
  if (!auth || !auth.userId) return true; // unauthenticated/legacy stream — leave it
  const r = await pool.query(
    `SELECT u.token_version, u.role,
            EXISTS (
              SELECT 1
                FROM revoked_auth_tokens rat
               WHERE rat.jti = $2
                 AND rat.expires_at > NOW()
            ) AS token_revoked
       FROM users u
      WHERE u.id = $1 AND u.active = true
      LIMIT 1`,
    [auth.userId, auth.jti || null]
  );
  const row = r.rows[0] || null;
  if (!row) return false;                  // user deactivated or deleted
  if (row.token_revoked) return false;     // jti revoked (cross-process safe)
  if (Number(auth.tokenVersion || 0) !== Number(row.token_version || 0)) return false; // password/deactivate
  // Role changes do NOT bump token_version (HTTP/WS apply the new role via live DB
  // re-read, by design). SSE has no per-event re-read, so the sweep is the backstop:
  // close a downgraded/changed stream and let the client reconnect under the new role.
  // This makes the sweep a complete revocation predicate, not dependent on the
  // same-process sseCloseUser call alone.
  if (auth.role != null && String(auth.role) !== String(row.role)) return false;
  return true;
};

const sweepRevokedConnections = async () => {
  for (const res of Array.from(connections)) {
    let keep = true;
    try {
      keep = await validateSseConnection(res.__sseAuth);
    } catch (_) {
      keep = true; // transient DB error — fail open, retry on the next sweep
    }
    if (!keep) dropConnection(res);
  }
};

let sweepTimer = null;
const startRevocationSweep = (intervalMs = 30_000) => {
  if (sweepTimer) return sweepTimer;
  sweepTimer = setInterval(() => { sweepRevokedConnections().catch(() => {}); }, intervalMs);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  return sweepTimer;
};

const stopRevocationSweep = () => {
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
};

module.exports = {
  addConnection,
  removeConnection,
  broadcast,
  broadcastToClientWatchers,
  closeConnectionsForUser,
  closeConnectionsForJti,
  sweepRevokedConnections,
  startRevocationSweep,
  stopRevocationSweep,
};
