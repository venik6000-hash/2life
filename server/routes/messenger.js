const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");
const { requireAuth } = require("../middleware/auth");
const { encryptPrivateKeyForRecovery, publicJwkFromRecovery } = require("../services/messengerRecovery");
const { pool, hasAllClientsAccess, getAssignmentsByUser,
  createChat, getChatById, getChatsByUser,
  addChatParticipant, removeChatParticipant, getChatParticipants,
  isParticipant, getParticipantRole,
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser, getMessages,
  upsertReceipt, getReceiptsByChat,
  insertChatFile, getChatFile,
  upsertPublicKey, getPublicKey,
  listUsers,
} = require("../services/db");
const {
  syncUserChatAccessByClientPermissions,
  syncChatParticipantsByClientAccess,
  userHasClientAccess,
} = require("../services/chatAccessSync");
const { broadcastToChat, sendTo } = require("../services/ws");
const { ensureDir } = require("../services/storage");

const router = express.Router();
const hasText = (value) => String(value || "").trim() !== "";
const hasCompleteOwnKeyBundle = (row) => (
  !!row &&
  hasText(row.public_key_jwk) &&
  hasText(row.encrypted_private_key_jwk) &&
  hasText(row.key_derivation_salt) &&
  hasText(row.key_derivation_iv)
);
const hasOwnEncryptedBundle = (row) => (
  !!row &&
  hasText(row.encrypted_private_key_jwk) &&
  hasText(row.key_derivation_salt) &&
  hasText(row.key_derivation_iv)
);
const hasRecoveryBundle = (row) => (
  !!row &&
  hasText(row.recovery_encrypted_private_key_jwk) &&
  hasText(row.recovery_key_iv)
);

