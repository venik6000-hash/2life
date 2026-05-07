import assert from "node:assert/strict";
import { getUnreadCount } from "../src/utils/messengerUnread.js";

const user = { id: 2 };
const chat = {
  id: 10,
  receipts: [
    { user_id: 2, last_read_message_id: 5 },
    { user_id: 1, last_read_message_id: 8 },
  ],
};
const messages = {
  10: [
    { id: 4, sender_id: 1, text: "old" },
    { id: 6, sender_id: 1, text: "new from admin" },
    { id: 7, sender_id: 2, text: "own message" },
    { id: "local-pending", sender_id: 1, text: "pending without server id" },
    { id: 8, sender_id: 1, deleted_for_all: true },
  ],
};

assert.equal(getUnreadCount(chat, messages, user), 1);
assert.equal(getUnreadCount({ ...chat, receipts: [] }, messages, user), 2);
assert.equal(getUnreadCount(chat, {}, user), 0);

console.log("messenger unread ok");
