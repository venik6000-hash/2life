const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const { isBlacklisted } = require("./tokenBlacklist");
const {
  pool,
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser,
  getChatById, getChatParticipants, isParticipant, upsertReceipt, getReceiptsByChat,
  getLastMessageForChat,
} = require("./db");
const { encryptText, encryptJson } = require("./messengerCrypto");
const { getPermissionsForRoleCached } = require("./permissions");
const { createSyncEvent } = require("./messengerStore");
const { sendPrivateMessagePush } = require("./messengerPush");

const JWT_SECRET = process.env.JWT_SECRET;

// userId -> Set<WebSocket>
const connections = new Map();

const addConn = (userId, ws) => {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId).add(ws);
};

const removeConn = (userId, ws) => {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
};

const sendTo = (userId, payload) => {
  const set = connections.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.user?.jti && isBlacklisted(ws.user.jti)) {
      try { ws.close(4401, "token_revoked"); } catch (_) {}
      continue;
    }
    if (ws.readyState === 1 /* OPEN */) ws.send(data);
  }
};

const forceLogoutJti = (jti, reason = "token_revoked") => {
  if (!jti) return;
  for (const set of connections.values()) {
    for (const ws of set) {
      if (ws.user?.jti === jti) {
        try { ws.close(4401, reason); } catch (_) {}
      }
    }
  }
};

const forceLogoutUser = (userId, reason = "session_revoked") => {
  const set = connections.get(userId);
  if (!set) return;
  for (const ws of set) {
    try { ws.close(4401, reason); } catch (_) {}
  }
};

// Принудительный логаут конкретного устройства: рассылаем событие во ВСЕ сокеты пользователя
// (клиент сам сравнит свой deviceId с targetDeviceId) и закрываем сокеты, привязанные к этому устройству.
const forceLogoutDevice = (userId, deviceId) => {
  const set = connections.get(userId);
  if (!set) return;
  const payload = JSON.stringify({ type: "force_logout", deviceId });
  for (const ws of set) {
    if (ws.readyState !== 1) continue;
    try { ws.send(payload); } catch (_) {}
    if (ws.deviceId && ws.deviceId === deviceId) {
      try { ws.close(4401, "device_revoked"); } catch (_) {}
    }
  }
};

const canRoleReadMessenger = async (role) => {
  if (role === "admin") return true;
  const perms = await getPermissionsForRoleCached(role);
  return !!perms?.sections?.messenger?.read;
};

// Chat-content payloads only — control frames (force logout, pong, self-echo
// after the user's own gated action) keep using sendTo. Mirrors the HTTP
// requireSectionRead("messenger") gate: a role with messenger disabled must
// not keep receiving live messages in an open tab.
const sendChatPayloadTo = async (userId, payload) => {
  const set = connections.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    const currentUser = await refreshWsUser(ws);
    if (!currentUser || !(await canRoleReadMessenger(currentUser.role))) continue;
    if (ws.readyState === 1 /* OPEN */) ws.send(data);
  }
};

const broadcastToChat = async (chatId, payload, exceptUserId) => {
  const participants = await getChatParticipants(chatId);
  for (const p of participants) {
    if (p.user_id === exceptUserId) continue;
    await sendChatPayloadTo(p.user_id, payload);
  }
};

const safeId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const normalizeText = (value) => String(value ?? "");

const normalizeMeta = (value) => (
  value && typeof value === "object" && !Array.isArray(value) ? value : {}
);