// ── File upload setup ─────────────────────────────────────────────────────────
const CHAT_UPLOADS_DIR = path.join(__dirname, "../uploads/chat");
ensureDir(CHAT_UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CHAT_UPLOADS_DIR),
  filename: (_req, _file, cb) => cb(null, `${uuidv4()}.enc`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

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

// Ensure caller is a participant; return 403 if not
const requireParticipant = async (req, res, chatId) => {
  const ok = await isParticipant(chatId, req.user.id);
  if (!ok) { res.status(403).json({ error: "Нет доступа к чату" }); return false; }
  return true;
};

// ── Crypto: public keys ───────────────────────────────────────────────────────

// GET /api/crypto/keys  — own full key bundle (public + encrypted private)
router.get("/crypto/keys", requireAuth(), async (req, res) => {
  try {
    const row = await getPublicKey(req.user.id);
    if (!row || !hasOwnEncryptedBundle(row)) return res.json({ keys: null, recoveryReady: false });

    if (!hasText(row.public_key_jwk) && hasRecoveryBundle(row)) {
      try {
        const recoveredPublicJwk = publicJwkFromRecovery(
          row.recovery_encrypted_private_key_jwk,
          row.recovery_key_iv
        );
        await upsertPublicKey(
          req.user.id,
          recoveredPublicJwk,
          row.encrypted_private_key_jwk,
          row.key_derivation_salt,
          row.key_derivation_iv
        );
        row.public_key_jwk = recoveredPublicJwk;
      } catch (_) {}
    }

    res.json({
      keys: {
        public_key_jwk: row.public_key_jwk,
        encrypted_private_key_jwk: row.encrypted_private_key_jwk,
        key_derivation_salt: row.key_derivation_salt,
        key_derivation_iv: row.key_derivation_iv,
      },
      recoveryReady: hasRecoveryBundle(row),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/crypto/keys/:userId  — another user's PUBLIC key only (no private data)
router.get("/crypto/keys/:userId", requireAuth(), async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    const row = await getPublicKey(targetUserId);
    if (!row) return res.status(404).json({ error: "Ключ не найден" });

    let publicKeyJwk = row.public_key_jwk;
    if (!hasText(publicKeyJwk) && hasRecoveryBundle(row)) {
      try {
        publicKeyJwk = publicJwkFromRecovery(
          row.recovery_encrypted_private_key_jwk,
          row.recovery_key_iv
        );
        await upsertPublicKey(
          targetUserId,
          publicKeyJwk,
          row.encrypted_private_key_jwk || "",
          row.key_derivation_salt || "",
          row.key_derivation_iv || ""
        );
      } catch (_) {
        publicKeyJwk = "";
      }
    }

    if (!hasText(publicKeyJwk)) return res.status(404).json({ error: "Ключ не найден" });
    res.json({ publicKeyJwk });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/crypto/keys  — store / update own key pair
router.post("/crypto/keys", requireAuth(), async (req, res) => {
  try {
    const { publicKeyJwk, encryptedPrivateKeyJwk, keyDerivationSalt, keyDerivationIv, privateKeyJwk } = req.body;
    if (!publicKeyJwk) return res.status(400).json({ error: "publicKeyJwk обязателен" });

    let recoveryEncryptedPrivateKeyJwk = "";
    let recoveryKeyIv = "";
    if (privateKeyJwk) {
      const privateKeyJwkStr = typeof privateKeyJwk === "string" ? privateKeyJwk : JSON.stringify(privateKeyJwk);
      const recovery = encryptPrivateKeyForRecovery(privateKeyJwkStr);
      recoveryEncryptedPrivateKeyJwk = recovery.recoveryEncryptedPrivateKeyJwk;
      recoveryKeyIv = recovery.recoveryKeyIv;
    }

    await upsertPublicKey(
      req.user.id,
      typeof publicKeyJwk === "string" ? publicKeyJwk : JSON.stringify(publicKeyJwk),
      encryptedPrivateKeyJwk || "",
      keyDerivationSalt || "",
      keyDerivationIv || "",
      recoveryEncryptedPrivateKeyJwk,
      recoveryKeyIv
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chats ─────────────────────────────────────────────────────────────────────

// GET /api/chats?clientId=xxx  — list chats the caller participates in (scoped to client if given)
router.get("/chats", requireAuth(), async (req, res) => {
  try {
    await syncUserChatAccessByClientPermissions(pool, req.user.id);

    const { clientId } = req.query;
    let chats = await getChatsByUser(req.user.id);

    if (clientId) {
      chats = chats.filter((c) => c.client_id === clientId);
    }

    // Enrich with participant list
    const enriched = await Promise.all(chats.map(async (c) => {
      const participants = await getChatParticipants(c.id);
      const receipts     = await getReceiptsByChat(c.id);
      return { ...c, participants, receipts };
    }));

    res.json({ chats: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats  — create new chat
// body: { clientId, title, participants: [{ userId, encryptedChatKey }] }
router.post("/chats", requireAuth(), async (req, res) => {
  try {
    if (isClientRole(req.user?.role)) {
      return res.status(403).json({ error: "Клиент не может создавать чаты" });
    }

    const { clientId, title, participants = [] } = req.body;
    if (!clientId) return res.status(400).json({ error: "clientId обязателен" });

    const access = await canAccessClient(req.user, clientId);
    if (!access) return res.status(403).json({ error: "Нет доступа к клиенту" });

    const chat = await createChat(clientId, title || "Чат", req.user.id);

    // Add creator as owner (with their encrypted chat key)
    const creatorKey = participants.find((p) => p.userId === req.user.id);
    await addChatParticipant(chat.id, req.user.id, "owner", creatorKey?.encryptedChatKey || "");

    // Add other participants
    for (const p of participants) {
      if (p.userId === req.user.id) continue;
      await addChatParticipant(chat.id, p.userId, "member", p.encryptedChatKey || "");
    }

    await syncChatParticipantsByClientAccess(pool, chat.id);
    const chatParticipants = await getChatParticipants(chat.id);

    // Notify all new participants via WS
    for (const p of chatParticipants) {
      sendTo(p.user_id, { type: "chat_created", chat: { ...chat, participants: chatParticipants } });
    }

    res.json({ chat: { ...chat, participants: chatParticipants } });
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
    const receipts     = await getReceiptsByChat(chatId);
    res.json({ chat: { ...chat, participants, receipts } });
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
    res.json({ messages: msgs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chats/:chatId/messages  — HTTP fallback (WS preferred)
router.post("/chats/:chatId/messages", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const { ciphertext, iv, msgType = "text", fileId } = req.body;
    if (!ciphertext || !iv) return res.status(400).json({ error: "ciphertext и iv обязательны" });

    const saved = await insertMessage(chatId, req.user.id, ciphertext, iv, msgType, fileId);

    const payload = {
      type: "new_message",
      message: { ...saved, sender_username: req.user.username },
    };
    await broadcastToChat(chatId, payload, null);

    res.json({ message: saved });
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

    const { ciphertext, iv } = req.body || {};
    if (!ciphertext || !iv) return res.status(400).json({ error: "ciphertext и iv обязательны" });

    const existing = await getMessageById(chatId, messageId);
    if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });
    if (existing.deleted_for_all) return res.status(400).json({ error: "Сообщение уже удалено" });
    if (existing.msg_type !== "text") return res.status(400).json({ error: "Редактирование доступно только для текстовых сообщений" });
    if (existing.sender_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Можно редактировать только свои сообщения" });
    }

    const updated = await updateMessageContent(chatId, messageId, ciphertext, iv);
    if (!updated) return res.status(404).json({ error: "Сообщение не найдено" });

    const payload = {
      type: "message_edited",
      chatId,
      message: {
        id: updated.id,
        chat_id: updated.chat_id,
        sender_id: updated.sender_id,
        sender_username: existing.sender_username,
        ciphertext: updated.ciphertext,
        iv: updated.iv,
        msg_type: updated.msg_type,
        file_id: updated.file_id,
        created_at: updated.created_at,
        edited_at: updated.edited_at,
      },
    };
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    res.json({ message: payload.message });
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

    const hasAccessToClient = await userHasClientAccess(pool, userId, chat.client_id);
    if (!hasAccessToClient) {
      return res.status(403).json({ error: "Пользователь не имеет доступа к клиенту этого чата" });
    }

    await addChatParticipant(chatId, userId, "member", encryptedChatKey);
    const participants = await getChatParticipants(chatId);
    const receipts = await getReceiptsByChat(chatId);

    // Notify all current participants (refresh participant list)
    const payload = { type: "participant_added", chatId, userId, participants };
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    // Ensure the newly added user receives the full chat payload right away.
    // Without this, their UI may not have this chat in local state yet.
    sendTo(userId, { type: "chat_created", chat: { ...chat, participants, receipts } });

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

    const targetHasClientAccess = await userHasClientAccess(pool, targetUserId, chat.client_id);
    if (targetHasClientAccess) {
      return res.status(400).json({ error: "Нельзя удалить участника вручную, пока у него есть доступ к этому клиенту" });
    }

    await removeChatParticipant(chatId, targetUserId);
    const participants = await getChatParticipants(chatId);

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
      // Clean up uploaded file on auth failure
      if (req.file) fs.unlink(req.file.path, () => {});
      return;
    }
    if (!req.file) return res.status(400).json({ error: "Файл не передан" });

    const fileId = uuidv4();
    const row = await insertChatFile(
      fileId, chatId, req.user.id,
      req.body.originalName || req.file.originalname || "file",
      req.body.mimeType || req.file.mimetype || "application/octet-stream",
      req.file.size,
      req.file.path
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

    const encodedOriginalName = encodeURIComponent(file.original_name || "file");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodedOriginalName}"`);
    res.setHeader("X-Original-Mime", file.mime_type);
    // Keep this header ASCII-only to avoid Node.js header validation errors.
    res.setHeader("X-Original-Name", encodedOriginalName);

    const stream = fs.createReadStream(file.storage_path);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(404).json({ error: "Файл не найден на диске" });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
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
