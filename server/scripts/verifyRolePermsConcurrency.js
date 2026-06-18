/**
 * verifyRolePermsConcurrency.js — iteration-4 item 5 (server side)
 *
 * Two admins editing the same role's permissions used to silently overwrite each
 * other — the PUT /admin/roles/:id/sections save had no row versioning. roles
 * now carries a `version` column and bumpRoleVersion() guards saves with
 * optimistic concurrency. Verifies on a throwaway DB:
 *   1. initSchema adds roles.version (default 0).
 *   2. A guarded bump with the matching version succeeds and increments.
 *   3. A guarded bump with a STALE version returns null (→ 409) and does NOT
 *      change the stored version.
 *   4. An unconditional bump (null expected) always increments.
 *   5. Two concurrent guarded bumps on the same version: exactly one wins.
 *
 * roles.version is NOT users.token_version — role/perm edits must never bump
 * token_version (that would break the live role re-read / SSE-sweep revocation).
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyRolePermsConcurrency.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema, getRoleById, bumpRoleVersion } = require("../services/db");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  // 1. Column exists, default 0.
  const colRes = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='roles' AND column_name='version'"
  );
  assert.equal(colRes.rowCount, 1, "roles.version column exists");
  const roleId = (await pool.query(
    "INSERT INTO roles (name, display_name) VALUES ('s5_role','S5') ON CONFLICT (name) DO UPDATE SET display_name='S5' RETURNING id"
  )).rows[0].id;
  assert.equal((await getRoleById(roleId)).version, 0, "new role starts at version 0");
  console.log("✓ roles.version column exists, defaults to 0");

  // 2. Matching version bumps.
  assert.equal(await bumpRoleVersion(pool, roleId, 0), 1, "bump with matching version → 1");
  assert.equal((await getRoleById(roleId)).version, 1, "stored version is 1");

  // 3. Stale version is rejected and leaves version untouched.
  assert.equal(await bumpRoleVersion(pool, roleId, 0), null, "stale expected version → null (conflict)");
  assert.equal((await getRoleById(roleId)).version, 1, "rejected bump must not change version");
  console.log("✓ matching bump increments; stale bump rejected without side effects");

  // 4. Unconditional bump.
  assert.equal(await bumpRoleVersion(pool, roleId, null), 2, "unconditional bump → 2");
  console.log("✓ unconditional (null expected) bump increments");

  // 5. Concurrent guarded bumps on the same version — exactly one wins.
  const [a, b] = await Promise.all([
    bumpRoleVersion(pool, roleId, 2),
    bumpRoleVersion(pool, roleId, 2),
  ]);
  const winners = [a, b].filter((v) => v !== null);
  const losers = [a, b].filter((v) => v === null);
  assert.equal(winners.length, 1, "exactly one concurrent guarded bump succeeds");
  assert.equal(losers.length, 1, "the other concurrent bump is rejected");
  assert.equal((await getRoleById(roleId)).version, 3, "version advanced by exactly one");
  console.log("✓ concurrent guarded bumps: one winner, one rejected");

  console.log("\nALL ROLE-PERMS-CONCURRENCY TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
