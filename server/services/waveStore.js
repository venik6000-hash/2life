const { pool, withTransaction } = require("./db");
const { METRIC_KEYS, computeDayMomentum, detectInflection } = require("./waveMath");

const isoDate = (d) => (d instanceof Date
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : String(d).slice(0, 10));

const sanitizeScores = (raw) => {
  const out = {};
  for (const key of METRIC_KEYS) {
    const v = Math.round(Number(raw?.[key]));
    if (Number.isFinite(v) && v >= 1 && v <= 5) out[key] = v;
  }
  return out;
};

function rowToCheckin(row) {
  if (!row) return null;
  return {
    date: isoDate(row.checkin_date),
    scores: row.scores || {},
    contextTags: row.context_tags || [],
    weight: row.weight == null ? null : Number(row.weight),
    restingHr: row.resting_hr == null ? null : Number(row.resting_hr),
    note: row.note || "",
    objective: row.objective || {},
    source: row.source || "manual",
    momentum: computeDayMomentum(row.scores || {}),
  };
}

async function upsertCheckin({ clientId, userId, date, scores, contextTags = [], weight = null, restingHr = null, note = "" }) {
  const cleanScores = sanitizeScores(scores);
  const tags = Array.isArray(contextTags) ? contextTags.map(String).slice(0, 12) : [];
  const w = weight == null || weight === "" ? null : Number(weight);
  const hr = restingHr == null || restingHr === "" ? null : Math.round(Number(restingHr));
  const res = await pool.query(
    `INSERT INTO wave_checkins (client_id, user_id, checkin_date, scores, context_tags, weight, resting_hr, note)
     VALUES ($1,$2,$3::date,$4::jsonb,$5::jsonb,$6,$7,$8)
     ON CONFLICT (client_id, checkin_date) DO UPDATE
       SET scores = EXCLUDED.scores, context_tags = EXCLUDED.context_tags, weight = EXCLUDED.weight,
           resting_hr = EXCLUDED.resting_hr, note = EXCLUDED.note, user_id = EXCLUDED.user_id, updated_at = now()
     RETURNING *`,
    [clientId, userId, isoDate(date), JSON.stringify(cleanScores), JSON.stringify(tags),
     Number.isFinite(w) ? w : null, Number.isFinite(hr) ? hr : null, String(note || "")]
  );
  return rowToCheckin(res.rows[0]);
}

async function getCheckin(clientId, date) {
  const res = await pool.query(
    "SELECT * FROM wave_checkins WHERE client_id = $1 AND checkin_date = $2::date LIMIT 1",
    [clientId, isoDate(date)]);
  return rowToCheckin(res.rows[0]);
}

async function getSeries(clientId, fromDate, toDate) {
  const res = await pool.query(
    `SELECT * FROM wave_checkins WHERE client_id = $1 AND checkin_date BETWEEN $2::date AND $3::date
     ORDER BY checkin_date ASC`, [clientId, isoDate(fromDate), isoDate(toDate)]);
  return res.rows.map(rowToCheckin);
}

async function listReactions(clientId) {
  const res = await pool.query(
    "SELECT id, pinned_date, kind, text FROM wave_reactions WHERE client_id = $1 ORDER BY pinned_date ASC, id ASC",
    [clientId]);
  return res.rows.map((r) => ({ id: r.id, pinnedDate: isoDate(r.pinned_date), kind: r.kind, text: r.text || "" }));
}

async function addReaction({ clientId, authorUserId, pinnedDate, kind, text = "" }) {
  const safeKind = kind === "note" ? "note" : "ack";
  const safeDate = isoDate(pinnedDate);
  const r = await withTransaction(async (c) => {
    const ins = await c.query(
      `INSERT INTO wave_reactions (client_id, author_user_id, pinned_date, kind, text)
       VALUES ($1,$2,$3::date,$4,$5) RETURNING *`,
      [clientId, authorUserId, safeDate, safeKind, String(text || "")]);
    await c.query(
      "UPDATE wave_flags SET status='addressed' WHERE client_id=$1 AND flag_date=$2::date AND status='open'",
      [clientId, safeDate]);
    return ins.rows[0];
  });
  return { id: r.id, pinnedDate: isoDate(r.pinned_date), kind: r.kind, text: r.text || "" };
}

