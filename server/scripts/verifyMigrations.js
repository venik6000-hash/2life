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
  const id3 = id + "_concurrent";
  await pool.query("DELETE FROM schema_migrations WHERE id = $1", [id3]);
  let concurrentCalls = 0;
  const [c1, c2] = await Promise.all([
    runOnce(id3, async () => {
      concurrentCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }),
    runOnce(id3, async () => {
      concurrentCalls += 1;
    }),
  ]);
  assert.strictEqual(concurrentCalls, 1, "concurrent runOnce calls must execute fn exactly once");
  assert.strictEqual([c1.ran, c2.ran].filter(Boolean).length, 1, "only one concurrent caller should run");
  assert.strictEqual(await isApplied(id3), true, "concurrent migration recorded");
  await pool.query("DELETE FROM schema_migrations WHERE id IN ($1,$2,$3)", [id, id2, id3]);
  console.log("✓ migrations runOnce verified");
  await pool.end();
})().catch((e) => { console.error("✗", e); process.exit(1); });
