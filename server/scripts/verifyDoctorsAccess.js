/**
 * verifyDoctorsAccess.js — iteration-4 item 4
 *
 * GET /api/doctors was a bare requireAuth(): any logged-in user — including
 * client (patient) roles — could read the full doctor registry, doctor→account
 * linkage (user_id) included. The route now:
 *   - blocks client roles (canViewDoctorRegistry === false), and
 *   - strips user_id for non-admin staff (projectDoctorsForViewer).
 *
 * Verifies the pure authz helpers and the perms resolution that drives the gate
 * (getPermissionsForRole.isClient / isAdmin), against a throwaway DB.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyDoctorsAccess.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { getPermissionsForRole } = require("../services/permissions");
const { canViewDoctorRegistry, projectDoctorsForViewer } = require("../services/doctorsAccess");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  // 1. Pure gate predicate.
  assert.equal(canViewDoctorRegistry({ isClient: true }), false, "client role blocked");
  assert.equal(canViewDoctorRegistry({ isClient: false }), true, "staff role allowed");
  assert.equal(canViewDoctorRegistry({ isAdmin: true, isClient: false }), true, "admin allowed");
  assert.equal(canViewDoctorRegistry(null), false, "null perms (deleted/unknown role) blocked");
  console.log("✓ canViewDoctorRegistry blocks client + null, allows staff/admin");

  // 2. Pure projection: user_id only for admins.
  const rows = [{ name: "Иванов", role: "Кардиолог", user_id: 7 }];
  const adminView = projectDoctorsForViewer(rows, true);
  assert.equal(adminView[0].user_id, 7, "admin keeps user_id");
  const staffView = projectDoctorsForViewer(rows, false);
  assert.equal("user_id" in staffView[0], false, "non-admin view drops user_id");
  assert.deepEqual(staffView[0], { name: "Иванов", role: "Кардиолог" }, "non-admin view keeps name+role only");
  assert.deepEqual(projectDoctorsForViewer(null, false), [], "null doctors → []");
  console.log("✓ projectDoctorsForViewer strips user_id for non-admins");

  // 3. Integration: the perms that drive the gate resolve correctly.
  await pool.query(
    "INSERT INTO roles (name, display_name, is_client) VALUES ('s4_patient','Пациент',true) ON CONFLICT (name) DO UPDATE SET is_client=true"
  );
  await pool.query(
    "INSERT INTO roles (name, display_name, is_client) VALUES ('s4_staff','Сотрудник',false) ON CONFLICT (name) DO UPDATE SET is_client=false"
  );
  const patientPerms = await getPermissionsForRole("s4_patient");
  const staffPerms = await getPermissionsForRole("s4_staff");
  const adminPerms = await getPermissionsForRole("admin");
  assert.equal(canViewDoctorRegistry(patientPerms), false, "resolved client role is blocked end-to-end");
  assert.equal(canViewDoctorRegistry(staffPerms), true, "resolved staff role is allowed end-to-end");
  assert.equal(canViewDoctorRegistry(adminPerms) && adminPerms.isAdmin, true, "admin allowed + flagged admin (full rows)");
  console.log("✓ getPermissionsForRole drives the gate (patient blocked, staff+admin allowed)");

  console.log("\nALL DOCTORS-ACCESS TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
