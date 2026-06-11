const { pool } = require("./db");

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // должен совпадать с TOKEN_TTL в auth.js

/** @type {Map<string, number>} jti -> expiry timestamp */
const blacklist = new Map();

const normalizeExpiry = (expiresAt) => {
  if (expiresAt instanceof Date) return expiresAt;
  const numeric = Number(expiresAt);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
  }
  return new Date(Date.now() + TOKEN_TTL_MS);
};

const remember = (jti, expiresAt) => {
  const expiryMs = expiresAt.getTime();
  if (expiryMs > Date.now()) blacklist.set(jti, expiryMs);
};

const blacklistToken = async (jti, expiresAt) => {
  const safeJti = String(jti || "").trim();
  if (!safeJti) return false;
  const expiry = normalizeExpiry(expiresAt);
  remember(safeJti, expiry);
  await pool.query(
    `INSERT INTO revoked_auth_tokens (jti, expires_at)
     VALUES ($1, $2)
     ON CONFLICT (jti) DO UPDATE
       SET expires_at = GREATEST(revoked_auth_tokens.expires_at, EXCLUDED.expires_at)`,
    [safeJti, expiry]
  );
  pool.query("DELETE FROM revoked_auth_tokens WHERE expires_at <= NOW()").catch(() => {});
  return true;
};

const isBlacklisted = (jti) => {
  const safeJti = String(jti || "").trim();
  if (!safeJti) return false;
  const expiryMs = blacklist.get(safeJti);
  if (!expiryMs) return false;
  if (expiryMs > Date.now()) return true;
  blacklist.delete(safeJti);
  return false;
};

const isTokenRevoked = async (jti) => {
  const safeJti = String(jti || "").trim();
  if (!safeJti) return false;
  if (isBlacklisted(safeJti)) return true;
  const result = await pool.query(
    "SELECT expires_at FROM revoked_auth_tokens WHERE jti = $1 AND expires_at > NOW() LIMIT 1",
    [safeJti]
  );
  const expiresAt = result.rows[0]?.expires_at ? new Date(result.rows[0].expires_at) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime())) return false;
  remember(safeJti, expiresAt);
  return true;
};

module.exports = { blacklistToken, isBlacklisted, isTokenRevoked };
