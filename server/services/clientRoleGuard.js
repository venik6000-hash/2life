// Mandatory restrictions for client (patient) roles.
//
// A role flagged is_client must never hold: the staff-only journal section,
// admin-grade action permissions, or (via its users) all_clients_access.
// The admin UI hides these controls; admin routes reject them; and this
// module strips any existing grants when a role is flagged as client —
// so a mis-configured role cannot expose other patients' data.

const { LEGACY_ALIASES } = require("./roleFlags");

const BLOCKED_CLIENT_SECTIONS = new Set(["journal"]);
const BLOCKED_CLIENT_PERMISSIONS = new Set(["create_client", "delete_client", "import_data"]);

// 'client' and 'viewer' are historical aliases of one seeded role — users may
// carry either name while the roles row exists under the other.
const roleNameVariants = (name) => {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return [];
  const alias = LEGACY_ALIASES[n];
  return alias ? [n, alias] : [n];
};

// Strips grants a client role must never hold. Runs inside the caller's
// transaction (`db`); returns ids of users whose all_clients_access was
// revoked so the caller can re-sync their chat access after commit.
const stripClientRoleDangerousGrants = async (db, role) => {
  await db.query(
    "DELETE FROM role_sections WHERE role_id = $1 AND section_id = ANY($2)",
    [role.id, [...BLOCKED_CLIENT_SECTIONS]]
  );
  await db.query(
    "DELETE FROM role_permissions WHERE role_id = $1 AND permission = ANY($2)",
    [role.id, [...BLOCKED_CLIENT_PERMISSIONS]]
  );
  const variants = roleNameVariants(role.name);
  if (!variants.length) return [];
  const r = await db.query(
    `UPDATE users SET all_clients_access = false
     WHERE all_clients_access = true AND LOWER(TRIM(role)) = ANY($1)
     RETURNING id`,
    [variants]
  );
  return r.rows.map((row) => row.id);
};

module.exports = {
  stripClientRoleDangerousGrants,
  roleNameVariants,
  BLOCKED_CLIENT_SECTIONS,
  BLOCKED_CLIENT_PERMISSIONS,
};
