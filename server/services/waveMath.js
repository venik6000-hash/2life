// Pure, deterministic, NO AI.
const METRIC_KEYS = ["energy", "sleep", "mood", "focus", "calm"];
const round2 = (n) => Math.round(n * 100) / 100;

function computeDayMomentum(scores) {
  if (!scores || typeof scores !== "object") return null;
  const vals = [];
  for (const key of METRIC_KEYS) {
    const v = Number(scores[key]);
    if (Number.isFinite(v) && v >= 1 && v <= 5) vals.push(v);
  }
  if (!vals.length) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// series: [{date, value}] ascending. Returns flags for the LATEST day. Deterministic.
function detectInflection(series, opts = {}) {
  const { window = 3, threshold = 0.8, severeLow = 2 } = opts;
  const clean = (series || []).filter((d) => d.value != null && Number.isFinite(Number(d.value)));
  if (!clean.length) return [];
  const latest = clean[clean.length - 1];
  const flags = [];
  if (Number(latest.value) <= severeLow) {
    flags.push({ flag_date: latest.date, kind: "severe_low", metric: "", magnitude: round2(Number(latest.value)) });
  }
  if (clean.length >= window * 2) {
    const recent = mean(clean.slice(-window).map((d) => Number(d.value)));
    const prior = mean(clean.slice(-window * 2, -window).map((d) => Number(d.value)));
    const delta = round2(recent - prior);
    if (delta <= -threshold) flags.push({ flag_date: latest.date, kind: "inflection_down", metric: "", magnitude: delta });
    else if (delta >= threshold) flags.push({ flag_date: latest.date, kind: "inflection_up", metric: "", magnitude: delta });
  }
  return flags;
}

// Direction semantics: 'down_bad' (recovery/sleep/hrv: a drop is the concern); 'up_bad' (rhr: a rise is the concern).
// `threshold` is caller policy, not metric identity — callers (e.g. whoopStore.scanObjectiveInflections) supply domain-appropriate values (recovery/sleep ~6, hrv ~5, rhr ~3).
const OBJECTIVE_FLAG_METRICS = [
  { metric: "recovery", direction: "down_bad" },
  { metric: "sleep_perf", direction: "down_bad" },
  { metric: "hrv_ms", direction: "down_bad" },
  { metric: "rhr_bpm", direction: "up_bad" },
];

function detectMetricInflection(series, { metric, direction = "down_bad", window = 3, threshold = 0.8 } = {}) {
  const clean = (series || []).filter((d) => d.value != null && Number.isFinite(Number(d.value)));
  if (clean.length < window * 2) return [];
  const latest = clean[clean.length - 1];
  const recent = mean(clean.slice(-window).map((d) => Number(d.value)));
  const prior = mean(clean.slice(-window * 2, -window).map((d) => Number(d.value)));
  const delta = round2(recent - prior);
  const rose = delta >= threshold, fell = delta <= -threshold;
  let kind = null;
  if (direction === "down_bad") { if (fell) kind = "inflection_down"; else if (rose) kind = "inflection_up"; }
  else { if (rose) kind = "inflection_down"; else if (fell) kind = "inflection_up"; } // up_bad
  // magnitude is the raw delta (recent - prior): positive for a rise, negative for a fall — independent of the clinical direction mapping (e.g. up_bad concern => inflection_down with a POSITIVE magnitude).
  return kind ? [{ flag_date: latest.date, kind, metric, magnitude: delta }] : [];
}

module.exports = { METRIC_KEYS, computeDayMomentum, detectInflection, OBJECTIVE_FLAG_METRICS, detectMetricInflection };
