const assert = require("node:assert/strict");
const { METRIC_KEYS, computeDayMomentum, detectInflection } = require("../services/waveMath");

assert.deepEqual(METRIC_KEYS, ["energy", "sleep", "mood", "focus", "calm"]);

assert.equal(computeDayMomentum({ energy: 4, sleep: 3, mood: 5, focus: 4, calm: 4 }), 4);
assert.equal(computeDayMomentum({ energy: 2, sleep: 3 }), 2.5);
assert.equal(computeDayMomentum({ energy: 5, junk: 99 }), 5);
assert.equal(computeDayMomentum({}), null);

const rising = [
  { date: "2026-06-01", value: 2.0 }, { date: "2026-06-02", value: 2.2 },
  { date: "2026-06-03", value: 2.1 }, { date: "2026-06-04", value: 3.0 },
  { date: "2026-06-05", value: 3.4 }, { date: "2026-06-06", value: 3.6 },
];
const up = detectInflection(rising);
assert.ok(up.some((f) => f.kind === "inflection_up"), "expected inflection_up");
assert.ok(up.every((f) => f.flag_date === "2026-06-06"), "flags pinned to latest day");

const falling = rising.map((d, i) => ({ date: d.date, value: 4.5 - i * 0.5 }));
assert.ok(detectInflection(falling).some((f) => f.kind === "inflection_down"));

const low = [{ date: "2026-06-05", value: 3 }, { date: "2026-06-06", value: 1.8 }];
assert.ok(detectInflection(low).some((f) => f.kind === "severe_low"));

assert.deepEqual(detectInflection([{ date: "2026-06-06", value: 4 }]), []);

const { detectMetricInflection, OBJECTIVE_FLAG_METRICS } = require("../services/waveMath");
assert.deepEqual(OBJECTIVE_FLAG_METRICS.map((m) => m.metric).sort(), ["hrv_ms", "recovery", "rhr_bpm", "sleep_perf"]);

// recovery falling -> concern (inflection_down, metric tagged)
const recFall = [60, 58, 61, 50, 44, 40].map((v, i) => ({ date: `2026-06-0${i + 1}`, value: v }));
const rf = detectMetricInflection(recFall, { metric: "recovery", direction: "down_bad", threshold: 6 });
assert.ok(rf.some((f) => f.kind === "inflection_down" && f.metric === "recovery"));

// resting HR rising -> concern (up is bad -> inflection_down semantics)
const rhrRise = [50, 51, 50, 55, 58, 60].map((v, i) => ({ date: `2026-06-0${i + 1}`, value: v }));
const hr = detectMetricInflection(rhrRise, { metric: "rhr_bpm", direction: "up_bad", threshold: 4 });
assert.ok(hr.some((f) => f.kind === "inflection_down" && f.metric === "rhr_bpm"), "rhr rise = concern");

// recovery rising -> positive
const recRise = recFall.map((d) => ({ date: d.date, value: 100 - d.value }));
assert.ok(detectMetricInflection(recRise, { metric: "recovery", direction: "down_bad", threshold: 6 }).some((f) => f.kind === "inflection_up"));

// --- regression hardening for the existing detectInflection (folded in per a prior review of the clinical-flag math) ---
// delta exactly == threshold must fire (inclusive >=)
const atThreshold = [
  { date: "d1", value: 2 }, { date: "d2", value: 2 }, { date: "d3", value: 2 },
  { date: "d4", value: 2.8 }, { date: "d5", value: 2.8 }, { date: "d6", value: 2.8 },
];
assert.ok(detectInflection(atThreshold).some((f) => f.kind === "inflection_up"), "delta === threshold fires (inclusive)");
// a crash both flags severe_low AND inflection_down for the same latest day
const crash = [
  { date: "d1", value: 4 }, { date: "d2", value: 4 }, { date: "d3", value: 4 },
  { date: "d4", value: 2 }, { date: "d5", value: 1.8 }, { date: "d6", value: 1.5 },
];
const cf = detectInflection(crash);
assert.ok(cf.some((f) => f.kind === "severe_low") && cf.some((f) => f.kind === "inflection_down"), "severe_low + inflection_down co-occur");
assert.ok(cf.every((f) => f.flag_date === "d6"), "co-occurring flags pinned to latest day");

console.log("wave inflection ok");
