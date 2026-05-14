const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");
const { requireAuth } = require("../middleware/auth");
const { encryptText, decryptText, encryptJson, decryptJson, encryptBuffer, decryptBuffer } = require("../services/messengerCrypto");
const { createSyncEvent, listSyncEventsForUser, upsertMessengerDevice, removeMessengerDevice } = require("../services/messengerStore");
const { pool, hasAllClientsAccess, getAssignmentsByUser,
  createChat, getChatById, getChatsByUser, updateChatMeta, setChatPinned,
  addChatParticipant, removeChatParticipant, getChatParticipants, getChatParticipantsForChats,
  isParticipant, getParticipantRole,
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser, getMessages,
  getMessagesByIds, deleteMessagesForAllBulk, hideMessagesForUserBulk,
  upsertReceipt, getReceiptsByChat, getReceiptsForChats,
  insertChatFile, getChatFile,
  listUsers,
  PIN_FOR_ALL_LIMIT, PIN_FOR_ME_LIMIT,
  countPinnedForAll, pinMessageForAll, unpinMessageForAll, listPinnedForAll,
  countPinnedForUser, pinMessageForUser, unpinMessageForUser, listPinnedForUser,
} = require("../services/db");
const {
  syncUserChatAccessByClientPermissions,
  syncChatParticipantsByClientAccess,
  userHasClientAccess,
} = require("../services/chatAccessSync");
const { sendPrivateMessagePush } = require("../services/messengerPush");
const { broadcastToChat, sendTo } = require("../services/ws");
const { ensureDir } = require("../services/storage");

const router = express.Router();
const CHAT_ACCESS_SYNC_TTL_MS = Math.max(0, Number(process.env.CHAT_ACCESS_SYNC_TTL_MS || 5000));
const userChatSyncCache = new Map(); // userId -> { syncedAt: number, inFlight: Promise|null }

const syncUserChatAccessCached = async (userId) => {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return;

  const now = Date.now();
  const cached = userChatSyncCache.get(safeUserId);

  if (cached?.inFlight) {
    await cached.inFlight;
    return;
  }

  if (cached && (now - cached.syncedAt) < CHAT_ACCESS_SYNC_TTL_MS) {
    return;
  }

  const inFlight = syncUserChatAccessByClientPermissions(pool, safeUserId)
    .then((result) => {
      userChatSyncCache.set(safeUserId, { syncedAt: Date.now(), inFlight: null });
      return result;
    })
    .catch((error) => {
      userChatSyncCache.delete(safeUserId);
      throw error;
    });

  userChatSyncCache.set(safeUserId, { syncedAt: cached?.syncedAt || 0, inFlight });
  await inFlight;
};

const hasText = (value) => String(value || "").trim() !== "";
const sanitizeChatTitle = (value) => String(value || "").trim().slice(0, 80) || "Чат";
const sanitizeChatIcon = (value) => String(value || "").trim().slice(0, 8);
const isNonEmptyString = (value, maxLength = 2048) => (
  typeof value === "string" && value.trim() !== "" && value.length <= maxLength
);
const optionalString = (body, key, maxLength) => {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return "";
  if (body[key] == null) return null;
  if (typeof body[key] !== "string" || body[key].length > maxLength) return null;
  return body[key].trim();
};

const serializeMessage = (row) => {
  let text = "";
  let meta = {};
  if (!row.deleted_for_all) {
    try { text = row.encrypted_text ? decryptText(row.encrypted_text) : ""; } catch (_) { text = ""; }
    try { meta = row.encrypted_meta ? decryptJson(row.encrypted_meta) : {}; } catch (_) { meta = {}; }
  }
  return {
    id: row.id,
    chat_id: row.chat_id,
    sender_id: row.sender_id,
    sender_username: row.sender_username,
    sender_display_name: row.sender_display_name,
    text,
    meta,
    msg_type: row.msg_type,
    file_id: row.file_id,
    client_message_id: row.client_message_id,
    deleted_for_all: !!row.deleted_for_all,
    created_at: row.created_at,
    reply_to_message_id: row.reply_to_message_id || null,
    pinned_at: row.pinned_at || null,
    edited_at: row.edited_at || null,
  };
};

const recordSyncEvent = (chatId, eventType, payload = {}, userId = null) => (
  createSyncEvent(pool, { chatId, userId, eventType, payload }).catch(() => null)
);

