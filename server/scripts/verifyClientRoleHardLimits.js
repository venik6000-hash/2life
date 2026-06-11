/**
 * verifyClientRoleHardLimits.js — iteration-3 task 3
 *
 * Client (is_client) roles have a mandatory server-side floor:
 *   1. getPermissionsForRole never exposes journal or action permissions
 *      for a client role, regardless of what role_sections/role_permissions hold.
 *   2. stripClientRoleDangerousGrants deletes those grants and revokes
 *      all_clients_access from the role's users (incl. client↔viewer alias).
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyClientRoleHardLimits.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema, withTransaction } = require("../services/db");
const { getPermissionsForRole, invalidatePermissionsCache } = require("../services/permissions");
const { invalidateRoleFlagsCache } = require("../services/roleFlags");
const { stripClientRoleDangerousGrants, roleNameVariants } = require("../services/clientRoleGuard");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  // A role holding everything a client role must NOT have.
  const roleRes = await pool.query(
    `INSERT INTO roles (name, display_name, is_client) VALUES ('t3g_role', 't3g_role', false)
     ON CONFLICT (name) DO UPDATE SET is_client = false RETURNING id, name`
  );
  const role = roleRes.rows[0];
  await pool.query(
    `INSERT INTO role_sections (role_id, section_id, can_read, can_write)
     VALUES ($1, 'journal', true, true), ($1, 'overview', true, false)
     ON CONFLICT (role_id, section_id) DO UPDATE SET can_read = true`,
    [role.id]
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission, granted)
     VALUES ($1, 'create_client', true), ($1, 'import_data', true)
     ON CONFLICT (role_id, permission) DO UPDATE SET granted = true`,
    [role.id]
  );
  const userId = (await pool.query(
    `INSERT INTO users (username, password_hash, role, active, all_clients_access)
     VALUES ('t3g_user', 'x', 't3g_role', true, true) RETURNING id`
  )).rows[0].id;

  // 1) Staff role: grants visible.
  let perms = await getPermissionsForRole("t3g_role");
  assert.equal(!!perms.sections.journal?.read, true, "staff role keeps its journal grant");
  assert.equal(perms.canCreateClient, true, "staff role keeps create_client");

  // 2) Flag as client: runtime floor strips everything dangerous even though
  //    the DB rows are still there.
  await pool.query("UPDATE roles SET is_client = true WHERE id = $1", [role.id]);
  invalidatePermissionsCache();
  invalidateRoleFlagsCache();
  perms = await getPermissionsForRole("t3g_role");
  assert.equal(perms.isClient, true, "role resolves as client");
  assert.equal(perms.sections.journal, undefined, "client role must not expose journal");
  assert.equal(!!perms.sections.overview?.read, true, "harmless sections survive");
  assert.equal(perms.canCreateClient, false, "client role must not expose create_client");
  assert.equal(perms.canImportData, false, "client role must not expose import_data");
  console.log("✓ runtime floor: journal + action permissions stripped for client roles");

  // 3) stripClientRoleDangerousGrants: clears DB rows + revokes all_clients_access.
  const revoked = await withTransaction((db) => stripClientRoleDangerousGrants(db, role));
  assert.deepEqual(revoked, [userId], "user with all_clients_access reported as revoked");
  const j = await pool.query(
    "SELECT 1 FROM role_sections WHERE role_id = $1 AND section_id = 'journal'", [role.id]);
  assert.equal(j.rows.length, 0, "journal section row deleted");
  const p = await pool.query(
    "SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission = 'create_client' AND granted = true", [role.id]);
  assert.equal(p.rows.length, 0, "create_client grant cleared");
  const u = await pool.query("SELECT all_clients_access FROM users WHERE id = $1", [userId]);
  assert.equal(u.rows[0].all_clients_access, false, "all_clients_access revoked");
  console.log("✓ strip: DB grants deleted, all_clients_access revoked");

  // 4) client↔viewer alias: a 'viewer' role row covers users carrying 'client'.
  assert.deepEqual(roleNameVariants("viewer").sort(), ["client", "viewer"], "viewer expands to both alias names");
  const viewerRole = (await pool.query(
    `INSERT INTO roles (name, display_name, is_client) VALUES ('viewer', 'viewer', true)
     ON CONFLICT (name) DO UPDATE SET is_client = true RETURNING id, name`
  )).rows[0];
  const aliasUserId = (await pool.query(
    `INSERT INTO users (username, password_hash, role, active, all_clients_access)
     VALUES ('t3g_alias_user', 'x', 'client', true, true) RETURNING id`
  )).rows[0].id;
  const revokedAlias = await withTransaction((db) => stripClientRoleDangerousGrants(db, viewerRole));
  assert.deepEqual(revokedAlias, [aliasUserId], "alias-named user also revoked");
  console.log("✓ alias: users under 'client' are covered by the 'viewer' role row");

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
