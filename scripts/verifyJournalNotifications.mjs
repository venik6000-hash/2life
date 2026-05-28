import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("server/services/journalNotifications.js", "utf8");
const index = fs.readFileSync("server/index.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

assert.match(service, /runJournalDigest/);
assert.match(service, /runJournalExactReminders/);
assert.match(service, /wasJournalNotificationDelivered/);
assert.match(service, /recordJournalNotificationDelivery/);
assert.match(index, /startJournalNotificationScheduler/);
assert.match(sw, /payload\.url/);
assert.match(sw, /journal/);

console.log("journal notifications static ok");
