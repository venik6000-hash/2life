const { webcrypto } = require("crypto");
const { decryptPrivateKeyFromRecovery, publicJwkFromRecovery } = require("./messengerRecovery");

const subtle = webcrypto.subtle;

const hasText = (value) => String(value || "").trim() !== "";

const toSafeInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toB64 = (buf) => Buffer.from(new Uint8Array(buf)).toString("base64");
const fromB64 = (value) => Buffer.from(String(value || ""), "base64");

const parseWrappedChatKey = (rawWrappedKey, fallbackWrappedBy) => {
  if (!hasText(rawWrappedKey)) return null;

  const fallback = toSafeInt(fallbackWrappedBy);
  try {
    const parsed = JSON.parse(rawWrappedKey);
    if (!parsed || typeof parsed !== "object") return null;
    const wrappedBy = toSafeInt(parsed.wrappedBy) || fallback;
    const wrappedKey = hasText(parsed.key) ? parsed.key : "";
    if (!wrappedBy || !wrappedKey) return null;
    return { wrappedBy, wrappedKey };
  } catch {
    if (!fallback) return null;
    return { wrappedBy: fallback, wrappedKey: String(rawWrappedKey) };
  }
};

const importPublicKeyJwk = async (jwk) => {
  const parsed = typeof jwk === "string" ? JSON.parse(jwk) : jwk;
  return subtle.importKey(
    "jwk",
    parsed,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
};

const importPrivateKeyJwk = async (jwk) => {
  const parsed = typeof jwk === "string" ? JSON.parse(jwk) : jwk;
  return subtle.importKey(
    "jwk",
    parsed,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
};

const unwrapChatKey = async (myPrivateKey, senderPublicKey, wrappedB64) => {
  const sharedKey = await subtle.deriveKey(
    { name: "ECDH", public: senderPublicKey },
    myPrivateKey,
    { name: "AES-KW", length: 256 },
    false,
    ["unwrapKey"]
  );
  return subtle.unwrapKey(
    "raw",
    fromB64(wrappedB64),
    sharedKey,
    { name: "AES-KW" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

const wrapChatKeyForParticipant = async (myPrivateKey, theirPublicKey, chatKey) => {
  const sharedKey = await subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey"]
  );
  const wrapped = await subtle.wrapKey("raw", chatKey, sharedKey, { name: "AES-KW" });
  return toB64(wrapped);
};

const getUserKeyRow = async (db, userId) => {
  const r = await db.query(
    `SELECT user_id, public_key_jwk, recovery_encrypted_private_key_jwk, recovery_key_iv
     FROM user_public_keys
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
};

const getPublicJwkFromRow = (row) => {
  if (!row) return "";
  if (hasText(row.public_key_jwk)) return row.public_key_jwk;
  if (hasText(row.recovery_encrypted_private_key_jwk) && hasText(row.recovery_key_iv)) {
    try {
      return publicJwkFromRecovery(row.recovery_encrypted_private_key_jwk, row.recovery_key_iv);
    } catch {
      return "";
    }
  }
  return "";
};

const createKeyResolver = (db) => {
  const rowCache = new Map();
  const publicKeyCache = new Map();
  const privateKeyCache = new Map();

  const loadRow = async (userId) => {
    const safeUserId = toSafeInt(userId);
    if (!safeUserId) return null;
    if (!rowCache.has(safeUserId)) {
      rowCache.set(safeUserId, await getUserKeyRow(db, safeUserId));
    }
    return rowCache.get(safeUserId);
  };

  const getPublicKey = async (userId) => {
    const safeUserId = toSafeInt(userId);
    if (!safeUserId) return null;
    if (!publicKeyCache.has(safeUserId)) {
      const row = await loadRow(safeUserId);
      const publicJwk = getPublicJwkFromRow(row);
      if (!hasText(publicJwk)) {
        publicKeyCache.set(safeUserId, null);
      } else {
        try {
          publicKeyCache.set(safeUserId, await importPublicKeyJwk(publicJwk));
        } catch {
          publicKeyCache.set(safeUserId, null);
        }
      }
    }
    return publicKeyCache.get(safeUserId);
  };

  const getPrivateKey = async (userId) => {
    const safeUserId = toSafeInt(userId);
    if (!safeUserId) return null;
    if (!privateKeyCache.has(safeUserId)) {
      const row = await loadRow(safeUserId);
      if (!row || !hasText(row.recovery_encrypted_private_key_jwk) || !hasText(row.recovery_key_iv)) {
        privateKeyCache.set(safeUserId, null);
      } else {
        try {
          const privateJwk = decryptPrivateKeyFromRecovery(
            row.recovery_encrypted_private_key_jwk,
            row.recovery_key_iv
          );
          privateKeyCache.set(safeUserId, await importPrivateKeyJwk(privateJwk));
        } catch {
          privateKeyCache.set(safeUserId, null);
        }
      }
    }
    return privateKeyCache.get(safeUserId);
  };

  return { getPublicKey, getPrivateKey };
};

const getChatMeta = async (db, chatId) => {
  const safeChatId = toSafeInt(chatId);
  if (!safeChatId) return null;
  const r = await db.query(
    "SELECT id, client_id, created_by FROM chats WHERE id = $1 LIMIT 1",
    [safeChatId]
  );
  return r.rows[0] || null;
};

const getChatParticipantRows = async (db, chatId) => {
  const safeChatId = toSafeInt(chatId);
  if (!safeChatId) return [];
  const r = await db.query(
    `SELECT user_id, role_in_chat, encrypted_chat_key
     FROM chat_participants
     WHERE chat_id = $1
     ORDER BY id`,
    [safeChatId]
  );
  return r.rows;
};

const upsertParticipant = async (db, chatId, userId, roleInChat, encryptedChatKey) => {
  await db.query(
    `INSERT INTO chat_participants (chat_id, user_id, role_in_chat, encrypted_chat_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (chat_id, user_id) DO UPDATE SET
       role_in_chat = EXCLUDED.role_in_chat,
       encrypted_chat_key = CASE
         WHEN EXCLUDED.encrypted_chat_key <> '' THEN EXCLUDED.encrypted_chat_key
         ELSE chat_participants.encrypted_chat_key
       END`,
    [chatId, userId, roleInChat, encryptedChatKey || ""]
  );
};

const buildEncryptedChatKeyForUser = async ({ db, chat, targetUserId, keyResolver, participants }) => {
  const targetPublicKey = await keyResolver.getPublicKey(targetUserId);
  if (!targetPublicKey) return "";

  const participantRows = Array.isArray(participants) ? participants : await getChatParticipantRows(db, chat.id);

  for (const row of participantRows) {
    const parsed = parseWrappedChatKey(row.encrypted_chat_key, chat.created_by);
    if (!parsed) continue;

    const sourcePrivateKey = await keyResolver.getPrivateKey(row.user_id);
    if (!sourcePrivateKey) continue;

    const senderPublicKey = await keyResolver.getPublicKey(parsed.wrappedBy);
    if (!senderPublicKey) continue;

    try {
      const chatKey = await unwrapChatKey(sourcePrivateKey, senderPublicKey, parsed.wrappedKey);
      const wrappedForTarget = await wrapChatKeyForParticipant(sourcePrivateKey, targetPublicKey, chatKey);
      return JSON.stringify({ wrappedBy: row.user_id, key: wrappedForTarget });
    } catch (_) {
      // Try next participant key bundle.
    }
  }

  return "";
};

const getAllowedClientIdsForUser = async (db, userId) => {
  const safeUserId = toSafeInt(userId);
  if (!safeUserId) return new Set();

  const userRes = await db.query(
    "SELECT role, active, all_clients_access FROM users WHERE id = $1 LIMIT 1",
    [safeUserId]
  );
  const user = userRes.rows[0] || null;
  if (!user || !user.active) return new Set();

  if (user.role === "admin" || !!user.all_clients_access) {
    const allClientsRes = await db.query("SELECT id FROM clients");
    return new Set(allClientsRes.rows.map((row) => row.id));
  }

  const assignmentRes = await db.query(
    "SELECT client_id FROM client_assignments WHERE user_id = $1",
    [safeUserId]
  );
  return new Set(assignmentRes.rows.map((row) => row.client_id));
};

const getUsersWithClientAccess = async (db, clientId) => {
  const safeClientId = String(clientId || "").trim();
  if (!safeClientId) return [];

  const r = await db.query(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN client_assignments ca
       ON ca.user_id = u.id
      AND ca.client_id = $1
     WHERE u.active = true
       AND (u.role = 'admin' OR u.all_clients_access = true OR ca.user_id IS NOT NULL)
     ORDER BY u.id`,
    [safeClientId]
  );
  return r.rows.map((row) => row.id);
};

const userHasClientAccess = async (db, userId, clientId) => {
  const safeUserId = toSafeInt(userId);
  const safeClientId = String(clientId || "").trim();
  if (!safeUserId || !safeClientId) return false;

  const r = await db.query(
    `SELECT 1
     FROM users u
     LEFT JOIN client_assignments ca
       ON ca.user_id = u.id
      AND ca.client_id = $2
     WHERE u.id = $1
       AND u.active = true
       AND (u.role = 'admin' OR u.all_clients_access = true OR ca.user_id IS NOT NULL)
     LIMIT 1`,
    [safeUserId, safeClientId]
  );
  return r.rows.length > 0;
};

const syncUserChatAccessByClientPermissions = async (db, userId) => {
  const safeUserId = toSafeInt(userId);
  if (!safeUserId) return { addedChatIds: [], removedChatIds: [], updatedChatIds: [] };

  const allowedClientIds = await getAllowedClientIdsForUser(db, safeUserId);

  const chatsRes = await db.query(
    "SELECT id, client_id, created_by FROM chats ORDER BY id"
  );
  const chats = chatsRes.rows;

  const currentRes = await db.query(
    `SELECT chat_id, role_in_chat, encrypted_chat_key
     FROM chat_participants
     WHERE user_id = $1`,
    [safeUserId]
  );
  const currentByChatId = new Map(currentRes.rows.map((row) => [row.chat_id, row]));

  const keyResolver = createKeyResolver(db);
  const addedChatIds = [];
  const removedChatIds = [];
  const updatedChatIds = [];

  for (const chat of chats) {
    if (!chat?.client_id) continue;

    const shouldHaveAccess = allowedClientIds.has(chat.client_id);
    const current = currentByChatId.get(chat.id);
    const roleInChat = chat.created_by === safeUserId ? "owner" : "member";

    if (!shouldHaveAccess && current) {
      await db.query("DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2", [chat.id, safeUserId]);
      removedChatIds.push(chat.id);
      continue;
    }

    if (!shouldHaveAccess) continue;

    if (!current) {
      const participants = await getChatParticipantRows(db, chat.id);
      const encryptedChatKey = await buildEncryptedChatKeyForUser({
        db,
        chat,
        targetUserId: safeUserId,
        keyResolver,
        participants,
      });
      await upsertParticipant(db, chat.id, safeUserId, roleInChat, encryptedChatKey);
      addedChatIds.push(chat.id);
      continue;
    }

    let encryptedChatKey = "";
    if (!hasText(current.encrypted_chat_key)) {
      const participants = await getChatParticipantRows(db, chat.id);
      encryptedChatKey = await buildEncryptedChatKeyForUser({
        db,
        chat,
        targetUserId: safeUserId,
        keyResolver,
        participants,
      });
    }

    if (current.role_in_chat !== roleInChat || hasText(encryptedChatKey)) {
      await upsertParticipant(db, chat.id, safeUserId, roleInChat, encryptedChatKey);
      updatedChatIds.push(chat.id);
    }
  }

  return { addedChatIds, removedChatIds, updatedChatIds };
};

const syncChatParticipantsByClientAccess = async (db, chatId) => {
  const chat = await getChatMeta(db, chatId);
  if (!chat) return null;
  if (!chat.client_id) {
    return {
      chatId: chat.id,
      clientId: null,
      addedUserIds: [],
      removedUserIds: [],
      updatedUserIds: [],
    };
  }

  const allowedUserIds = await getUsersWithClientAccess(db, chat.client_id);
  const allowedSet = new Set(allowedUserIds);
  const participants = await getChatParticipantRows(db, chat.id);
  const currentByUserId = new Map(participants.map((row) => [row.user_id, row]));

  const keyResolver = createKeyResolver(db);
  const addedUserIds = [];
  const removedUserIds = [];
  const updatedUserIds = [];

  for (const userId of allowedUserIds) {
    const current = currentByUserId.get(userId);
    const roleInChat = chat.created_by === userId ? "owner" : "member";

    if (!current) {
      const encryptedChatKey = await buildEncryptedChatKeyForUser({
        db,
        chat,
        targetUserId: userId,
        keyResolver,
        participants,
      });
      await upsertParticipant(db, chat.id, userId, roleInChat, encryptedChatKey);
      const nextRow = { user_id: userId, role_in_chat: roleInChat, encrypted_chat_key: encryptedChatKey || "" };
      participants.push(nextRow);
      currentByUserId.set(userId, nextRow);
      addedUserIds.push(userId);
      continue;
    }

    let encryptedChatKey = "";
    if (!hasText(current.encrypted_chat_key)) {
      encryptedChatKey = await buildEncryptedChatKeyForUser({
        db,
        chat,
        targetUserId: userId,
        keyResolver,
        participants,
      });
    }

    if (current.role_in_chat !== roleInChat || hasText(encryptedChatKey)) {
      await upsertParticipant(db, chat.id, userId, roleInChat, encryptedChatKey);
      current.role_in_chat = roleInChat;
      if (hasText(encryptedChatKey)) current.encrypted_chat_key = encryptedChatKey;
      updatedUserIds.push(userId);
    }
  }

  for (const row of participants) {
    if (!allowedSet.has(row.user_id)) {
      await db.query("DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2", [chat.id, row.user_id]);
      removedUserIds.push(row.user_id);
    }
  }

  return {
    chatId: chat.id,
    clientId: chat.client_id,
    addedUserIds,
    removedUserIds,
    updatedUserIds,
  };
};

module.exports = {
  syncUserChatAccessByClientPermissions,
  syncChatParticipantsByClientAccess,
  userHasClientAccess,
};
