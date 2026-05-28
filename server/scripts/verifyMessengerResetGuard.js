const assert = require("assert");
const path = require("path");
const {
  MESSENGER_TABLES,
  assertMessengerTableAllowlist,
  assertChatUploadPath,
  getChatUploadsDir,
} = require("../services/messengerReset");

assert.strictEqual(assertMessengerTableAllowlist(MESSENGER_TABLES), true);
assert.throws(() => assertMessengerTableAllowlist(["not_messenger"]), /non-messenger/i);
assert.throws(() => assertMessengerTableAllowlist(["users"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["clients"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["analytics_files"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["journal_items"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["journal_comments"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["journal_checklist_template_items"]), /protected table/i);
assert.throws(() => assertMessengerTableAllowlist(["journal_notification_deliveries"]), /protected table/i);
assert.strictEqual(assertChatUploadPath(getChatUploadsDir()), true);
assert.strictEqual(assertChatUploadPath(path.join(getChatUploadsDir(), "abc.enc")), true);
assert.throws(() => assertChatUploadPath(path.join(__dirname, "../uploads/analytics")), /non-chat/i);

console.log("messenger reset guard ok");
