const { pool } = require("./db");

// Returns full permissions object for a role name
// Admin always gets full access regardless of DB config
const getPermissionsForRole = async (roleName) => {
  if (roleName === 'admin') {
    const sections = ['overview','questionnaire','nutrition','menu','protocol','injections','analytics','lab','journal','messenger'];
    const sectionsObj = {};
    for (const s of sections) sectionsObj[s] = { read: true, write: true };
    return { sections: sectionsObj, canDeleteClient: true, canCreateClient: true, canImportData: true, isAdmin: true, isClient: false };
  }

  // Preserve the client↔viewer fallback: pick the requested role's id, else the fallback's id
  // (only when the requested one is absent), in a single round-trip.
  const fallback = roleName === "client" ? "viewer" : roleName === "viewer" ? "client" : null;
  const r = await pool.query(
    `WITH picked AS (
       SELECT id, is_client FROM roles WHERE name = $1
       UNION ALL
       SELECT id, is_client FROM roles WHERE name = $2 AND $2 IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM roles WHERE name = $1)
       LIMIT 1
     )
     SELECT p.is_client, rs.section_id, rs.can_read, rs.can_write, rp.permission, rp.granted
     FROM picked p
     LEFT JOIN role_sections rs ON rs.role_id = p.id
     LEFT JOIN role_permissions rp ON rp.role_id = p.id`,
    [roleName, fallback]
  );
  if (!r.rows.length) return null;   // no such role (and no fallback) — matches old `if (!role) return null`

  // The double LEFT JOIN yields a sections×permissions cross product; fold by key (dedupes naturally).
  const sectionsObj = {};
  const perms = {};
  for (const row of r.rows) {
    if (row.section_id != null) sectionsObj[row.section_id] = { read: row.can_read, write: row.can_write };
    if (row.permission != null) perms[row.permission] = row.granted;
  }
  return {
    sections: sectionsObj,
    canDeleteClient: !!perms['delete_client'],
    canCreateClient: !!perms['create_client'],
    canImportData:   !!perms['import_data'],
    isAdmin: false,
    isClient: !!r.rows[0].is_client,
  };
};

// Short-TTL cache for hot paths (every messenger HTTP request and every
// inbound WS message checks section permissions). Permission changes apply
// within TTL; admin role-edit routes also invalidate explicitly.
const PERM_CACHE_TTL_MS = 10_000;
const permCache = new Map(); // roleName -> { at, value }

const getPermissionsForRoleCached = async (roleName) => {
  const key = String(roleName || "");
  const hit = permCache.get(key);
  if (hit && Date.now() - hit.at < PERM_CACHE_TTL_MS) return hit.value;
  const value = await getPermissionsForRole(roleName);
  permCache.set(key, { at: Date.now(), value });
  return value;
};

const invalidatePermissionsCache = () => { permCache.clear(); };

module.exports = { getPermissionsForRole, getPermissionsForRoleCached, invalidatePermissionsCache };