const validateReplyAndMentions = async (chatId, replyToMessageId, mentionedUserIds, meta) => {
  let replyParentId = null;
  if (replyToMessageId != null) {
    const replyId = Number(replyToMessageId);
    if (!Number.isInteger(replyId) || replyId <= 0) {
      throw new Error("Некорректный replyToMessageId");
    }
    const parent = await getMessageById(chatId, replyId);
    if (!parent) throw new Error("Сообщение-оригинал не найдено в этом чате");
    replyParentId = replyId;
  }
  const safeMentions = Array.isArray(mentionedUserIds)
    ? Array.from(new Set(mentionedUserIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
  if (safeMentions.length > 0) {
    const participants = await getChatParticipants(chatId);
    const participantIds = new Set(participants.map((p) => Number(p.user_id)));
    for (const id of safeMentions) {
      if (!participantIds.has(id)) throw new Error("Упоминаемый пользователь не участник чата");
    }
  }
  const mergedMeta = { ...(meta && typeof meta === "object" ? meta : {}) };
  if (safeMentions.length > 0) mergedMeta.mentionedUserIds = safeMentions;
  return { replyParentId, mergedMeta };
};

const messagePayload = (row, user, { text = "", meta = {} } = {}) => ({
  id: row.id,
  chat_id: row.chat_id,
  sender_id: row.sender_id,
  sender_username: user.username,
  sender_display_name: user.display_name || "",
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
});

const loadCurrentWsUser = async (userId, jti = null) => {
  const id = safeId(userId);
  if (!id) return null;
  const r = await pool.query(
    `SELECT u.id, u.username, u.role, u.all_clients_access, u.display_name, u.token_version,
            EXISTS (
              SELECT 1
                FROM revoked_auth_tokens rat
               WHERE rat.jti = $2
                 AND rat.expires_at > NOW()
            ) AS token_revoked
       FROM users u
      WHERE u.id = $1 AND u.active = true
      LIMIT 1`,
    [id, jti]
  );
  const row = r.rows[0] || null;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    all_clients_access: !!row.all_clients_access,
    display_name: row.display_name || "",
    token_version: Number(row.token_version || 0),
    token_revoked: !!row.token_revoked,
  };
};

const mergeWsUser = (tokenUser, currentUser) => ({
  ...tokenUser,
  id: currentUser.id,
  username: currentUser.username,
  role: currentUser.role,
  all_clients_access: currentUser.all_clients_access,
  display_name: currentUser.display_name,
  token_version: currentUser.token_version,
});

const refreshWsUser = async (ws) => {
  const currentUser = await loadCurrentWsUser(ws.user?.id, ws.user?.jti);
  if (!currentUser) {
    try { ws.close(4401, "user_inactive"); } catch (_) {}
    return null;
  }
  if (currentUser.token_revoked) {
    try { ws.close(4401, "token_revoked"); } catch (_) {}
    return null;
  }
  if (Number(ws.user?.token_version || 0) !== Number(currentUser.token_version || 0)) {
    try { ws.close(4401, "token_revoked"); } catch (_) {}
    return null;
  }
  ws.user = mergeWsUser(ws.user || {}, currentUser);
  return ws.user;
};

// Backstop for idle sockets: refreshWsUser is otherwise only driven by inbound
// frames / outbound chat payloads, so a socket that neither sends nor receives
// keeps its context until the token would naturally expire. This periodic sweep
// gives WS the same time-bounded revocation guarantee the SSE sweep provides —
// refreshWsUser closes (4401) any session that is now revoked, version-stale, or
// inactive, and harmlessly refreshes the rest.
const sweepRevokedConnections = async () => {
  for (const set of connections.values()) {
    for (const ws of Array.from(set)) {
      try { await refreshWsUser(ws); }
      catch (_) { /* transient DB error — fail open, retry next sweep */ }
    }
  }
};

let sweepTimer = null;
const startRevocationSweep = (intervalMs = 30_000) => {
  if (sweepTimer) return sweepTimer;
  sweepTimer = setInterval(() => { sweepRevokedConnections().catch(() => {}); }, intervalMs);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  return sweepTimer;
};

const stopRevocationSweep = () => {
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
};

// Authenticate an upgrade request: Bearer token or ?ticket= (one-time WS ticket)
const authenticateUpgrade = async (req) => {
  // Try Authorization header first (not common in browser WS, but useful for testing)
  const authHeader = req.headers["authorization"] || "";
  let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Browser WebSocket cannot set headers — use one-time ticket from query string
  if (!token) {
    const url = new URL(req.url, "http://localhost");
    const ticket = url.searchParams.get("ticket");
    if (ticket) {
      const { consumeWsTicket } = require("./wsTickets");
      const ticketUser = consumeWsTicket(ticket); // returns user object or null
      if (!ticketUser) return null;
      const currentUser = await loadCurrentWsUser(ticketUser.id, ticketUser.jti);
      if (currentUser?.token_revoked) return null;
      if (currentUser && Number(ticketUser.token_version || 0) !== Number(currentUser.token_version || 0)) return null;
      return currentUser ? mergeWsUser(ticketUser, currentUser) : null;
    }
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const currentUser = await loadCurrentWsUser(payload.id, payload.jti);
    if (currentUser?.token_revoked) return null;
    if (currentUser && Number(payload.token_version || 0) !== Number(currentUser.token_version || 0)) return null;
    return currentUser ? mergeWsUser(payload, currentUser) : null;
  } catch {
    return null;
  }
};

const handleMessage = async (ws, raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;

  const user = await refreshWsUser(ws);
  if (!user) return;
  const { type } = msg;

  // ── ping/pong heartbeat ──────────────────────────────────────────────────
  if (type === "ping") {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
    return;
  }

  // WS mirrors the HTTP enforcement: sending/editing/deleting messages needs
  // messenger WRITE permission (admin always passes).
  const canWriteMessenger = async () => {
    if (user.role === "admin") return true;
    const perms = await getPermissionsForRoleCached(user.role);
    return !!perms?.sections?.messenger?.write;
  };

  // ── send_message ──────────────────────────────────────────────────────────
  if (type === "send_message") {
    const chatId = safeId(msg.chatId);
    const text = normalizeText(msg.text);
    const meta = normalizeMeta(msg.meta);
    const msgType = String(msg.msgType || "text");
    const fileId = msg.fileId || null;
    const clientMessageId = String(msg.clientMessageId || "");
    const deviceId = String(msg.deviceId || "");
    if (!chatId) return;
    if (!text.trim() && msgType === "text") return;

    const ALLOWED_MSG_TYPES = new Set(["text", "image", "file", "files_bundle", "voice", "system"]);
    if (!ALLOWED_MSG_TYPES.has(msgType)) return;
    if (msgType === "voice" && (typeof text !== "string" || text.length > 4096)) {
      try { ws.send(JSON.stringify({ type: "send_error", error: "voice payload too large", clientMessageId })); } catch {}
      return;
    }

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;
    if (!(await canWriteMessenger())) {
      try { ws.send(JSON.stringify({ type: "send_error", error: "Нет прав на отправку сообщений", clientMessageId })); } catch {}
      return;
    }

    try {
      const { replyParentId, mergedMeta } = await validateReplyAndMentions(
        chatId,
        msg.replyToMessageId,
        msg.mentionedUserIds,
        meta,
      );

      const saved = await insertMessage(
        chatId,
        user.id,
        encryptText(text),
        encryptJson(mergedMeta),
        msgType,
        fileId,
        String(clientMessageId || ""),
        replyParentId,
      );
      const payload = {
        type: "new_message",
        message: messagePayload(saved, user, { text, meta: mergedMeta }),
      };

      // Deliver to all participants including sender (for multi-device)
      if (!saved.__existing) {
        const lastMessage = await getLastMessageForChat(chatId, null);
        await createSyncEvent(pool, {
          chatId,
          eventType: "new_message",
          payload: { messageId: saved.id, lastMessage },
        });
        await broadcastToChat(chatId, payload, null);
        const [participants, chat] = await Promise.all([getChatParticipants(chatId), getChatById(chatId)]);
        const targetUserIds = participants.map((p) => p.user_id).filter((id) => id !== user.id);
        sendPrivateMessagePush({
          userIds: targetUserIds,
          chatTitle: chat?.title || "Чат",
          url: `/app/messenger?chat=${chatId}`,
          exceptDeviceId: deviceId,
          msgType,
        }).catch(() => {});
      } else if (ws.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify(payload));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "send_error", error: e.message, clientMessageId }));
      return;
    }
  }

  // ── edit_message ──────────────────────────────────────────────────────────
  if (type === "edit_message") {
    const chatId = safeId(msg.chatId);
    const messageId = safeId(msg.messageId);
    const text = normalizeText(msg.text);
    const meta = normalizeMeta(msg.meta);
    if (!chatId || !messageId || !text.trim()) return;

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;
    if (!(await canWriteMessenger())) return;

    const original = await getMessageById(chatId, messageId);
    if (!original || original.deleted_for_all) return;
    if (original.msg_type !== "text") return;
    if (original.sender_id !== user.id && user.role !== "admin") return;

    const updated = await updateMessageContent(chatId, messageId, encryptText(text), encryptJson(meta));
    if (!updated) return;
    const chatRow = await getChatById(chatId);
    const lastMessage = chatRow?.last_message_id === messageId
      ? await getLastMessageForChat(chatId, null)
      : undefined;
    const syncPayload = { messageId };
    if (lastMessage !== undefined) syncPayload.lastMessage = lastMessage;
    await createSyncEvent(pool, {
      chatId,
      eventType: "message_edited",
      payload: syncPayload,
    });

    const payload = {
      type: "message_edited",
      chatId,
      message: messagePayload(updated, {
        ...user,
        username: original.sender_username,
        display_name: original.sender_display_name || "",
      }, { text, meta }),
    };
    await broadcastToChat(chatId, payload, null);
  }

  // ── delete_message ────────────────────────────────────────────────────────
  if (type === "delete_message") {
    const chatId = safeId(msg.chatId);
    const messageId = safeId(msg.messageId);
    const scope = String(msg.scope || "all");
    if (!chatId || !messageId) return;

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;
    if (!(await canWriteMessenger())) return;

    const existing = await getMessageById(chatId, messageId);
    if (!existing) return;

    if (scope === "self") {
      await hideMessageForUser(messageId, user.id);
      sendTo(user.id, { type: "message_deleted_self", chatId, messageId, userId: user.id });
      return;
    }

    if (scope === "all") {
      if (existing.sender_id !== user.id && user.role !== "admin") return;
      const deleted = await deleteMessageForAll(chatId, messageId, user.id);
      if (!deleted) return;
      const lastMessage = await getLastMessageForChat(chatId, null);
      await createSyncEvent(pool, {
        chatId,
        eventType: "message_deleted_all",
        payload: { messageId, userId: user.id, lastMessage },
      });
      const payload = { type: "message_deleted_all", chatId, messageId, userId: user.id, lastMessage };
      await broadcastToChat(chatId, payload, null);
    }
  }

  // ── mark_read ─────────────────────────────────────────────────────────────
  if (type === "mark_read") {
    const chatId = safeId(msg.chatId);
    const messageId = safeId(msg.messageId);
    if (!chatId || !messageId) return;

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;

    const message = await getMessageById(chatId, messageId);
    if (!message || Number(message.chat_id) !== chatId) {
      try { ws.send(JSON.stringify({ type: "read_error", chatId, code: "READ_MESSAGE_NOT_FOUND" })); } catch (_) {}
      return;
    }

    await upsertReceipt(chatId, user.id, messageId);

    const receipts = await getReceiptsByChat(chatId);
    const payload = { type: "receipts_update", chatId, receipts };
    await broadcastToChat(chatId, payload, null);
  }

  // ── typing ────────────────────────────────────────────────────────────────
  if (type === "typing" || type === "stop_typing") {
    const chatId = safeId(msg.chatId);
    if (!chatId) return;
    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;
    await broadcastToChat(chatId, { type, chatId, userId: user.id, username: user.username }, user.id);
  }
};

const initWebSocket = (httpServer) => {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    let user = null;
    try {
      user = await authenticateUpgrade(req);
    } catch (_) {
      user = null;
    }
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      // deviceId может прийти через ticket (для WS) или через query-параметр
      ws.deviceId = (user && user.deviceId) || url.searchParams.get("deviceId") || null;
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    const user = ws.user;
    addConn(user.id, ws);

    ws.on("message", (raw) => {
      handleMessage(ws, raw.toString()).catch(() => {});
    });

    ws.on("close", () => removeConn(user.id, ws));
    ws.on("error", () => removeConn(user.id, ws));
  });

  return wss;
};

module.exports = { initWebSocket, sendTo, sendChatPayloadTo, broadcastToChat, forceLogoutDevice, forceLogoutJti, forceLogoutUser, connections, sweepRevokedConnections, startRevocationSweep, stopRevocationSweep };