// ── File upload setup ─────────────────────────────────────────────────────────
const CHAT_UPLOADS_DIR = path.join(__dirname, "../uploads/chat");
ensureDir(CHAT_UPLOADS_DIR);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

const isClientRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "viewer" || normalized === "client";
};

// Returns true if the user has access to the given client
const canAccessClient = async (user, clientId) => {
  if (user.role === "admin") return true;
  const all = await hasAllClientsAccess(user.id);
  if (all) return true;
  const assignments = await getAssignmentsByUser(user.id);
  return assignments.some((a) => a.client_id === clientId);
};

const isStaffUserId = async (userId) => {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return false;
  const r = await pool.query(
    "SELECT active, role FROM users WHERE id = $1 LIMIT 1",
    [safeUserId]
  );
  const row = r.rows[0] || null;
  if (!row || row.active === false) return false;
  return !isClientRole(row.role);
};

// Ensure caller is a participant; return 403 if not
const requireParticipant = async (req, res, chatId) => {
  const ok = await isParticipant(chatId, req.user.id);
  if (!ok) { res.status(403).json({ error: "Нет доступа к чату" }); return false; }
  return true;
};

// ── Chats ─────────────────────────────────────────────────────────────────────

// GET /api/chats?clientId=xxx  — list chats the caller participates in (scoped to client if given)
router.get("/chats", requireAuth(), async (req, res) => {
  try {
    await syncUserChatAccessCached(req.user.id);

    const { clientId } = req.query;
    let chats = await getChatsByUser(req.user.id);

    if (clientId) {
      chats = chats.filter((c) => c.client_id === clientId || !c.client_id);
    }

    const chatIds = chats
      .map((c) => Number(c?.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const [participantsByChat, receiptsByChat] = await Promise.all([
      getChatParticipantsForChats(chatIds),
      getReceiptsForChats(chatIds),
    ]);

    const enriched = chats.map((chat) => {
      const chatId = Number(chat?.id);
      return {
        ...chat,
        participants: participantsByChat.get(chatId) || [],
        receipts: receiptsByChat.get(chatId) || [],
      };
    });

    res.json({ chats: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats  — create new chat
// body: { clientId?, title?, icon?, isInternal?, isPinned?, participants: [{ userId, encryptedChatKey }] }
router.post("/chats", requireAuth(), async (req, res) => {
  try {
    if (isClientRole(req.user?.role)) {
      return res.status(403).json({ error: "Клиент не может создавать чаты" });
    }

    const {
      clientId: rawClientId,
      title,
      icon,
      isInternal,
      isPinned,
      participants = [],
    } = req.body || {};

    const wantsInternal = !!isInternal || !hasText(rawClientId);
    const clientId = wantsInternal ? null : String(rawClientId).trim();
    if (!wantsInternal && !clientId) {
      return res.status(400).json({ error: "clientId обязателен для клиентского чата" });
    }

    if (!wantsInternal) {
      const access = await canAccessClient(req.user, clientId);
      if (!access) return res.status(403).json({ error: "Нет доступа к клиенту" });
    }

    const chat = await createChat({
      clientId,
      title: sanitizeChatTitle(title),
      icon: sanitizeChatIcon(icon),
      createdBy: req.user.id,
      isInternal: wantsInternal,
    });

    // Add creator as owner (with their encrypted chat key)
    const creatorKey = Array.isArray(participants)
      ? participants.find((p) => Number(p?.userId) === req.user.id)
      : null;
    await addChatParticipant(
      chat.id,
      req.user.id,
      "owner",
      creatorKey?.encryptedChatKey || "",
      !!isPinned
    );

    // Add other participants
    if (Array.isArray(participants)) {
      const handled = new Set([req.user.id]);
      for (const p of participants) {
        const targetUserId = Number(p?.userId);
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) continue;
        if (handled.has(targetUserId)) continue;
        handled.add(targetUserId);

        if (wantsInternal) {
          const isStaff = await isStaffUserId(targetUserId);
          if (!isStaff) continue;
        } else {
          const hasAccessToClient = await userHasClientAccess(pool, targetUserId, clientId);
          if (!hasAccessToClient) continue;
        }

        await addChatParticipant(chat.id, targetUserId, "member", p?.encryptedChatKey || "");
      }
    }

    if (!wantsInternal) {
      await syncChatParticipantsByClientAccess(pool, chat.id);
    }
    await recordSyncEvent(chat.id, "chat_created", { chatId: chat.id });

    const chatParticipants = await getChatParticipants(chat.id);
    const receipts = await getReceiptsByChat(chat.id);

    // Notify all participants via WS with personal pin-state.
    for (const p of chatParticipants) {
      sendTo(p.user_id, {
        type: "chat_created",
        chat: {
          ...chat,
          is_pinned: !!p.is_pinned,
          participants: chatParticipants,
          receipts,
        },
      });
    }

    const ownParticipant = chatParticipants.find((p) => p.user_id === req.user.id);
    res.json({
      chat: {
        ...chat,
        is_pinned: !!ownParticipant?.is_pinned,
        participants: chatParticipants,
        receipts,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chats/:chatId
router.get("/chats/:chatId", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Чат не найден" });

    if (!(await requireParticipant(req, res, chatId))) return;

    const participants = await getChatParticipants(chatId);
    const receipts = await getReceiptsByChat(chatId);
    const ownParticipant = participants.find((p) => p.user_id === req.user.id);
    res.json({ chat: { ...chat, is_pinned: !!ownParticipant?.is_pinned, participants, receipts } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/chats/:chatId — update chat metadata and/or pin status
// body: { title?, icon?, isPinned? }
router.patch("/chats/:chatId", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return res.status(400).json({ error: "Некорректный chatId" });
    }
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Чат не найден" });
    if (!(await requireParticipant(req, res, chatId))) return;

    const body = req.body || {};
    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
    const hasIcon = Object.prototype.hasOwnProperty.call(body, "icon");
    const hasPinned = Object.prototype.hasOwnProperty.call(body, "isPinned");

    let nextChat = chat;
    if (hasTitle || hasIcon) {
      const role = await getParticipantRole(chatId, req.user.id);
      if (role !== "owner" && req.user.role !== "admin") {
        return res.status(403).json({ error: "Только владелец чата может менять название и иконку" });
      }

      if (!chat.is_internal) {
        return res.status(400).json({ error: "Название и иконку можно менять только у внутренних чатов" });
      }

      nextChat = await updateChatMeta(chatId, {
        title: hasTitle ? sanitizeChatTitle(body.title) : null,
        icon: hasIcon ? sanitizeChatIcon(body.icon) : null,
      }) || chat;

      const payload = {
        type: "chat_updated",
        chatId,
        chat: {
          id: nextChat.id,
          title: nextChat.title,
          icon: nextChat.icon,
          is_internal: !!nextChat.is_internal,
          client_id: nextChat.client_id,
        },
      };
      await recordSyncEvent(chatId, "chat_updated", { chatId });
      await broadcastToChat(chatId, payload, null);
      sendTo(req.user.id, payload);
    }

    if (hasPinned) {
      await setChatPinned(chatId, req.user.id, !!body.isPinned);
      await recordSyncEvent(chatId, "chat_updated", { chatId, userId: req.user.id });
      sendTo(req.user.id, {
        type: "chat_updated",
        chatId,
        chat: { id: chatId, is_pinned: !!body.isPinned },
      });
    }

    const participants = await getChatParticipants(chatId);
    const receipts = await getReceiptsByChat(chatId);
    const ownParticipant = participants.find((p) => p.user_id === req.user.id);
    res.json({ chat: { ...nextChat, is_pinned: !!ownParticipant?.is_pinned, participants, receipts } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────

// GET /api/chats/:chatId/messages?before=ID&limit=50
router.get("/chats/:chatId/messages", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const beforeId = req.query.before ? Number(req.query.before) : null;
    const limit    = Math.min(Number(req.query.limit) || 50, 100);

    const msgs = await getMessages(chatId, req.user.id, beforeId, limit);
    res.json({ messages: msgs.map(serializeMessage) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats/:chatId/messages  — HTTP fallback (WS preferred)
router.post("/chats/:chatId/messages", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const {
      text = "",
      meta = {},
      msgType = "text",
      fileId = null,
      clientMessageId = "",
      deviceId = "",
      replyToMessageId = null,
      mentionedUserIds = [],
    } = req.body || {};
    if (!String(text).trim() && msgType === "text") return res.status(400).json({ error: "Сообщение пустое" });

    let replyParentId = null;
    if (replyToMessageId != null) {
      const replyId = Number(replyToMessageId);
      if (!Number.isInteger(replyId) || replyId <= 0) {
        return res.status(400).json({ error: "Некорректный replyToMessageId" });
      }
      const parent = await getMessageById(chatId, replyId);
      if (!parent) return res.status(400).json({ error: "Сообщение-оригинал не найдено в этом чате" });
      replyParentId = replyId;
    }

    const safeMentions = Array.isArray(mentionedUserIds)
      ? Array.from(new Set(mentionedUserIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
      : [];
    if (safeMentions.length > 0) {
      const participants = await getChatParticipants(chatId);
      const participantIds = new Set(participants.map((p) => Number(p.user_id)));
      for (const id of safeMentions) {
        if (!participantIds.has(id)) {
          return res.status(400).json({ error: "Упоминаемый пользователь не участник чата", userId: id });
        }
      }
    }
    const mergedMeta = { ...(meta && typeof meta === "object" ? meta : {}) };
    if (safeMentions.length > 0) mergedMeta.mentionedUserIds = safeMentions;

    const saved = await insertMessage(
      chatId,
      req.user.id,
      encryptText(text),
      encryptJson(mergedMeta),
      msgType,
      fileId || null,
      String(clientMessageId || ""),
      replyParentId,
    );
    const message = serializeMessage({
      ...saved,
      sender_username: req.user.username,
      sender_display_name: req.user.display_name || "",
    });

    const payload = {
      type: "new_message",
      message,
    };
    if (!saved.__existing) {
      await createSyncEvent(pool, { chatId, eventType: "new_message", payload: { messageId: saved.id } });
      await broadcastToChat(chatId, payload, null);
      const [participants, chat] = await Promise.all([getChatParticipants(chatId), getChatById(chatId)]);
      const targetUserIds = participants.map((p) => p.user_id).filter((id) => id !== req.user.id);
      sendPrivateMessagePush({
        userIds: targetUserIds,
        chatTitle: chat?.title || "Чат",
        url: `/app/messenger?chat=${chatId}`,
        exceptDeviceId: String(deviceId || ""),
      }).catch(() => {});
    }

    res.json({ ok: true, message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/chats/:chatId/messages/:messageId  — edit message text
router.patch("/chats/:chatId/messages/:messageId", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const { text = "", meta = {} } = req.body || {};
    if (!String(text).trim()) return res.status(400).json({ error: "Сообщение пустое" });

    const existing = await getMessageById(chatId, messageId);
    if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });
    if (existing.deleted_for_all) return res.status(400).json({ error: "Сообщение уже удалено" });
    if (existing.msg_type !== "text") return res.status(400).json({ error: "Редактирование доступно только для текстовых сообщений" });
    if (existing.sender_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Можно редактировать только свои сообщения" });
    }

    const updated = await updateMessageContent(chatId, messageId, encryptText(text), encryptJson(meta));
    if (!updated) return res.status(404).json({ error: "Сообщение не найдено" });
    await createSyncEvent(pool, { chatId, eventType: "message_edited", payload: { messageId } });
    const message = serializeMessage({
      ...updated,
      sender_username: existing.sender_username,
      sender_display_name: existing.sender_display_name || "",
    });

    const payload = {
      type: "message_edited",
      chatId,
      message,
    };
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    res.json({ message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chats/:chatId/messages/:messageId?scope=self|all
router.delete("/chats/:chatId/messages/:messageId", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const scope = String(req.query.scope || req.body?.scope || "all");
    const existing = await getMessageById(chatId, messageId);
    if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });

    if (scope === "self") {
      await hideMessageForUser(messageId, req.user.id);
      sendTo(req.user.id, { type: "message_deleted_self", chatId, messageId, userId: req.user.id });
      return res.json({ ok: true, scope: "self" });
    }

    if (scope === "all") {
      if (existing.sender_id !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ error: "Можно удалять у всех только свои сообщения" });
      }
      const deleted = await deleteMessageForAll(chatId, messageId, req.user.id);
      if (!deleted) return res.status(404).json({ error: "Сообщение не найдено" });
      await createSyncEvent(pool, { chatId, eventType: "message_deleted_all", payload: { messageId, userId: req.user.id } });

      const payload = { type: "message_deleted_all", chatId, messageId, userId: req.user.id };
      await broadcastToChat(chatId, payload, null);
      sendTo(req.user.id, payload);
      return res.json({ ok: true, scope: "all" });
    }

    return res.status(400).json({ error: "Недопустимый scope. Используйте self или all" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats/:chatId/messages/:messageId/pin — pin for all in chat
router.post("/chats/:chatId/messages/:messageId/pin", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const existing = await getMessageById(chatId, messageId);
    if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });
    if (existing.deleted_for_all) return res.status(400).json({ error: "Сообщение удалено" });
    if (existing.pinned_at) return res.json({ ok: true, alreadyPinned: true });

    const count = await countPinnedForAll(chatId);
    if (count >= PIN_FOR_ALL_LIMIT) {
      return res.status(409).json({ error: "PIN_LIMIT_REACHED", limit: PIN_FOR_ALL_LIMIT });
    }

    const pinned = await pinMessageForAll(chatId, messageId);
    if (!pinned) return res.status(404).json({ error: "Не удалось закрепить" });

    const payload = { type: "message_pinned", chatId, messageId, pinnedAt: pinned.pinned_at };
    await createSyncEvent(pool, { chatId, eventType: "message_pinned", payload: { messageId } });
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    res.json({ ok: true, messageId, pinnedAt: pinned.pinned_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chats/:chatId/messages/:messageId/pin — unpin for all
router.delete("/chats/:chatId/messages/:messageId/pin", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const ok = await unpinMessageForAll(chatId, messageId);
    if (!ok) return res.json({ ok: true, wasPinned: false });

    const payload = { type: "message_unpinned", chatId, messageId };
    await createSyncEvent(pool, { chatId, eventType: "message_unpinned", payload: { messageId } });
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    res.json({ ok: true, wasPinned: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats/:chatId/messages/:messageId/pin-for-me — personal pin
router.post("/chats/:chatId/messages/:messageId/pin-for-me", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const existing = await getMessageById(chatId, messageId);
    if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });
    if (existing.deleted_for_all) return res.status(400).json({ error: "Сообщение удалено" });

    const count = await countPinnedForUser(chatId, req.user.id);
    if (count >= PIN_FOR_ME_LIMIT) {
      return res.status(409).json({ error: "PERSONAL_PIN_LIMIT_REACHED", limit: PIN_FOR_ME_LIMIT });
    }

    const pinned = await pinMessageForUser(req.user.id, messageId);
    await createSyncEvent(pool, {
      chatId, userId: req.user.id,
      eventType: "personal_pin_added",
      payload: { messageId, userId: req.user.id }
    });
    sendTo(req.user.id, { type: "personal_pin_added", chatId, messageId });
    res.json({ ok: true, messageId, pinnedAt: pinned?.pinned_at ?? null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chats/:chatId/messages/:messageId/pin-for-me
router.delete("/chats/:chatId/messages/:messageId/pin-for-me", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const ok = await unpinMessageForUser(req.user.id, messageId);
    await createSyncEvent(pool, {
      chatId, userId: req.user.id,
      eventType: "personal_pin_removed",
      payload: { messageId, userId: req.user.id }
    });
    sendTo(req.user.id, { type: "personal_pin_removed", chatId, messageId });
    res.json({ ok: true, wasPinned: ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats/:chatId/messages/bulk-delete
// body: { ids: number[], scope: "self" | "all" }
router.post("/chats/:chatId/messages/bulk-delete", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    const scope = String(req.body?.scope || "all");
    if (ids.length === 0) return res.status(400).json({ error: "Передайте ids" });
    if (ids.length > 100) return res.status(400).json({ error: "Слишком много сообщений (max 100)" });

    if (scope === "self") {
      const hidden = await hideMessagesForUserBulk(req.user.id, ids);
      sendTo(req.user.id, { type: "messages_deleted_self_bulk", chatId, messageIds: ids });
      return res.json({ ok: true, scope: "self", hidden });
    }

    if (scope === "all") {
      const rows = await getMessagesByIds(chatId, ids);
      if (rows.length !== ids.length) {
        return res.status(404).json({ error: "Некоторые сообщения не найдены", missingIds: ids.filter((id) => !rows.find((r) => r.id === id)) });
      }
      const denied = rows.filter((r) => r.sender_id !== req.user.id && req.user.role !== "admin").map((r) => r.id);
      if (denied.length > 0 && req.user.role !== "admin") {
        return res.status(403).json({ error: "BULK_DELETE_FORBIDDEN", deniedIds: denied });
      }
      const deletedIds = await deleteMessagesForAllBulk(chatId, ids, req.user.id);
      for (const id of deletedIds) {
        const payload = { type: "message_deleted_all", chatId, messageId: id, userId: req.user.id };
        await createSyncEvent(pool, { chatId, eventType: "message_deleted_all", payload: { messageId: id, userId: req.user.id } });
        await broadcastToChat(chatId, payload, null);
        sendTo(req.user.id, payload);
      }
      return res.json({ ok: true, scope: "all", deletedIds });
    }

    return res.status(400).json({ error: "Недопустимый scope" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chats/:chatId/pinned — top-5 for-all pins (newest first)
router.get("/chats/:chatId/pinned", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;
    const rows = await listPinnedForAll(chatId, PIN_FOR_ALL_LIMIT);
    res.json({ messages: rows.map(serializeMessage) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chats/:chatId/pinned-for-me — personal pins for this user
router.get("/chats/:chatId/pinned-for-me", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;
    const rows = await listPinnedForUser(chatId, req.user.id, PIN_FOR_ME_LIMIT);
    res.json({ messages: rows.map(serializeMessage) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats/:chatId/read  — mark messages read
router.post("/chats/:chatId/read", requireAuth(), async (req, res) => {
  try {
    const chatId   = Number(req.params.chatId);
    const { messageId } = req.body;
    if (!(await requireParticipant(req, res, chatId))) return;

    await upsertReceipt(chatId, req.user.id, messageId);
    const receipts = await getReceiptsByChat(chatId);
    const payload  = { type: "receipts_update", chatId, receipts };
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/messenger/sync", requireAuth(), async (req, res) => {
  try {
    const after = Number(req.query.after || 0);
    if (!Number.isFinite(after) || after < 0) return res.status(400).json({ error: "Некорректный cursor" });
    const events = await listSyncEventsForUser(req.user.id, after);
    res.json({ ok: true, events, cursor: events.at(-1)?.id || after });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/messenger/devices", requireAuth(), async (req, res) => {
  try {
    const body = req.body || {};
    const { deviceId } = body;
    const endpoint = optionalString(body, "endpoint", 4096);
    const p256dh = optionalString(body, "p256dh", 512);
    const auth = optionalString(body, "auth", 512);
    if (!isNonEmptyString(deviceId, 160)) return res.status(400).json({ error: "deviceId обязателен" });
    if (endpoint == null || p256dh == null || auth == null) return res.status(400).json({ error: "Некорректная push-подписка" });
    if ((endpoint || p256dh || auth) && (!isNonEmptyString(endpoint, 4096) || !isNonEmptyString(p256dh, 512) || !isNonEmptyString(auth, 512))) {
      return res.status(400).json({ error: "Некорректная push-подписка" });
    }
    const device = await upsertMessengerDevice(req.user.id, {
      deviceId: deviceId.trim(),
      endpoint: endpoint.trim(),
      p256dh: p256dh.trim(),
      auth: auth.trim(),
      userAgent: req.headers["user-agent"] || "",
    });
    console.log("[messenger] push device registered", {
      userId: req.user.id,
      username: req.user.username,
      deviceId: device.device_id,
      endpointPrefix: device.endpoint.slice(0, 48),
    });
    res.json({ ok: true, deviceId: device.device_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/messenger/devices/:deviceId", requireAuth(), async (req, res) => {
  try {
    if (!isNonEmptyString(req.params.deviceId, 160)) return res.status(400).json({ error: "Некорректный deviceId" });
    await removeMessengerDevice(req.user.id, req.params.deviceId.trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Participants ──────────────────────────────────────────────────────────────

// POST /api/chats/:chatId/participants  — add participant (owner only)
router.post("/chats/:chatId/participants", requireAuth(), async (req, res) => {
  try {
    if (isClientRole(req.user?.role)) {
      return res.status(403).json({ error: "Клиент не может добавлять участников" });
    }

    const chatId = Number(req.params.chatId);
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Чат не найден" });

    const role = await getParticipantRole(chatId, req.user.id);
    if (role !== "owner" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Только владелец чата может добавлять участников" });
    }

    const userId = Number(req.body?.userId);
    const { encryptedChatKey = "" } = req.body || {};
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "userId обязателен" });

    if (chat.client_id) {
      const hasAccessToClient = await userHasClientAccess(pool, userId, chat.client_id);
      if (!hasAccessToClient) {
        return res.status(403).json({ error: "Пользователь не имеет доступа к клиенту этого чата" });
      }
    } else {
      const isStaff = await isStaffUserId(userId);
      if (!isStaff) {
        return res.status(403).json({ error: "Во внутренний чат можно добавлять только сотрудников" });
      }
    }

    await addChatParticipant(chatId, userId, "member", encryptedChatKey);
    const participants = await getChatParticipants(chatId);
    const receipts = await getReceiptsByChat(chatId);
    await recordSyncEvent(chatId, "participant_added", { chatId, userId });

    // Notify all current participants (refresh participant list)
    const payload = { type: "participant_added", chatId, userId, participants };
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    // Ensure the newly added user receives the full chat payload right away.
    // Without this, their UI may not have this chat in local state yet.
    const newParticipant = participants.find((p) => p.user_id === userId);
    sendTo(userId, {
      type: "chat_created",
      chat: { ...chat, is_pinned: !!newParticipant?.is_pinned, participants, receipts },
    });

    res.json({ participants });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chats/:chatId/participants/:userId  — remove participant (owner only)
router.delete("/chats/:chatId/participants/:userId", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "Некорректный userId" });
    }
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Чат не найден" });

    if (isClientRole(req.user?.role) && req.user.id !== targetUserId) {
      return res.status(403).json({ error: "Клиент не может управлять участниками чата" });
    }

    const role = await getParticipantRole(chatId, req.user.id);
    if (role !== "owner" && req.user.role !== "admin" && req.user.id !== targetUserId) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }

    if (chat.client_id) {
      const targetHasClientAccess = await userHasClientAccess(pool, targetUserId, chat.client_id);
      if (targetHasClientAccess) {
        return res.status(400).json({ error: "Нельзя удалить участника вручную, пока у него есть доступ к этому клиенту" });
      }
    }

    await removeChatParticipant(chatId, targetUserId);
    const participants = await getChatParticipants(chatId);
    await recordSyncEvent(chatId, "participant_removed", { chatId, userId: targetUserId });
    await recordSyncEvent(null, "participant_removed", { chatId, userId: targetUserId }, targetUserId);

    const payload = { type: "participant_removed", chatId, userId: targetUserId, participants };
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);
    // Removed user is no longer a participant, so broadcast won't reach them.
    // Send explicit notification so their UI can remove the chat immediately.
    sendTo(targetUserId, payload);

    res.json({ participants });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── File upload / download ────────────────────────────────────────────────────

// POST /api/chats/:chatId/files  — upload encrypted file blob
router.post("/chats/:chatId/files", requireAuth(), upload.single("file"), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) {
      return;
    }
    if (!req.file) return res.status(400).json({ error: "Файл не передан" });

    const fileId = uuidv4();
    const storagePath = path.join(CHAT_UPLOADS_DIR, `${fileId}.enc`);
    const encryptedPayload = encryptBuffer(req.file.buffer);
    fs.writeFileSync(storagePath, encryptedPayload);
    const row = await insertChatFile(
      fileId, chatId, req.user.id,
      req.body.originalName || req.file.originalname || "file",
      req.body.mimeType || req.file.mimetype || "application/octet-stream",
      req.file.size,
      storagePath
    );

    res.json({ file: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chats/:chatId/files/:fileId  — download encrypted file blob
router.get("/chats/:chatId/files/:fileId", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const file = await getChatFile(req.params.fileId);
    if (!file || file.chat_id !== chatId) return res.status(404).json({ error: "Файл не найден" });
    if (!fs.existsSync(file.storage_path)) return res.status(404).json({ error: "Файл не найден на диске" });

    const encodedOriginalName = encodeURIComponent(file.original_name || "file");
    let plain;
    try {
      const encryptedPayload = fs.readFileSync(file.storage_path, "utf8");
      plain = decryptBuffer(encryptedPayload);
    } catch (_) {
      return res.status(422).json({ error: "Файл повреждён" });
    }

    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodedOriginalName}"`);
    res.setHeader("X-Original-Mime", file.mime_type);
    // Keep this header ASCII-only to avoid Node.js header validation errors.
    res.setHeader("X-Original-Name", encodedOriginalName);

    res.send(plain);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users — список пользователей (для сотрудников/админа, только базовые поля)
router.get("/users", requireAuth(), async (req, res) => {
  try {
    if (isClientRole(req.user?.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }

    const users = await listUsers();
    const activeUsers = users
      .filter((u) => u.active !== false)
      .map((u) => ({ id: u.id, username: u.username, role: u.role }))
      .sort((a, b) => a.username.localeCompare(b.username, "ru"));
    res.json({ users: activeUsers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
