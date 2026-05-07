const assert = require("assert");

const { notifyUserChatAccessChanges } = require("../services/messengerAccessNotifications");

(async () => {
  const sent = [];
  const broadcasted = [];
  const events = [];
  const chats = new Map([
    [10, { id: 10, title: "Client A", client_id: "client-a" }],
    [20, { id: 20, title: "Client B", client_id: "client-b" }],
  ]);
  const participants = new Map([
    [10, [
      { user_id: 1, username: "admin", is_pinned: false },
      { user_id: 2, username: "demo", is_pinned: true },
    ]],
    [20, [
      { user_id: 1, username: "admin", is_pinned: false },
    ]],
  ]);

  await notifyUserChatAccessChanges(null, 2, {
    addedChatIds: [10],
    removedChatIds: [20],
    updatedChatIds: [],
  }, {
    getChatById: async (chatId) => chats.get(chatId),
    getChatParticipants: async (chatId) => participants.get(chatId) || [],
    getReceiptsByChat: async () => [],
    createSyncEvent: async (_db, event) => events.push(event),
    sendTo: (userId, payload) => sent.push({ userId, payload }),
    broadcastToChat: async (chatId, payload, exceptUserId) => {
      broadcasted.push({ chatId, payload, exceptUserId });
    },
  });

  assert.deepStrictEqual(events.map((event) => event.eventType), ["chat_created", "participant_removed"]);
  assert.deepStrictEqual(events.map((event) => event.userId), [2, 2]);
  assert.ok(sent.some((item) => item.userId === 2 && item.payload.type === "chat_created" && item.payload.chat.id === 10));
  assert.ok(sent.some((item) => item.userId === 2 && item.payload.type === "participant_removed" && item.payload.chatId === 20));
  assert.ok(broadcasted.some((item) => item.chatId === 10 && item.payload.type === "participant_added"));
  assert.ok(broadcasted.some((item) => item.chatId === 20 && item.payload.type === "participant_removed"));

  await notifyUserChatAccessChanges(null, 2, null, {
    sendTo: () => assert.fail("null sync result should not send events"),
  });

  console.log("messenger access notifications ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
