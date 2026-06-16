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

console.log("wave inflection ok");
