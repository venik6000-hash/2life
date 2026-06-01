/**
 * verifyPermissions.js — Phase 5 parity test
 *
 * Runs against a throwaway DB (passed via DATABASE_URL env var).
 * Asserts that the new single-query getPermissionsForRole and canAccessClient
 * produce byte-identical results to the old multi-query implementations.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/verifyPermissions.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema, getRoleByName, getRoleSections, getRolePermissions,
        hasAllClientsAccess, getAssignmentsByUser } = require("../services/db");
const { getPermissionsForRole } = require("../services/permissions");
const { canAccessClient } = require("../services/clientAccess");

// ── helpers ─────────────────────────────────────────────────────────────────

async function insertRole(name) {
  const r = await pool.query(
    "INSERT INTO roles (name, display_name) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id",
    [name, name]
  );
  return r.rows[0].id;
}

async function insertUser(username, role, allClientsAccess = false) {
  const r = await pool.query(
    "INSERT INTO users (username, password_hash, role, all_clients_access) VALUES ($1, 'x', $2, $3) RETURNING id",
    [username, role, allClientsAccess]
  );
  return r.rows[0].id;
}

async function insertClient(id) {
  await pool.query(
    "INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color) VALUES ($1,'t','t','',0,'','','') ON CONFLICT DO NOTHING",
    [id]
  );
}

async function assignUserToClient(userId, clientId) {
  await pool.query(
    "INSERT INTO client_assignments (user_id, client_id, assigned_by) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING",
    [userId, clientId]
  );
}

// Reproduce the OLD getPermissionsForRole logic using the db.js helpers
async function oldGetPermissionsForRole(roleName) {
  if (roleName === "admin") {
    const sections = ["overview","questionnaire","nutrition","menu","protocol","injections","analytics","lab","journal","messenger"];
    const sectionsObj = {};
    for (const s of sections) sectionsObj[s] = { read: true, write: true };
    return { sections: sectionsObj, canDeleteClient: true, canCreateClient: true, canImportData: true, isAdmin: true };
  }
  let role = await getRoleByName(roleName);
  if (!role && roleName === "client") role = await getRoleByName("viewer");
  if (!role && roleName === "viewer") role = await getRoleByName("client");
  if (!role) return null;

  const sectionRows = await getRoleSections(role.id);
  const permRows = await getRolePermissions(role.id);

  const sectionsObj = {};
  for (const row of sectionRows) {
    sectionsObj[row.section_id] = { read: row.can_read, write: row.can_write };
  }
  const perms = {};
  for (const row of permRows) {
    perms[row.permission] = row.granted;
  }
  return {
    sections: sectionsObj,
    canDeleteClient: !!perms["delete_client"],
    canCreateClient: !!perms["create_client"],
    canImportData:   !!perms["import_data"],
    isAdmin: false,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

const CLEANUP = [];  // collect cleanup functions in order; run in finally

(async () => {
  // SAFETY: this script DELETES role rows (including the real 'client'/'viewer' roles, for the
  // fallback test) and assignments. Refuse to run on anything but a throwaway DB whose name
  // contains "test", so an accidental DATABASE_URL pointed at the live DB can't wipe real roles.
  const { rows: [{ db }] } = await pool.query("SELECT current_database() AS db");
  if (!/test/i.test(db)) {
    throw new Error(`Refusing to run on non-throwaway database "${db}" — its name must contain "test".`);
  }

  // Step 1: Boot schema
  await initSchema();

  // ── Test role setup ──────────────────────────────────────────────────────
  const TEST_ROLE = "p5_test_role";

  // Ensure clean slate for test role
  await pool.query("DELETE FROM role_sections WHERE role_id IN (SELECT id FROM roles WHERE name=$1)", [TEST_ROLE]);
  await pool.query("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name=$1)", [TEST_ROLE]);
  await pool.query("DELETE FROM roles WHERE name=$1", [TEST_ROLE]);

  const roleId = await insertRole(TEST_ROLE);
  CLEANUP.push(async () => {
    await pool.query("DELETE FROM role_sections WHERE role_id=$1", [roleId]);
    await pool.query("DELETE FROM role_permissions WHERE role_id=$1", [roleId]);
    await pool.query("DELETE FROM roles WHERE id=$1", [roleId]);
  });

  // Insert role_sections: journal read+write, lab read-only
  await pool.query(
    "INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1,'journal',true,true),($1,'lab',true,false)",
    [roleId]
  );
  // Insert role_permissions: delete_client granted, create_client denied
  await pool.query(
    "INSERT INTO role_permissions (role_id, permission, granted) VALUES ($1,'delete_client',true),($1,'create_client',false)",
    [roleId]
  );

  // ── Test 3: PARITY deepEqual ─────────────────────────────────────────────
  const newResult = await getPermissionsForRole(TEST_ROLE);
  const oldResult = await oldGetPermissionsForRole(TEST_ROLE);
  assert.deepEqual(newResult, oldResult, "PARITY FAILED: new result != old result for test role");

  // ── Test 4: admin gets full access ───────────────────────────────────────
  const adminPerms = await getPermissionsForRole("admin");
  const expectedSections = ["overview","questionnaire","nutrition","menu","protocol","injections","analytics","lab","journal","messenger"];
  assert.equal(Object.keys(adminPerms.sections).length, 10, "admin should have exactly 10 sections");
  for (const s of expectedSections) {
    assert.deepEqual(adminPerms.sections[s], { read: true, write: true }, `admin section ${s} must be read+write`);
  }
  assert.equal(adminPerms.isAdmin, true, "admin isAdmin must be true");
  assert.equal(adminPerms.canDeleteClient, true);
  assert.equal(adminPerms.canCreateClient, true);
  assert.equal(adminPerms.canImportData, true);

  // ── Test 5: non-existent role → null ─────────────────────────────────────
  const noSuchRole = await getPermissionsForRole("definitely_no_such_role_xyz");
  assert.equal(noSuchRole, null, "non-existent role must return null");

  // ── Test 6: client→viewer fallback ───────────────────────────────────────
  // Ensure viewer role exists with some sections; ensure client role does NOT exist
  const VIEWER_ROLE = "viewer";
  const CLIENT_ROLE = "client";

  // Remember if client role existed before so we can restore it
  const clientRoleBefore = await getRoleByName(CLIENT_ROLE);

  // Remove client role if present
  if (clientRoleBefore) {
    await pool.query("DELETE FROM role_sections WHERE role_id=$1", [clientRoleBefore.id]);
    await pool.query("DELETE FROM role_permissions WHERE role_id=$1", [clientRoleBefore.id]);
    // (client_assignments references users/clients, NOT roles — no FK blocks the role delete.)
    await pool.query("DELETE FROM roles WHERE name=$1", [CLIENT_ROLE]);
    CLEANUP.push(async () => {
      // Restore client role (best-effort)
      await pool.query(
        "INSERT INTO roles (name, display_name) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [clientRoleBefore.name, clientRoleBefore.display_name || clientRoleBefore.name]
      );
    });
  }

  // Upsert viewer role with a known section
  let viewerRoleId;
  {
    const vr = await getRoleByName(VIEWER_ROLE);
    if (vr) {
      viewerRoleId = vr.id;
    } else {
      viewerRoleId = await insertRole(VIEWER_ROLE);
      CLEANUP.push(async () => {
        await pool.query("DELETE FROM role_sections WHERE role_id=$1", [viewerRoleId]);
        await pool.query("DELETE FROM role_permissions WHERE role_id=$1", [viewerRoleId]);
        await pool.query("DELETE FROM roles WHERE id=$1", [viewerRoleId]);
      });
    }
    // Ensure viewer has at least one section (overview)
    await pool.query(
      "INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1,'overview',true,false) ON CONFLICT (role_id, section_id) DO NOTHING",
      [viewerRoleId]
    );
  }

  const clientViaFallback = await getPermissionsForRole(CLIENT_ROLE);
  assert.notEqual(clientViaFallback, null, "client fallback to viewer must not return null");
  // The fallback result must equal a direct viewer lookup
  const viewerResult = await getPermissionsForRole(VIEWER_ROLE);
  assert.deepEqual(clientViaFallback, viewerResult, "client→viewer fallback must return identical result to direct viewer lookup");

  // ── Test 7: canAccessClient ───────────────────────────────────────────────
  const CLIENT_ID_A = "p5test_client_a";
  const CLIENT_ID_B = "p5test_client_b";
  await insertClient(CLIENT_ID_A);
  await insertClient(CLIENT_ID_B);
  CLEANUP.push(async () => {
    await pool.query("DELETE FROM clients WHERE id=$1", [CLIENT_ID_A]);
    await pool.query("DELETE FROM clients WHERE id=$1", [CLIENT_ID_B]);
  });

  // (a) admin role (passed as object — the fast path)
  const userAdmin = { id: 999999, role: "admin" };

  // (b) non-admin with all_clients_access=true
  const userBId = await insertUser("p5test_user_b", "viewer", true);
  CLEANUP.push(async () => pool.query("DELETE FROM users WHERE id=$1", [userBId]));
  const userB = { id: userBId, role: "viewer" };

  // (c) non-admin assigned to CLIENT_ID_A (not CLIENT_ID_B)
  const userCId = await insertUser("p5test_user_c", "viewer", false);
  CLEANUP.push(async () => pool.query("DELETE FROM users WHERE id=$1", [userCId]));
  await assignUserToClient(userCId, CLIENT_ID_A);
  CLEANUP.push(async () => pool.query("DELETE FROM client_assignments WHERE user_id=$1", [userCId]));
  const userC = { id: userCId, role: "viewer" };

  // (d) non-admin with no assignment
  const userDId = await insertUser("p5test_user_d", "viewer", false);
  CLEANUP.push(async () => pool.query("DELETE FROM users WHERE id=$1", [userDId]));
  const userD = { id: userDId, role: "viewer" };

  // (e) non-admin assigned to CLIENT_ID_A but INACTIVE. The new single-query canAccessClient
  // gates on u.active=true, so this must be DENIED — an intentional security tightening vs. the
  // old code, whose assignment path (getAssignmentsByUser) had no active filter and allowed it.
  const userEId = await insertUser("p5test_user_e", "viewer", false);
  await pool.query("UPDATE users SET active=false WHERE id=$1", [userEId]);
  CLEANUP.push(async () => pool.query("DELETE FROM users WHERE id=$1", [userEId]));
  await assignUserToClient(userEId, CLIENT_ID_A);
  CLEANUP.push(async () => pool.query("DELETE FROM client_assignments WHERE user_id=$1", [userEId]));
  const userE = { id: userEId, role: "viewer" };

  // Assertions
  assert.equal(await canAccessClient(null, CLIENT_ID_A), false, "null user must return false");
  assert.equal(await canAccessClient(userAdmin, CLIENT_ID_A), true, "admin must return true");
  assert.equal(await canAccessClient(userB, CLIENT_ID_A), true, "all_clients_access user must return true");
  assert.equal(await canAccessClient(userC, CLIENT_ID_A), true, "assigned user must return true for assigned client");
  assert.equal(await canAccessClient(userC, CLIENT_ID_B), false, "assigned user must return false for different client");
  assert.equal(await canAccessClient(userD, CLIENT_ID_A), false, "unassigned user must return false");
  assert.equal(await canAccessClient(userE, CLIENT_ID_A), false, "inactive assigned user must return false (active=true gating)");

  // Old-way parity for (c) and (d)
  const oldC_A = (await hasAllClientsAccess(userCId)) || (await getAssignmentsByUser(userCId)).some(r => r.client_id === CLIENT_ID_A);
  const oldD_A = (await hasAllClientsAccess(userDId)) || (await getAssignmentsByUser(userDId)).some(r => r.client_id === CLIENT_ID_A);
  assert.equal(await canAccessClient(userC, CLIENT_ID_A), oldC_A, "canAccessClient parity for user (c) on client A");
  assert.equal(await canAccessClient(userD, CLIENT_ID_A), oldD_A, "canAccessClient parity for user (d) on client A");

  console.log("permissions ok");
})().catch(err => {
  console.error("FAILED:", err.message);
  if (err.actual !== undefined || err.expected !== undefined) {
    console.error("  actual  :", JSON.stringify(err.actual));
    console.error("  expected:", JSON.stringify(err.expected));
  }
  process.exitCode = 1;
}).finally(async () => {
  // Clean up in reverse order
  for (const fn of CLEANUP.reverse()) {
    try { await fn(); } catch (_) {}
  }
  await pool.end();
});
