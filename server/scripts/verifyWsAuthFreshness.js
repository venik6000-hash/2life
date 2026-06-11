const assert = require("assert");
const path = require("path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-ws-auth-freshness-secret-at-least-32-chars";

const dbPath = path.resolve(__dirname, "../services/db.js");
const permissionsPath = path.resolve(__dirname, "../services/permissions.js");
const tokenPath = path.resolve(__dirname, "../services/tokenBlacklist.js");
const cryptoPath = path.resolve(__dirname, "../services/messengerCrypto.js");
const storePath = path.resolve(__dirname, "../services/messengerStore.js");
const pushPath = path.resolve(__dirname, "../services/messengerPush.js");

let currentRow = null;

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async () => ({ rows: currentRow ? [currentRow] : [], rowCount: currentRow ? 1 : 0 }),
    },
    insertMessage: async () => null,
    getMessageById: async () => null,
    updateMessageContent: async () => null,
    deleteMessageForAll: async () => null,
    hideMessageForUser: async () => null,
    getChatById: async () => null,
    getChatParticipants: async () => [],
    isParticipant: async () => false,
    upsertReceipt: async () => null,
    getReceiptsByChat: async () => [],
    getLastMessageForChat: async () => null,
  },
};
require.cache[permissionsPath] = {
  id: permissionsPath,
  filename: permissionsPath,
  loaded: true,
  exports: {
    getPermissionsForRoleCached: async (role) => ({
      sections: { messenger: { read: role === "doctor", write: role === "doctor" } },
    }),
  },
};
require.cache[tokenPath] = {
  id: tokenPath,
  filename: tokenPath,
  loaded: true,
  exports: { isBlacklisted: () => false },
};
require.cache[cryptoPath] = {
  id: cryptoPath,
  filename: cryptoPath,
  loaded: true,
  exports: { encryptText: (value) => value, encryptJson: (value) => value },
};
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: { createSyncEvent: async () => null },
};
require.cache[pushPath] = {
  id: pushPath,
  filename: pushPath,
  loaded: true,
  exports: { sendPrivateMessagePush: async () => null },
};

const { connections, sendChatPayloadTo, sweepRevokedConnections } = require("../services/ws");

(async () => {
  const sent = [];
  const closed = [];
  const ws = {
    user: { id: 7, role: "admin", jti: "jti-7", token_version: 2 },
    readyState: 1,
    send: (payload) => sent.push(payload),
    close: (code, reason) => closed.push({ code, reason }),
  };
  connections.set(7, new Set([ws]));

  currentRow = {
    id: 7,
    username: "fresh-user",
    role: "viewer",
    all_clients_access: false,
    display_name: "Fresh User",
    token_version: 2,
    token_revoked: false,
  };
  await sendChatPayloadTo(7, { type: "new_message" });
  assert.strictEqual(sent.length, 0, "a stale admin socket must not receive chat data after role downgrade");
  assert.strictEqual(ws.user.role, "viewer", "socket context must refresh from the current DB role");

  currentRow = { ...currentRow, role: "doctor", token_revoked: true };
  await sendChatPayloadTo(7, { type: "new_message" });
  assert.deepStrictEqual(
    closed,
    [{ code: 4401, reason: "token_revoked" }],
    "persistently revoked sockets must close before outbound delivery",
  );

  connections.clear();

  // ── idle-socket revocation sweep (parity with the SSE sweep) ────────────────
  // An idle socket that neither sends nor receives must still be closed once its
  // session is revoked, rather than lingering until token expiry.
  const idleClosed = [];
  const idle = {
    user: { id: 9, role: "doctor", jti: "jti-9", token_version: 1 },
    readyState: 1,
    send: () => {},
    close: (code, reason) => idleClosed.push({ code, reason }),
  };
  connections.set(9, new Set([idle]));
  currentRow = {
    id: 9, username: "idle", role: "doctor", all_clients_access: false,
    display_name: "Idle", token_version: 1, token_revoked: true,
  };
  await sweepRevokedConnections();
  assert.deepStrictEqual(
    idleClosed,
    [{ code: 4401, reason: "token_revoked" }],
    "the WS revocation sweep must close idle sockets whose session was revoked",
  );
  connections.clear();

  console.log("websocket auth freshness verification ok");
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
