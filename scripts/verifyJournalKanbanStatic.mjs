import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const exists = (path) => fs.existsSync(path);

// New components exist and export defaults.
for (const path of [
  "src/components/JournalSummary.jsx",
  "src/components/JournalBoard.jsx",
  "src/components/JournalColumn.jsx",
  "src/components/JournalCard.jsx",
  "src/components/JournalCommentsPopup.jsx",
  "src/components/JournalNotesPanel.jsx",
]) {
  assert.ok(exists(path), `missing component: ${path}`);
  assert.match(read(path), /export default function/, `${path} must default-export a component`);
}

// Old components removed.
for (const path of [
  "src/components/JournalCurrentPanel.jsx",
  "src/components/JournalChecklistPanel.jsx",
  "src/components/JournalFeed.jsx",
  "src/components/JournalItemCard.jsx",
  "src/components/JournalComments.jsx",
  "src/components/AdminJournalTemplatePanel.jsx",
]) {
  assert.ok(!exists(path), `removed component should not exist: ${path}`);
}

// Section wires the new pieces.
const section = read("src/sections/Journal.jsx");
assert.match(section, /JournalSummary/);
assert.match(section, /JournalBoard/);
assert.match(section, /JournalCommentsPopup/);
assert.match(section, /JournalNotesPanel/);
assert.doesNotMatch(section, /JournalCurrentPanel/);
assert.doesNotMatch(section, /JournalChecklistPanel/);
assert.doesNotMatch(section, /JournalFeed/);
assert.doesNotMatch(section, /JournalItemCard/);
assert.doesNotMatch(section, /initializeJournalChecklist/);

// Editor accepts initialStatus.
assert.match(read("src/components/JournalItemEditor.jsx"), /initialStatus/);

// Rules helpers exist.
const rules = read("src/utils/journalRules.js");
assert.match(rules, /export const BOARD_STATUSES/);
assert.match(rules, /export const isOnBoard/);
assert.match(rules, /export const isInNotesPanel/);
assert.match(rules, /export const summarizeJournalItems/);
assert.match(rules, /export const matchesAssigneeFilter/);

// Admin panel no longer imports the checklist template.
const admin = read("src/components/AdminSectionPanel.jsx");
assert.doesNotMatch(admin, /AdminJournalTemplatePanel/);

// journalApi no longer ships checklist-template helpers.
const api = read("src/utils/journalApi.js");
assert.doesNotMatch(api, /initializeJournalChecklist/);
assert.doesNotMatch(api, /fetchJournalTemplate/);
assert.doesNotMatch(api, /createJournalTemplateItem/);
assert.doesNotMatch(api, /updateJournalTemplateItem/);
assert.doesNotMatch(api, /deleteJournalTemplateItem/);

console.log("journal kanban static ok");
