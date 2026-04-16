const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const { isBlacklisted } = require("./tokenBlacklist");
const {
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser,
  getChatParticipants, isParticipant, upsertReceipt, getReceiptsByChat,
} = require("./db");

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
    if (ws.readyState === 1 /* OPEN */) ws.send(data);
  }
};

const broadcastToChat = async (chatId, payload, exceptUserId) => {
  const participants = await getChatParticipants(chatId);
  for (const p of participants) {
    if (p.user_id === exceptUserId) continue;
    sendTo(p.user_id, payload);
  }
};

// Authenticate an upgrade request: Bearer token or ?ticket= (one-time WS ticket)
const authenticateUpgrade = (req) => {
  // Try Authorization header first (not common in browser WS, but useful for testing)
  const authHeader = req.headers["authorization"] || "";
  let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Browser WebSocket cannot set headers — use one-time ticket from query string
  if (!token) {
    const url = new URL(req.url, "http://localhost");
    const ticket = url.searchParams.get("ticket");
    if (ticket) {
      const { consumeWsTicket } = require("./wsTickets");
      return consumeWsTicket(ticket); // returns user object or null
    }
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.jti && isBlacklisted(payload.jti)) return null;
    return payload;
  } catch {
    return null;
  }
};

const handleMessage = async (ws, user, raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const { type } = msg;

  // ── ping/pong heartbeat ──────────────────────────────────────────────────
  if (type === "ping") {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
    return;
  }

  // ── send_message ──────────────────────────────────────────────────────────
  if (type === "send_message") {
    const { chatId, ciphertext, iv, msgType = "text", fileId } = msg;
    if (!chatId || !ciphertext || !iv) return;

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;

    const saved = await insertMessage(chatId, user.id, ciphertext, iv, msgType, fileId);

    const payload = {
      type: "new_message",
      message: {
        id: saved.id,
        chat_id: saved.chat_id,
        sender_id: saved.sender_id,
        sender_username: user.username,
        ciphertext: saved.ciphertext,
        iv: saved.iv,
        msg_type: saved.msg_type,
        file_id: saved.file_id,
        created_at: saved.created_at,
        edited_at: saved.edited_at || null,
      },
    };

    // Deliver to all participants including sender (for multi-device)
    await broadcastToChat(chatId, payload, null);
    // Also send to sender if not already covered
    sendTo(user.id, payload);
  }

  // ── edit_message ──────────────────────────────────────────────────────────
  if (type === "edit_message") {
    const { chatId, messageId, ciphertext, iv } = msg;
    if (!chatId || !messageId || !ciphertext || !iv) return;

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;

    const original = await getMessageById(chatId, messageId);
    if (!original || original.deleted_for_all) return;
    if (original.msg_type !== "text") return;
    if (original.sender_id !== user.id && user.role !== "admin") return;

    const updated = await updateMessageContent(chatId, messageId, ciphertext, iv);
    if (!updated) return;

    const payload = {
      type: "message_edited",
      chatId,
      message: {
        id: updated.id,
        chat_id: updated.chat_id,
        sender_id: updated.sender_id,
        sender_username: original.sender_username,
        ciphertext: updated.ciphertext,
        iv: updated.iv,
        msg_type: updated.msg_type,
        file_id: updated.file_id,
        created_at: updated.created_at,
        edited_at: updated.edited_at,
      },
    };
    await broadcastToChat(chatId, payload, null);
    sendTo(user.id, payload);
  }

  // ── delete_message ────────────────────────────────────────────────────────
  if (type === "delete_message") {
    const { chatId, messageId, scope = "all" } = msg;
    if (!chatId || !messageId) return;

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;

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
      const payload = { type: "message_deleted_all", chatId, messageId, userId: user.id };
      await broadcastToChat(chatId, payload, null);
      sendTo(user.id, payload);
    }
  }

  // ── mark_read ─────────────────────────────────────────────────────────────
  if (type === "mark_read") {
    const { chatId, messageId } = msg;
    if (!chatId || !messageId) return;

    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;

    await upsertReceipt(chatId, user.id, messageId);

    const receipts = await getReceiptsByChat(chatId);
    const payload = { type: "receipts_update", chatId, receipts };
    await broadcastToChat(chatId, payload, null);
    sendTo(user.id, payload);
  }

  // ── typing ────────────────────────────────────────────────────────────────
  if (type === "typing" || type === "stop_typing") {
    const { chatId } = msg;
    if (!chatId) return;
    const allowed = await isParticipant(chatId, user.id);
    if (!allowed) return;
    await broadcastToChat(chatId, { type, chatId, userId: user.id, username: user.username }, user.id);
  }
};

const initWebSocket = (httpServer) => {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const user = authenticateUpgrade(req);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    const user = ws.user;
    addConn(user.id, ws);

    ws.on("message", (raw) => handleMessage(ws, user, raw.toString()));

    ws.on("close", () => removeConn(user.id, ws));
    ws.on("error", () => removeConn(user.id, ws));
  });

  return wss;
};

module.exports = { initWebSocket, sendTo, broadcastToChat, connections };
