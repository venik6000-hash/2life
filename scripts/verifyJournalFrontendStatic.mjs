import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

assert.match(read("src/utils/journalApi.js"), /fetchJournal/);
assert.match(read("src/utils/journalApi.js"), /fetchJournalBadges/);
assert.match(read("src/context/DashboardContext.jsx"), /journalBadges/);
assert.match(read("src/components/SidebarClientPicker.jsx"), /JournalBadge/);
assert.match(read("src/components/JournalBadge.jsx"), /background:\s*"#dc2626"/);

console.log("journal frontend static ok");
