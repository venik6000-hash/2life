import assert from "node:assert/strict";
import {
  JOURNAL_OPEN_STATUSES,
  isJournalOpenStatus,
  isJournalBadgeEligible,
  isJournalActual,
  normalizeJournalDate,
  compareJournalDueAsc,
  BOARD_STATUSES,
  isOnBoard,
  isInNotesPanel,
  summarizeJournalItems,
  matchesAssigneeFilter,
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

assert.equal(isJournalActual(base, { today }), true, "actual: team task due today");
assert.equal(isJournalActual({ ...base, isTeamTask: false, assigneeUserId: null }, { today }), true, "actual: unassigned non-team task still counts");
assert.equal(isJournalActual({ ...base, dueDate: "2026-05-26" }, { today }), true, "actual: overdue counts");
assert.equal(isJournalActual({ ...base, dueDate: "2026-06-02" }, { today }), true, "actual: within 7-day horizon counts");
assert.equal(isJournalActual({ ...base, dueDate: "2026-06-05" }, { today }), false, "actual: past 7-day horizon does not count");
assert.equal(isJournalActual({ ...base, status: "done" }, { today }), false, "actual: done does not count");
assert.equal(isJournalActual({ ...base, type: "note" }, { today }), false, "actual: notes do not count");
assert.equal(isJournalActual({ ...base, dueDate: "" }, { today }), false, "actual: items without dueDate do not count");

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

assert.deepEqual(BOARD_STATUSES, ["open", "in_progress", "waiting_client", "done"]);

assert.equal(isOnBoard({ type: "task" }), true, "tasks live on the board");
assert.equal(isOnBoard({ type: "event" }), true, "events live on the board");
assert.equal(isOnBoard({ type: "note" }), false, "notes do not live on the board");
assert.equal(isOnBoard({ type: "task", deletedAt: "2026-01-01" }), false, "deleted items are off-board");

assert.equal(isInNotesPanel({ type: "note" }), true);
assert.equal(isInNotesPanel({ type: "task" }), false);
assert.equal(isInNotesPanel({ type: "note", deletedAt: "2026-01-01" }), false);

const summarized = summarizeJournalItems(
  [
    { type: "task", status: "open", dueDate: "2026-05-28" }, // today
    { type: "task", status: "in_progress", dueDate: "2026-05-27" }, // overdue
    { type: "event", status: "waiting_client", dueDate: "2026-05-30" }, // future open
    { type: "task", status: "done", dueDate: "2026-05-28" }, // closed, ignored
    { type: "note", status: "done", dueDate: "" }, // notes ignored
  ],
  { today: "2026-05-28" }
);
assert.deepEqual(summarized, { open: 3, today: 1, overdue: 1 });

assert.equal(matchesAssigneeFilter({ assigneeUserId: 7, isTeamTask: false }, "mine", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 8, isTeamTask: false }, "mine", 7), false);
assert.equal(matchesAssigneeFilter({ assigneeUserId: null, isTeamTask: true }, "team", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 7, isTeamTask: false }, "team", 7), false);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 7, isTeamTask: false }, "mine_and_team", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: null, isTeamTask: true }, "mine_and_team", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 8, isTeamTask: false }, "mine_and_team", 7), false);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 8, isTeamTask: false }, "all", 7), true);

console.log("journal rules ok");
