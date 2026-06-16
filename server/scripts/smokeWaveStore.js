const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const store = require("../services/waveStore");

async function main() {
  await initSchema();
  const tables = await pool.query(`SELECT to_regclass('public.wave_checkins') c,
    to_regclass('public.wave_reactions') r, to_regclass('public.wave_flags') f`);
  assert.equal(tables.rows[0].c, "wave_checkins");
  assert.equal(tables.rows[0].r, "wave_reactions");
  assert.equal(tables.rows[0].f, "wave_flags");

  const suffix = Date.now();
  const clientId = `wave-smoke-${suffix}`;
  const userRes = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1,'x','admin') RETURNING id", [`wave-u-${suffix}`]);
  const userId = userRes.rows[0].id;
  await pool.query("INSERT INTO clients (id,name,short_name,dob,age,sex,avatar,color) VALUES ($1,'WS','WS','',0,'','','')", [clientId]);

  const day1 = await store.upsertCheckin({ clientId, userId, date: "2026-06-01", scores: { energy: 4, sleep: 3, mood: 5, focus: 4, calm: 4 }, contextTags: ["workout"], weight: 80.5, restingHr: 58, note: "ok" });
  assert.equal(day1.momentum, 4);
  assert.deepEqual(day1.contextTags, ["workout"]);

  await store.upsertCheckin({ clientId, userId, date: "2026-06-01", scores: { energy: 2, sleep: 2, mood: 2, focus: 2, calm: 2 } });
  const reread = await store.getCheckin(clientId, "2026-06-01");
  assert.equal(reread.momentum, 2);
  const cnt = await pool.query("SELECT COUNT(*)::int n FROM wave_checkins WHERE client_id=$1", [clientId]);
  assert.equal(cnt.rows[0].n, 1, "upsert must not duplicate");

  for (let i = 0; i < 6; i++) {
    const s = Math.max(1, Math.round(5 - i * 0.6));
    await store.upsertCheckin({ clientId, userId, date: `2026-06-1${i}`, scores: { energy: s, sleep: s, mood: s, focus: s, calm: s } });
  }
  const scan = await store.scanInflectionsForAllClients("2026-06-15");
  assert.ok(scan.written >= 1, "expected a flag");
  const scan2 = await store.scanInflectionsForAllClients("2026-06-15");
  assert.equal(scan2.written, 0, "scan must be idempotent");

  const flagDay = (await pool.query("SELECT flag_date FROM wave_flags WHERE client_id=$1 AND status='open' LIMIT 1", [clientId])).rows[0].flag_date;
  await store.addReaction({ clientId, authorUserId: userId, pinnedDate: flagDay, kind: "note", text: "Видел спад" });
  const openAfter = await pool.query("SELECT COUNT(*)::int n FROM wave_flags WHERE client_id=$1 AND status='open' AND flag_date=$2", [clientId, flagDay]);
  assert.equal(openAfter.rows[0].n, 0, "reaction addresses the day's flag");

  await pool.query("DELETE FROM clients WHERE id=$1", [clientId]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  console.log("wave store ok");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
