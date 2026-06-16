const { pool } = require("./db");
const { encryptText, decryptText } = require("./messengerCrypto");
const whoop = require("./whoopClient");
const { detectMetricInflection, OBJECTIVE_FLAG_METRICS } = require("./waveMath");

const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

async function upsertConnection({ clientId, userId, source = "whoop", providerUserId, accessToken, refreshToken, expiresIn, scopes = [] }) {
  const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString() : null;
  await pool.query(
    `INSERT INTO integration_connections (client_id,user_id,source,provider_user_id,access_token_enc,refresh_token_enc,token_expires_at,scopes,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'active')
     ON CONFLICT (client_id, source) DO UPDATE SET user_id=EXCLUDED.user_id, provider_user_id=EXCLUDED.provider_user_id,
       access_token_enc=EXCLUDED.access_token_enc, refresh_token_enc=EXCLUDED.refresh_token_enc,
       token_expires_at=EXCLUDED.token_expires_at, scopes=EXCLUDED.scopes, status='active', last_error=NULL`,
    [clientId, userId, source, providerUserId || null, encryptText(accessToken), encryptText(refreshToken), expiresAt, JSON.stringify(scopes)]);
}

function rowToConn(r) {
  if (!r) return null;
  return { id: r.id, clientId: r.client_id, userId: r.user_id, source: r.source, providerUserId: r.provider_user_id,
    accessToken: r.access_token_enc ? decryptText(r.access_token_enc) : null,
    refreshToken: r.refresh_token_enc ? decryptText(r.refresh_token_enc) : null,
    expiresAt: r.token_expires_at, lastSyncAt: r.last_sync_at, status: r.status, scopes: r.scopes || [] };
}
async function getConnectionByClient(clientId, source = "whoop") {
  const res = await pool.query("SELECT * FROM integration_connections WHERE client_id=$1 AND source=$2 LIMIT 1", [clientId, source]);
  return rowToConn(res.rows[0]);
}
async function getConnectionByProviderUserId(providerUserId, source = "whoop") {
  const res = await pool.query("SELECT * FROM integration_connections WHERE provider_user_id=$1 AND source=$2 AND status='active' LIMIT 1", [String(providerUserId), source]);
  return rowToConn(res.rows[0]);
}
async function setStatus(clientId, status, lastError = null, source = "whoop") {
  await pool.query("UPDATE integration_connections SET status=$2, last_error=$3 WHERE client_id=$1 AND source=$4", [clientId, status, lastError, source]);
}
async function deleteConnection(clientId, source = "whoop") {
  await pool.query("DELETE FROM integration_connections WHERE client_id=$1 AND source=$2", [clientId, source]);
}
async function purgeObjective(clientId) {
  await pool.query("UPDATE wave_checkins SET objective='{}'::jsonb, source='manual', ingested_at=NULL WHERE client_id=$1 AND source='whoop'", [clientId]);
}

// Write the WHOOP objective block for a day WITHOUT touching subjective `scores`.
async function upsertObjective({ clientId, userId, date, objective }) {
  await pool.query(
    `INSERT INTO wave_checkins (client_id,user_id,checkin_date,objective,source,ingested_at)
     VALUES ($1,$2,$3::date,$4::jsonb,'whoop',now())
     ON CONFLICT (client_id, checkin_date) DO UPDATE SET objective=EXCLUDED.objective, source='whoop', ingested_at=now(), updated_at=now()`,
    [clientId, userId, isoDate(date), JSON.stringify(objective || {})]);
}

// Pull recent WHOOP data and write per-day objective. `client` is injectable for tests.
async function syncConnection(conn, { days = 14, client = whoop } = {}) {
  if (!conn) return { days: 0 };
  const startIso = new Date(Date.now() - days * 86400000).toISOString();
  const [rec, slp, cyc] = await Promise.all([
    client.fetchRecovery(conn.accessToken, startIso),
    client.fetchSleep(conn.accessToken, startIso),
    client.fetchCycle(conn.accessToken, startIso),
  ]);
  const byDay = new Map(); // date -> { recovery, sleep, cycle }
  const put = (rows, key) => { for (const r of rows || []) { const d = client.whoopDayKey(r); if (!d) continue; if (!byDay.has(d)) byDay.set(d, {}); byDay.get(d)[key] = r; } };
  put(rec.records, "recovery"); put(slp.records, "sleep"); put(cyc.records, "cycle");
  let written = 0;
  for (const [date, parts] of byDay) {
    const objective = client.mapWhoopToObjective(parts);
    if (Object.keys(objective).length) { await upsertObjective({ clientId: conn.clientId, userId: conn.userId, date, objective }); written += 1; }
  }
  await pool.query("UPDATE integration_connections SET last_sync_at=now(), last_error=NULL WHERE id=$1", [conn.id]);
  return { days: written };
}

// Build per-metric series from objective JSONB and upsert flags.
// CORRECTIONS vs the original plan draft (intentional — keep them):
//   (1) the series filter excludes null/undefined values (null != 0) so an empty objective field cannot fire a false flag;
//   (2) the ON CONFLICT target is the 4-column (client_id,flag_date,kind,metric) — matching the wave_flags UNIQUE key
//       (which now includes `metric` so per-metric objective flags don't collide with subjective flags on the same date+kind).
async function scanObjectiveInflections(clientId, today, lookbackDays = 14) {
  const res = await pool.query(
    `SELECT checkin_date, objective FROM wave_checkins
     WHERE client_id=$1 AND checkin_date BETWEEN ($2::date - $3::int) AND $2::date AND objective <> '{}'::jsonb
     ORDER BY checkin_date ASC`, [clientId, today, lookbackDays]);
  let written = 0;
  for (const cfg of OBJECTIVE_FLAG_METRICS) {
    const series = res.rows
      .map((r) => ({ date: isoDate(r.checkin_date), value: r.objective?.[cfg.metric] }))
      .filter((d) => d.value != null && Number.isFinite(Number(d.value)));
    const thr = cfg.metric === "recovery" || cfg.metric === "sleep_perf" ? 6 : cfg.metric === "rhr_bpm" ? 3 : 5;
    for (const f of detectMetricInflection(series, { ...cfg, threshold: thr })) {
      const ins = await pool.query(
        `INSERT INTO wave_flags (client_id,flag_date,kind,metric,magnitude,status)
         VALUES ($1,$2::date,$3,$4,$5,'open') ON CONFLICT (client_id,flag_date,kind,metric) DO NOTHING RETURNING id`,
        [clientId, f.flag_date, f.kind, f.metric, f.magnitude]);
      if (ins.rowCount > 0) written += 1;
    }
  }
  return { written };
}

async function listActiveConnections() {
  const res = await pool.query("SELECT * FROM integration_connections WHERE status='active'");
  return res.rows.map(rowToConn);
}

module.exports = {
  upsertConnection, getConnectionByClient, getConnectionByProviderUserId, setStatus, deleteConnection,
  purgeObjective, upsertObjective, syncConnection, scanObjectiveInflections, listActiveConnections,
};
