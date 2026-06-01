const { pool } = require("./db");

// Returns full permissions object for a role name
// Admin always gets full access regardless of DB config
const getPermissionsForRole = async (roleName) => {
  if (roleName === 'admin') {
    const sections = ['overview','questionnaire','nutrition','menu','protocol','injections','analytics','lab','journal','messenger'];
    const sectionsObj = {};
    for (const s of sections) sectionsObj[s] = { read: true, write: true };
    return { sections: sectionsObj, canDeleteClient: true, canCreateClient: true, canImportData: true, isAdmin: true };
  }

  // Preserve the client↔viewer fallback: pick the requested role's id, else the fallback's id
  // (only when the requested one is absent), in a single round-trip.
  const fallback = roleName === "client" ? "viewer" : roleName === "viewer" ? "client" : null;
  const r = await pool.query(
    `WITH picked AS (
       SELECT id FROM roles WHERE name = $1
       UNION ALL
       SELECT id FROM roles WHERE name = $2 AND $2 IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM roles WHERE name = $1)
       LIMIT 1
     )
     SELECT rs.section_id, rs.can_read, rs.can_write, rp.permission, rp.granted
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
  };
};

module.exports = { getPermissionsForRole };