// Client (is_client) users with 'wave' section enabled, assigned to a client, NOT checked in today.
async function listDueWaveCheckinReminders(today) {
  const res = await pool.query(
    `SELECT u.id AS user_id, ca.client_id
     FROM users u
     JOIN roles r ON r.name = u.role AND COALESCE(r.is_client, false) = true
     JOIN role_sections rs ON rs.role_id = r.id AND rs.section_id = 'wave' AND (rs.can_read OR rs.can_write)
     JOIN client_assignments ca ON ca.user_id = u.id
     LEFT JOIN wave_checkins wc ON wc.client_id = ca.client_id AND wc.checkin_date = $1::date
     WHERE u.active = true AND wc.id IS NULL`, [today]);
  return res.rows;
}

// Recompute inflection over the trailing window of the SUBJECTIVE momentum series; upsert open flags.
async function scanInflectionsForAllClients(today, lookbackDays = 14) {
  const res = await pool.query(
    `SELECT client_id, checkin_date, scores FROM wave_checkins
     WHERE checkin_date BETWEEN ($1::date - $2::int) AND $1::date ORDER BY client_id, checkin_date ASC`,
    [today, lookbackDays]);
  const byClient = new Map();
  for (const row of res.rows) {
    if (!byClient.has(row.client_id)) byClient.set(row.client_id, []);
    byClient.get(row.client_id).push({ date: isoDate(row.checkin_date), value: computeDayMomentum(row.scores || {}) });
  }
  let written = 0;
  for (const [clientId, series] of byClient) {
    for (const f of detectInflection(series)) {
      const ins = await pool.query(
        `INSERT INTO wave_flags (client_id, flag_date, kind, metric, magnitude, status)
         VALUES ($1,$2::date,$3,$4,$5,'open') ON CONFLICT (client_id, flag_date, kind, metric) DO NOTHING RETURNING id`,
        [clientId, f.flag_date, f.kind, f.metric, f.magnitude]);
      if (ins.rowCount > 0) written += 1;
    }
  }
  return { clients: byClient.size, written };
}

function flagRow(r) {
  return { id: r.id, clientId: r.client_id, clientName: r.client_name, flagDate: isoDate(r.flag_date),
    kind: r.kind, metric: r.metric || "", magnitude: Number(r.magnitude) };
}

async function listOpenFlagsForUser(user) {
  if (!user) return [];
  if (user.role === "admin") {
    const res = await pool.query(
      `SELECT f.*, c.name AS client_name FROM wave_flags f JOIN clients c ON c.id = f.client_id
       WHERE f.status='open' ORDER BY f.flag_date DESC, f.id DESC LIMIT 200`);
    return res.rows.map(flagRow);
  }
  const res = await pool.query(
    `SELECT f.*, c.name AS client_name FROM wave_flags f JOIN clients c ON c.id = f.client_id
     JOIN users u ON u.id = $1 AND u.active = true
     LEFT JOIN client_assignments ca ON ca.client_id = f.client_id AND ca.user_id = u.id
     WHERE f.status='open' AND (u.all_clients_access = true OR ca.user_id IS NOT NULL)
     ORDER BY f.flag_date DESC, f.id DESC LIMIT 200`, [user.id]);
  return res.rows.map(flagRow);
}

async function listClientUserIdsForClient(clientId) {
  const res = await pool.query(
    `SELECT u.id FROM client_assignments ca
     JOIN users u ON u.id = ca.user_id AND u.active = true
     JOIN roles r ON r.name = u.role AND COALESCE(r.is_client, false) = true
     WHERE ca.client_id = $1`, [clientId]);
  return res.rows.map((r) => r.id);
}

module.exports = {
  upsertCheckin, getCheckin, getSeries, listReactions, addReaction,
  listDueWaveCheckinReminders, scanInflectionsForAllClients, listOpenFlagsForUser, listClientUserIdsForClient,
};
