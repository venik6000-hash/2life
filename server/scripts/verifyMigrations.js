// Verifies runOnce executes a migration exactly once across two calls.
const assert = require("assert");
const { pool } = require("../services/db");
const { ensureMigrationsTable, runOnce, isApplied } = require("../services/migrations");

(async () => {
  await ensureMigrationsTable();
  const id = "_test_runonce_" + process.pid;
  await pool.query("DELETE FROM schema_migrations WHERE id = $1", [id]);
  let calls = 0;
  const r1 = await runOnce(id, async () => { calls += 1; });
  const r2 = await runOnce(id, async () => { calls += 1; });
  assert.strictEqual(r1.ran, true,  "first call should run");
  assert.strictEqual(r2.ran, false, "second call should be skipped");
  assert.strictEqual(calls, 1, "fn must execute exactly once");
  assert.strictEqual(await isApplied(id), true, "migration recorded");
  const id2 = id + "_fail";
  await pool.query("DELETE FROM schema_migrations WHERE id = $1", [id2]);
  let threw = false;
  try { await runOnce(id2, async () => { throw new Error("boom"); }); } catch { threw = true; }
  assert.strictEqual(threw, true, "failure should propagate");
  assert.strictEqual(await isApplied(id2), false, "failed migration must not be recorded");
  await pool.query("DELETE FROM schema_migrations WHERE id IN ($1,$2)", [id, id2]);
  console.log("✓ migrations runOnce verified");
  await pool.end();
})().catch((e) => { console.error("✗", e); process.exit(1); });
