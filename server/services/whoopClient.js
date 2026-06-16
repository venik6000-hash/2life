const crypto = require("node:crypto");

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
// NOTE: confirm the "/developer" prefix on the first live call; v1 used api.prod.whoop.com/developer/v1.
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
const SCOPES = ["read:recovery", "read:sleep", "read:cycles", "read:workout", "read:body_measurement", "read:profile", "offline"];

// ---- pure helpers ----
function buildAuthorizeUrl({ clientId, redirectUri, state, scopes = SCOPES }) {
  const u = new URL(WHOOP_AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", scopes.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

const num = (v) => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const r1 = (n) => (n == null ? undefined : Math.round(n * 10) / 10);

// Map verified v2 fields. Stores raw numbers; NO interpretation (no AI, no verdict).
function mapWhoopToObjective({ recovery, sleep, cycle } = {}) {
  const o = {};
  const rs = recovery && recovery.score, ss = sleep && sleep.score, cs = cycle && cycle.score;
  if (rs) {
    if (num(rs.recovery_score) != null) o.recovery = Math.round(num(rs.recovery_score));
    if (num(rs.resting_heart_rate) != null) o.rhr_bpm = Math.round(num(rs.resting_heart_rate));
    if (num(rs.hrv_rmssd_milli) != null) o.hrv_ms = r1(num(rs.hrv_rmssd_milli)); // confirm unit on first real payload
  }
  if (ss) {
    if (num(ss.sleep_performance_percentage) != null) o.sleep_perf = Math.round(num(ss.sleep_performance_percentage));
    if (num(ss.respiratory_rate) != null) o.respiratory_rate = r1(num(ss.respiratory_rate));
  }
  if (cs && num(cs.strain) != null) o.strain = r1(num(cs.strain));
  return o;
}

// Best-effort local day for a WHOOP record. Timezone attribution to be confirmed vs real payloads.
function whoopDayKey(record) {
  return String((record && (record.created_at || record.end || record.start)) || "").slice(0, 10);
}

function verifyWebhookSignature({ timestamp, rawBody, signature, secret }) {
  if (!secret) return false;
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const mac = crypto.createHmac("sha256", secret).update(Buffer.concat([Buffer.from(String(timestamp)), bodyBuf])).digest("base64");
  const a = Buffer.from(mac), b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- HTTP (exercised live; pure helpers above are unit-tested) ----
async function exchangeCode({ code, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
  return tokenRequest(body);
}
async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, scope: "offline" });
  return tokenRequest(body);
}
async function tokenRequest(body) {
  const res = await fetch(WHOOP_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`WHOOP token ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json(); // { access_token, refresh_token, expires_in, scope, ... }
}
async function getJson(path, accessToken, query = {}) {
  const u = new URL(WHOOP_API_BASE + path);
  for (const [k, v] of Object.entries(query)) if (v != null) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`WHOOP GET ${path} ${res.status}`);
  return res.json();
}
// Collection endpoints return { records: [...], next_token }. We page lightly (latest window).
const fetchRecovery = (token, startIso) => getJson("/v2/recovery", token, { start: startIso, limit: 25 });
const fetchSleep = (token, startIso) => getJson("/v2/activity/sleep", token, { start: startIso, limit: 25 });
const fetchCycle = (token, startIso) => getJson("/v2/cycle", token, { start: startIso, limit: 25 });

module.exports = {
  WHOOP_AUTH_URL, WHOOP_TOKEN_URL, WHOOP_API_BASE, SCOPES,
  buildAuthorizeUrl, mapWhoopToObjective, whoopDayKey, verifyWebhookSignature,
  exchangeCode, refreshAccessToken, getJson, fetchRecovery, fetchSleep, fetchCycle,
};
