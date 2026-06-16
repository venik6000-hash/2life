const assert = require("node:assert/strict");
process.env.MESSENGER_ENCRYPTION_SECRET = process.env.MESSENGER_ENCRYPTION_SECRET || "smoke-secret-at-least-32-chars-long!!";
const { pool, initSchema } = require("../services/db");
const store = require("../services/whoopStore");
const real = require("../services/whoopClient");

// Fake client: real pure helpers, fixture HTTP. Six declining recovery days so the window (>=6) inflection fires.
const fakeClient = {
  whoopDayKey: real.whoopDayKey, mapWhoopToObjective: real.mapWhoopToObjective,
  fetchRecovery: async () => ({ records: [
    { created_at: "2026-06-09T07:00:00Z", score: { recovery_score: 72, resting_heart_rate: 50, hrv_rmssd_milli: 90 } },
    { created_at: "2026-06-10T07:00:00Z", score: { recovery_score: 70, resting_heart_rate: 51, hrv_rmssd_milli: 88 } },
    { created_at: "2026-06-11T07:00:00Z", score: { recovery_score: 68, resting_heart_rate: 50, hrv_rmssd_milli: 89 } },
    { created_at: "2026-06-12T07:00:00Z", score: { recovery_score: 50, resting_heart_rate: 56, hrv_rmssd_milli: 60 } },
    { created_at: "2026-06-13T07:00:00Z", score: { recovery_score: 45, resting_heart_rate: 58, hrv_rmssd_milli: 56 } },
    { created_at: "2026-06-14T07:00:00Z", score: { recovery_score: 42, resting_heart_rate: 60, hrv_rmssd_milli: 55 } },
  ] }),
  fetchSleep: async () => ({ records: [{ created_at: "2026-06-14T07:00:00Z", score: { sleep_performance_percentage: 80, respiratory_rate: 15 } }] }),
  fetchCycle: async () => ({ records: [{ created_at: "2026-06-14T07:00:00Z", score: { strain: 11.1 } }] }),
};

async function main() {
  await initSchema();
  const s = Date.now(), clientId = `whoop-smoke-${s}`;
  const u = await pool.query("INSERT INTO users (username,password_hash,role) VALUES ($1,'x','admin') RETURNING id", [`whoop-u-${s}`]);
  const userId = u.rows[0].id;
  await pool.query("INSERT INTO clients (id,name,short_name,dob,age,sex,avatar,color) VALUES ($1,'W','W','',0,'','','')", [clientId]);

  // encrypted connection round-trip
  await store.upsertConnection({ clientId, userId, providerUserId: `puid-${s}`, accessToken: "AT-secret", refreshToken: "RT-secret", expiresIn: 3600, scopes: ["read:recovery", "offline"] });
  const conn = await store.getConnectionByClient(clientId);
  assert.equal(conn.accessToken, "AT-secret", "token decrypts back");
  const raw = await pool.query("SELECT access_token_enc FROM integration_connections WHERE client_id=$1", [clientId]);
  assert.ok(!raw.rows[0].access_token_enc.includes("AT-secret"), "token stored encrypted, not plaintext");
  assert.equal((await store.getConnectionByProviderUserId(`puid-${s}`)).clientId, clientId);

  // sync writes objective without clobbering an existing manual mood
  const waveStore = require("../services/waveStore");
  await waveStore.upsertCheckin({ clientId, userId, date: "2026-06-14", scores: { mood: 4 } });
  const sync = await store.syncConnection(conn, { days: 30, client: fakeClient });
  assert.ok(sync.days >= 2, "synced multiple days");
  const row = await waveStore.getCheckin(clientId, "2026-06-14");
  assert.equal(row.objective.recovery, 42, "objective written");
  assert.equal(row.objective.rhr_bpm, 60);
  assert.equal(row.scores.mood, 4, "manual mood preserved");
  assert.equal(row.source, "whoop");

  // objective scan: recovery dropped 70->42, rhr rose 50->60 over the window -> concern flags
  await store.scanObjectiveInflections(clientId, "2026-06-14");
  const flags = await pool.query("SELECT metric, kind FROM wave_flags WHERE client_id=$1", [clientId]);
  assert.ok(flags.rows.some((f) => f.metric === "recovery" && f.kind === "inflection_down"), "recovery drop flagged");

  // purge clears objective, keeps mood
  await store.purgeObjective(clientId);
  const after = await waveStore.getCheckin(clientId, "2026-06-14");
  assert.deepEqual(after.objective, {}, "objective purged");
  assert.equal(after.scores.mood, 4, "mood survives purge");

  await pool.query("DELETE FROM clients WHERE id=$1", [clientId]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  console.log("whoop store ok");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
