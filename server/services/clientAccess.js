const { getAssignmentsByUser, hasAllClientsAccess } = require("./db");

async function canAccessClient(user, clientId) {
  if (!user) return false;
  if (user.role === "admin" || await hasAllClientsAccess(user.id)) return true;
  const assigned = await getAssignmentsByUser(user.id);
  return assigned.some((row) => row.client_id === clientId);
}

module.exports = { canAccessClient };
