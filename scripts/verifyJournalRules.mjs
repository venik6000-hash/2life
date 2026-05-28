import assert from "node:assert/strict";
import {
  JOURNAL_OPEN_STATUSES,
  isJournalOpenStatus,
  isJournalBadgeEligible,
  normalizeJournalDate,
  compareJournalDueAsc,
} from "../src/utils/journalRules.js";

assert.deepEqual(JOURNAL_OPEN_STATUSES, ["open", "in_progress", "waiting_client"]);
assert.equal(isJournalOpenStatus("open"), true);
assert.equal(isJournalOpenStatus("done"), false);
assert.equal(isJournalOpenStatus("cancelled"), false);

const today = "2026-05-27";
const base = {
  type: "task",
  status: "open",
  dueDate: today,
  assigneeUserId: null,
  isTeamTask: true,
};

assert.equal(isJournalBadgeEligible(base, { today, userId: 7 }), true, "team task due today counts");
assert.equal(isJournalBadgeEligible({ ...base, dueDate: "2026-05-26" }, { today, userId: 7 }), true, "overdue counts");
assert.equal(isJournalBadgeEligible({ ...base, dueDate: "2026-05-28" }, { today, userId: 7 }), false, "future does not count");
assert.equal(isJournalBadgeEligible({ ...base, status: "waiting_client" }, { today, userId: 7 }), true, "waiting client is open");
assert.equal(isJournalBadgeEligible({ ...base, status: "done" }, { today, userId: 7 }), false, "done does not count");
assert.equal(isJournalBadgeEligible({ ...base, type: "note" }, { today, userId: 7 }), false, "notes do not count");
assert.equal(isJournalBadgeEligible({ ...base, isTeamTask: false, assigneeUserId: 7 }, { today, userId: 7 }), true, "my assigned task counts");
assert.equal(isJournalBadgeEligible({ ...base, isTeamTask: false, assigneeUserId: 8 }, { today, userId: 7 }), false, "other assignee does not count");

assert.equal(normalizeJournalDate("27.05.2026"), "2026-05-27");
assert.equal(normalizeJournalDate("2026-05-27"), "2026-05-27");
assert.equal(normalizeJournalDate("bad"), "");

const sorted = [
  { dueDate: "2026-05-28", dueTime: "" },
  { dueDate: "2026-05-27", dueTime: "15:00" },
  { dueDate: "2026-05-27", dueTime: "09:00" },
].sort(compareJournalDueAsc);
assert.deepEqual(sorted.map((item) => `${item.dueDate} ${item.dueTime}`.trim()), [
  "2026-05-27 09:00",
  "2026-05-27 15:00",
  "2026-05-28",
]);

console.log("journal rules ok");
