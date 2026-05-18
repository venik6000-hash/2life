import assert from "node:assert/strict";
import { formatReadAt } from "../src/utils/formatReadAt.js";

const now = new Date("2026-05-18T15:00:00+03:00");

assert.equal(formatReadAt("2026-05-18T07:50:00+03:00", now), "сегодня в 07:50");
assert.equal(formatReadAt("2026-05-17T22:15:00+03:00", now), "вчера в 22:15");
assert.equal(formatReadAt("2026-05-10T09:00:00+03:00", now), "10.05.2026 09:00");
assert.equal(formatReadAt(null, now), "");

console.log("formatReadAt ok");
