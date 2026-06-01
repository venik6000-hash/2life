const { pool } = require("./db");

async function canAccessClient(user, clientId) {
  if (!user) return false;
  if (user.role === "admin") return true;   // preserve the passed-object admin shortcut
  const r = await pool.query(
    `SELECT (u.all_clients_access OR ca.user_id IS NOT NULL) AS allowed
     FROM users u
     LEFT JOIN client_assignments ca ON ca.user_id = u.id AND ca.client_id = $2
     WHERE u.id = $1 AND u.active = true
     LIMIT 1`,
    [user.id, clientId]
  );
  return !!r.rows[0]?.allowed;
}

module.exports = { canAccessClient };
