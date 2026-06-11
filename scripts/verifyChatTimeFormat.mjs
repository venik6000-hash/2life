import assert from "node:assert/strict";
import { formatChatListTime } from "../src/utils/chatTimeFormat.js";

const localDate = (year, month, day, hours = 0, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes);

const now = localDate(2026, 5, 18, 15);

// Today → HH:MM (local)
assert.equal(formatChatListTime(localDate(2026, 5, 18, 7, 42), now), "07:42");
assert.equal(formatChatListTime(localDate(2026, 5, 18, 23), now), "23:00");

// Yesterday → short weekday
assert.equal(formatChatListTime(localDate(2026, 5, 17, 10), now), "вс");

// 2..6 days ago → short weekday
assert.equal(formatChatListTime(localDate(2026, 5, 13, 10), now), "ср");
assert.equal(formatChatListTime(localDate(2026, 5, 12, 10), now), "вт");

// 7 days ago → date
assert.equal(formatChatListTime(localDate(2026, 5, 11, 10), now), "11/05/2026");

// Older → date
assert.equal(formatChatListTime(localDate(2025, 12, 25, 10), now), "25/12/2025");

// Null/undefined → empty
assert.equal(formatChatListTime(null, now), "");
assert.equal(formatChatListTime("", now), "");

console.log("chatTimeFormat ok");
