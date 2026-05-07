const {
  getChatById,
  getChatParticipants,
  getReceiptsByChat,
} = require("./db");
const { createSyncEvent } = require("./messengerStore");
const { broadcastToChat, sendTo } = require("./ws");

const uniquePositiveIds = (ids) => {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(ids) ? ids : []) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
};

async function notifyAddedChat(db, userId, chatId, deps) {
  const [chat, participants, receipts] = await Promise.all([
    deps.getChatById(chatId),
    deps.getChatParticipants(chatId),
    deps.getReceiptsByChat(chatId),
  ]);
  if (!chat) return;

  await deps.createSyncEvent(db, {
    chatId,
    userId,
    eventType: "chat_created",
    payload: { chatId },
  });

  const participantPayload = { type: "participant_added", chatId, userId, participants };
  await deps.broadcastToChat(chatId, participantPayload, null);

  const ownParticipant = participants.find((participant) => Number(participant.user_id) === userId);
  deps.sendTo(userId, {
    type: "chat_created",
    chat: {
      ...chat,
      is_pinned: !!ownParticipant?.is_pinned,
      participants,
      receipts,
    },
  });
}

async function notifyRemovedChat(db, userId, chatId, deps) {
  await deps.createSyncEvent(db, {
    chatId,
    userId,
    eventType: "participant_removed",
    payload: { chatId, userId },
  });

  const participants = await deps.getChatParticipants(chatId);
  const payload = { type: "participant_removed", chatId, userId, participants };
  await deps.broadcastToChat(chatId, payload, null);
  deps.sendTo(userId, payload);
}

async function notifyUserChatAccessChanges(db, userId, syncResult = {}, overrides = {}) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return;
  const changes = syncResult || {};

  const deps = {
    getChatById,
    getChatParticipants,
    getReceiptsByChat,
    createSyncEvent,
    broadcastToChat,
    sendTo,
    ...overrides,
  };

  for (const chatId of uniquePositiveIds(changes.addedChatIds)) {
    await notifyAddedChat(db, safeUserId, chatId, deps);
  }

  for (const chatId of uniquePositiveIds(changes.removedChatIds)) {
    await notifyRemovedChat(db, safeUserId, chatId, deps);
  }
}

module.exports = {
  notifyUserChatAccessChanges,
};
