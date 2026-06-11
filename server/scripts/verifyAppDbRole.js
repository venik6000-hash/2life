/**
 * verifyAppDbRole.js — iteration-3 task 5
 *
 * After ensureAppDbRole() the exported pool must run as a DML-only role:
 * SELECT/INSERT/UPDATE/DELETE/TRUNCATE work, DDL (CREATE/DROP TABLE) is
 * rejected, and the role is NOSUPERUSER/NOBYPASSRLS. APP_DB_ROLE=off keeps
 * the admin connection.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyAppDbRole.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema, ensureAppDbRole } = require("../services/db");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  const result = await ensureAppDbRole();
  assert.equal(result.switched, true, `pool must switch to the app role (got: ${result.reason || "ok"})`);

  const who = (await pool.query("SELECT current_user AS u")).rows[0].u;
  assert.equal(who, "app_2life", "runtime queries must run as app_2life");

  const flags = (await pool.query(
    "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'app_2life'"
  )).rows[0];
  assert.equal(flags.rolsuper, false, "app role must not be superuser");
  assert.equal(flags.rolbypassrls, false, "app role must not bypass RLS");
  assert.equal(flags.rolcreatedb, false, "app role must not create databases");
  assert.equal(flags.rolcreaterole, false, "app role must not create roles");
  console.log("✓ runtime pool runs as app_2life (no superuser, no BYPASSRLS)");

  // DML allowed
  await pool.query("INSERT INTO roles (name, display_name) VALUES ('t3db_role', 't3db_role') ON CONFLICT (name) DO NOTHING");
  const sel = await pool.query("SELECT 1 FROM roles WHERE name = 't3db_role'");
  assert.equal(sel.rows.length, 1, "INSERT+SELECT must work for the app role");
  await pool.query("DELETE FROM roles WHERE name = 't3db_role'");
  await pool.query("TRUNCATE TABLE message_receipts");
  console.log("✓ DML (SELECT/INSERT/DELETE/TRUNCATE) works");

  // DDL rejected
  await assert.rejects(
    () => pool.query("CREATE TABLE t3db_should_fail (id int)"),
    /permission denied|нет доступа/i,
    "CREATE TABLE must be rejected for the app role"
  );
  await assert.rejects(
    () => pool.query("DROP TABLE users"),
    /must be owner|permission denied|владельцем/i,
    "DROP TABLE must be rejected for the app role"
  );
  console.log("✓ DDL (CREATE/DROP TABLE) rejected");

  // setval path used by messengerReset works for the app role
  await pool.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)
     WHERE pg_get_serial_sequence($1, 'id') IS NOT NULL`,
    ["message_receipts"]
  );
  console.log("✓ sequence reset (setval) works for the app role");

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
