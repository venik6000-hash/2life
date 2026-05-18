import assert from "node:assert/strict";
import { formatChatListTime } from "../src/utils/chatTimeFormat.js";

const now = new Date("2026-05-18T15:00:00+03:00");

// Today → HH:MM (local)
assert.equal(formatChatListTime("2026-05-18T07:42:00+03:00", now), "07:42");
assert.equal(formatChatListTime("2026-05-18T23:00:00+03:00", now), "23:00");

// Yesterday → short weekday
assert.equal(formatChatListTime("2026-05-17T10:00:00+03:00", now), "вс");

// 2..6 days ago → short weekday
assert.equal(formatChatListTime("2026-05-13T10:00:00+03:00", now), "ср");
assert.equal(formatChatListTime("2026-05-12T10:00:00+03:00", now), "вт");

// 7 days ago → date
assert.equal(formatChatListTime("2026-05-11T10:00:00+03:00", now), "11/05/2026");

// Older → date
assert.equal(formatChatListTime("2025-12-25T10:00:00+03:00", now), "25/12/2025");

// Null/undefined → empty
assert.equal(formatChatListTime(null, now), "");
assert.equal(formatChatListTime("", now), "");

console.log("chatTimeFormat ok");
