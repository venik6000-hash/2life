const { pool } = require("./db");

// Single source of truth for "is this role a client (patient) role?".
// Previously this was decided by role NAME ('viewer'/'client'), so a custom
// role with any other name silently got staff-level treatment. Now it reads
// the explicit roles.is_client flag set by the admin.
//
// Cached because the check sits on hot request paths (every messenger call).
// The cache is invalidated explicitly on role changes (admin routes) and
// expires by TTL as a backstop for direct DB edits.

const CACHE_TTL_MS = 30_000;

let cache = { at: 0, names: new Set() };

const loadClientRoleNames = async () => {
  const now = Date.now();
  if (now - cache.at < CACHE_TTL_MS) return cache.names;
  const r = await pool.query("SELECT LOWER(TRIM(name)) AS name FROM roles WHERE is_client = true");
  cache = { at: now, names: new Set(r.rows.map((row) => row.name)) };
  return cache.names;
};

// 'client' and 'viewer' are historical aliases of the same seeded role — a DB
// may have either row while users carry the other name (mirrors the fallback
// in permissions.js). Without this, a user whose role row is absent under its
// own name would be treated as staff.
const LEGACY_ALIASES = { client: "viewer", viewer: "client" };

const isClientRoleName = async (roleName) => {
  const normalized = String(roleName || "").trim().toLowerCase();
  if (!normalized || normalized === "admin") return false;
  const names = await loadClientRoleNames();
  if (names.has(normalized)) return true;
  const alias = LEGACY_ALIASES[normalized];
  return alias ? names.has(alias) : false;
};

const invalidateRoleFlagsCache = () => {
  cache = { at: 0, names: new Set() };
};

module.exports = { isClientRoleName, invalidateRoleFlagsCache, LEGACY_ALIASES };
