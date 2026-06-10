/**
 * verifyMessengerPerms.js — iteration-2 step 2 test
 *
 * Verifies on a THROWAWAY DB that:
 *   1. The 2026-06_messenger_enable_staff_roles migration force-enables
 *      messenger read+write for existing STAFF roles (including roles with a
 *      messenger row stuck at write=false, and roles with no messenger row at
 *      all) while leaving CLIENT roles exactly as they were.
 *   2. getPermissionsForRoleCached returns fresh values after
 *      invalidatePermissionsCache() and respects the underlying change.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyMessengerPerms.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { getPermissionsForRole, getPermissionsForRoleCached, invalidatePermissionsCache } = require("../services/permissions");

const messengerPerms = async (roleName) => {
  const r = await pool.query(
    `SELECT rs.can_read, rs.can_write
     FROM role_sections rs JOIN roles ro ON ro.id = rs.role_id
     WHERE ro.name = $1 AND rs.section_id = 'messenger'`,
    [roleName]
  );
  return r.rows[0] || null;
};

(async () => {
  const dbNameRes = await pool.query("SELECT current_database() AS db");
  const dbName = dbNameRes.rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }

  // First boot: create full schema (also records the new migrations as done).
  await initSchema();

  // Simulate the PROD state the migration must fix: roles that existed before
  // the upgrade, with messenger permissions in every problematic shape.
  await pool.query(`
    INSERT INTO roles (name, display_name, is_system, is_client) VALUES
      ('staff_stuck',   'Сотрудник write=false', false, false),
      ('staff_norow',   'Сотрудник без строки',  false, false),
      ('patient_ro',    'Пациент read-only',     false, true),
      ('patient_full',  'Пациент полный',        false, true)
    ON CONFLICT (name) DO NOTHING`);
  const ids = {};
  for (const n of ["staff_stuck", "staff_norow", "patient_ro", "patient_full"]) {
    ids[n] = (await pool.query("SELECT id FROM roles WHERE name = $1", [n])).rows[0].id;
  }
  // staff_stuck: messenger row exists but write=false (the breaking case —
  // roles created via the old admin POST got read=true, write=false).
  await pool.query(
    "INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1,'messenger',true,false) ON CONFLICT (role_id, section_id) DO UPDATE SET can_read=true, can_write=false",
    [ids.staff_stuck]
  );
  // staff_norow: no messenger row at all (skip insert).
  // patient_ro: read-only messenger — admin's deliberate client config, must survive.
  await pool.query(
    "INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1,'messenger',true,false) ON CONFLICT (role_id, section_id) DO UPDATE SET can_read=true, can_write=false",
    [ids.patient_ro]
  );
  // patient_full: read+write — must also survive untouched.
  await pool.query(
    "INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1,'messenger',true,true) ON CONFLICT (role_id, section_id) DO UPDATE SET can_read=true, can_write=true",
    [ids.patient_full]
  );

  // Re-arm the migration (it already ran on the empty DB during first boot)
  // and run the boot sequence again — this reproduces prod's upgrade boot.
  await pool.query("DELETE FROM schema_migrations WHERE id = '2026-06_messenger_enable_staff_roles'");
  await initSchema();

  // 1. Staff roles: both shapes end up read+write.
  assert.deepEqual(await messengerPerms("staff_stuck"), { can_read: true, can_write: true },
    "staff role with write=false must be force-enabled");
  assert.deepEqual(await messengerPerms("staff_norow"), { can_read: true, can_write: true },
    "staff role without messenger row must get one with read+write");
  console.log("✓ migration enables messenger read+write for existing staff roles");

  // 2. Client roles: untouched.
  assert.deepEqual(await messengerPerms("patient_ro"), { can_read: true, can_write: false },
    "client role read-only messenger must NOT be touched");
  assert.deepEqual(await messengerPerms("patient_full"), { can_read: true, can_write: true },
    "client role full messenger must stay");
  console.log("✓ migration leaves client roles untouched");

  // 3. Permissions object reflects messenger section (what HTTP/WS checks use).
  const staffPerms = await getPermissionsForRole("staff_stuck");
  assert.deepEqual(staffPerms.sections.messenger, { read: true, write: true });
  const patientPerms = await getPermissionsForRole("patient_ro");
  assert.deepEqual(patientPerms.sections.messenger, { read: true, write: false });
  console.log("✓ getPermissionsForRole exposes enforced messenger perms");

  // 4. Cached variant: serves cached value, then fresh after invalidation.
  invalidatePermissionsCache();
  const before = await getPermissionsForRoleCached("patient_ro");
  assert.equal(before.sections.messenger.write, false);
  await pool.query(
    "UPDATE role_sections SET can_write = true WHERE role_id = $1 AND section_id = 'messenger'",
    [ids.patient_ro]
  );
  const cachedStill = await getPermissionsForRoleCached("patient_ro");
  assert.equal(cachedStill.sections.messenger.write, false, "within TTL the cached value is served");
  invalidatePermissionsCache();
  const after = await getPermissionsForRoleCached("patient_ro");
  assert.equal(after.sections.messenger.write, true, "after invalidation the fresh value is served");
  console.log("✓ permissions cache: TTL serve + explicit invalidation");

  console.log("\nALL MESSENGER PERMS TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
