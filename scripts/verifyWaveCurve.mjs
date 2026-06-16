import assert from "node:assert/strict";
import { toPolylinePoints, deltaVsFirstWeek } from "../src/utils/waveCurve.js";

const series = [
  { date: "2026-06-01", value: 2, scores: { energy: 2, sleep: 2, mood: 2, focus: 2, calm: 2 } },
  { date: "2026-06-02", value: 3, scores: { energy: 3, sleep: 3, mood: 3, focus: 3, calm: 3 } },
  { date: "2026-06-03", value: 4, scores: { energy: 4, sleep: 4, mood: 4, focus: 4, calm: 4 } },
];
const pts = toPolylinePoints(series, { width: 300, height: 100, pad: 10, maxScore: 5 });
const parsed = pts.trim().split(" ").map((p) => p.split(",").map(Number));
assert.equal(parsed.length, 3);
assert.equal(parsed[0][0], 10);
assert.equal(parsed[2][0], 290);
assert.ok(parsed[2][1] < parsed[0][1], "higher value renders higher (smaller y)");

const deltas = deltaVsFirstWeek(series);
assert.ok(Array.isArray(deltas) && deltas.every((d) => typeof d.delta === "number" && !Number.isNaN(d.delta)));
assert.equal(toPolylinePoints([], { width: 300, height: 100 }), "");
assert.deepEqual(deltaVsFirstWeek([]), []);
console.log("wave curve ok");
