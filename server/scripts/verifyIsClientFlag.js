/**
 * verifyIsClientFlag.js — iteration-2 step 1 test
 *
 * Verifies the roles.is_client flag end to end on a THROWAWAY DB:
 *   1. initSchema creates the column and the runOnce backfill marks legacy
 *      'viewer'/'client' role rows (pre-existing rows path = prod upgrade path).
 *   2. isClientRoleName() classifies by flag, not by name (custom client role
 *      detected; custom staff role not), honors the client↔viewer alias, and
 *      reflects flag changes after cache invalidation.
 *   3. getPermissionsForRole() returns isClient.
 *   4. listUsers() exposes is_client per user.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyIsClientFlag.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema, listUsers, updateRoleIsClient, getRoleByName } = require("../services/db");
const { isClientRoleName, invalidateRoleFlagsCache } = require("../services/roleFlags");
const { getPermissionsForRole } = require("../services/permissions");

(async () => {
  const dbNameRes = await pool.query("SELECT current_database() AS db");
  const dbName = dbNameRes.rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }

  // ── Simulate the PROD UPGRADE PATH: a legacy roles table (no is_client
  // column, no backfill record) that already holds rows, then boot. ──────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      is_system BOOLEAN NOT NULL DEFAULT false
    )`);
  await pool.query(`ALTER TABLE roles DROP COLUMN IF EXISTS is_client`);
  await pool.query(`
    INSERT INTO roles (name, display_name, is_system) VALUES
      ('admin', 'Администратор', true),
      ('doctor', 'Врач', true),
      ('viewer', 'Клиент', false),
      ('my_custom_staff', 'Кастомный сотрудник', false)
    ON CONFLICT (name) DO NOTHING`);

  await initSchema();   // runs ALTER + runOnce backfill + rest of schema

  // 1. Backfill: legacy 'viewer' marked client; everything else stays staff.
  assert.equal((await getRoleByName("viewer")).is_client, true, "backfill must mark viewer as client");
  assert.equal((await getRoleByName("doctor")).is_client, false, "doctor must stay staff");
  assert.equal((await getRoleByName("my_custom_staff")).is_client, false, "custom role must stay staff (explicit flag, not name guessing)");
  console.log("✓ backfill: viewer→client, doctor/custom→staff");

  // Backfill must be one-shot: untick the flag, re-run initSchema, flag stays off.
  await updateRoleIsClient(false, (await getRoleByName("viewer")).id);
  await initSchema();
  assert.equal((await getRoleByName("viewer")).is_client, false, "backfill must NOT re-apply on next boot");
  await updateRoleIsClient(true, (await getRoleByName("viewer")).id);
  console.log("✓ backfill is one-shot (admin's later choice survives reboots)");

  // 2. isClientRoleName: flag-driven classification + alias + cache.
  invalidateRoleFlagsCache();
  assert.equal(await isClientRoleName("viewer"), true, "viewer is client");
  assert.equal(await isClientRoleName("client"), true, "legacy alias 'client' maps to viewer's flag");
  assert.equal(await isClientRoleName("doctor"), false, "doctor is staff");
  assert.equal(await isClientRoleName("my_custom_staff"), false, "custom staff role is staff");
  assert.equal(await isClientRoleName("admin"), false, "admin is never client");
  assert.equal(await isClientRoleName(""), false, "empty role is not client");
  assert.equal(await isClientRoleName("no_such_role"), false, "unknown role is not client");
  console.log("✓ isClientRoleName classifies by flag (incl. client↔viewer alias)");

  // Custom CLIENT role: the whole point of the change — name says nothing,
  // flag says client.
  await pool.query(
    "INSERT INTO roles (name, display_name, is_client) VALUES ('vip_patient', 'VIP пациент', true) ON CONFLICT (name) DO UPDATE SET is_client = true"
  );
  invalidateRoleFlagsCache();
  assert.equal(await isClientRoleName("vip_patient"), true, "custom role with is_client=true must be client");
  console.log("✓ custom client role recognized by flag, not name");

  // Flag change + cache invalidation (admin toggles checkbox).
  const vip = await getRoleByName("vip_patient");
  await updateRoleIsClient(false, vip.id);
  invalidateRoleFlagsCache();
  assert.equal(await isClientRoleName("vip_patient"), false, "after untick + invalidate, role is staff");
  await updateRoleIsClient(true, vip.id);
  invalidateRoleFlagsCache();
  console.log("✓ flag toggle + cache invalidation works");

  // 3. getPermissionsForRole carries isClient.
  await pool.query(`
    INSERT INTO role_sections (role_id, section_id, can_read, can_write)
    VALUES ($1, 'messenger', true, true) ON CONFLICT (role_id, section_id) DO NOTHING`, [vip.id]);
  const vipPerms = await getPermissionsForRole("vip_patient");
  assert.equal(vipPerms.isClient, true, "permissions.isClient must be true for client role");
  const adminPerms = await getPermissionsForRole("admin");
  assert.equal(adminPerms.isClient, false, "permissions.isClient must be false for admin");
  const doctorRole = await getRoleByName("doctor");
  await pool.query(`
    INSERT INTO role_sections (role_id, section_id, can_read, can_write)
    VALUES ($1, 'overview', true, true) ON CONFLICT (role_id, section_id) DO NOTHING`, [doctorRole.id]);
  const doctorPerms = await getPermissionsForRole("doctor");
  assert.equal(doctorPerms.isClient, false, "permissions.isClient must be false for staff role");
  console.log("✓ getPermissionsForRole returns isClient");

  // 4. listUsers exposes is_client per user (unknown role → false/staff).
  await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('t_vip', 'x', 'vip_patient'), ('t_doc', 'x', 'doctor'), ('t_ghost', 'x', 'ghost_role') ON CONFLICT DO NOTHING");
  const users = await listUsers();
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  assert.equal(byName.t_vip.is_client, true, "listUsers: vip user flagged client");
  assert.equal(byName.t_doc.is_client, false, "listUsers: doctor user is staff");
  assert.equal(byName.t_ghost.is_client, false, "listUsers: unknown role defaults to staff (false)");
  console.log("✓ listUsers exposes is_client per user");

  console.log("\nALL is_client FLAG TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
