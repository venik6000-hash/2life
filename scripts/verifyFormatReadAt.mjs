import assert from "node:assert/strict";
import { formatReadAt } from "../src/utils/formatReadAt.js";

const localDate = (year, month, day, hours = 0, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes);

const now = localDate(2026, 5, 18, 15);

assert.equal(formatReadAt(localDate(2026, 5, 18, 7, 50), now), "сегодня в 07:50");
assert.equal(formatReadAt(localDate(2026, 5, 17, 22, 15), now), "вчера в 22:15");
assert.equal(formatReadAt(localDate(2026, 5, 10, 9), now), "10.05.2026 09:00");
assert.equal(formatReadAt(null, now), "");

console.log("formatReadAt ok");
