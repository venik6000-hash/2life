const assert = require("assert");
const path = require("path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-auth-login-rules-secret-at-least-32-chars";

const dbPath = path.resolve(__dirname, "../services/db.js");
const permissionsPath = path.resolve(__dirname, "../services/permissions.js");
const chatAccessPath = path.resolve(__dirname, "../services/chatAccessSync.js");
const notifyPath = path.resolve(__dirname, "../services/messengerAccessNotifications.js");
const middlewarePath = path.resolve(__dirname, "../middleware/auth.js");
const bcryptPath = require.resolve("bcryptjs");

let compareCalls = 0;
let getUserCalls = 0;

require.cache[bcryptPath] = {
  id: bcryptPath,
  filename: bcryptPath,
  loaded: true,
  exports: {
    compare: async () => {
      compareCalls += 1;
      return false;
    },
    hash: async () => "hash",
  },
};
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    getUser: async () => {
      getUserCalls += 1;
      return null;
    },
    listUsers: async () => [],
    createUser: async () => null,
    pool: { query: async () => ({ rows: [], rowCount: 0 }) },
  },
};
require.cache[permissionsPath] = {
  id: permissionsPath,
  filename: permissionsPath,
  loaded: true,
  exports: { getPermissionsForRole: async () => ({ sections: {} }) },
};
require.cache[chatAccessPath] = {
  id: chatAccessPath,
  filename: chatAccessPath,
  loaded: true,
  exports: { syncUserChatAccessByClientPermissions: async () => ({}) },
};
require.cache[notifyPath] = {
  id: notifyPath,
  filename: notifyPath,
  loaded: true,
  exports: { notifyUserChatAccessChanges: async () => {} },
};
require.cache[middlewarePath] = {
  id: middlewarePath,
  filename: middlewarePath,
  loaded: true,
  exports: {
    requireAuth: () => (_req, _res, next) => next(),
    signToken: () => "token",
  },
};

const router = require("../routes/auth");
const layer = router.stack.find((item) => item.route?.path === "/auth/login" && item.route?.methods?.post);
assert.ok(layer, "missing POST /auth/login");
const login = layer.route.stack.at(-1).handle;

const call = async (body) => {
  let statusCode = 200;
  let responseBody = null;
  await login(
    { body, ip: "127.0.0.1" },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseBody = payload;
        return this;
      },
    },
  );
  return { statusCode, responseBody };
};

(async () => {
  compareCalls = 0;
  getUserCalls = 0;
  const missingUser = await call({ username: "missing", password: "not-the-password" });
  assert.strictEqual(missingUser.statusCode, 401);
  assert.strictEqual(getUserCalls, 1);
  assert.strictEqual(compareCalls, 1, "missing users must still execute one bcrypt comparison");

  compareCalls = 0;
  getUserCalls = 0;
  const malformed = await call({ username: {}, password: [] });
  assert.strictEqual(malformed.statusCode, 400, "non-string credentials must be rejected as malformed input");
  assert.strictEqual(getUserCalls, 0, "malformed credentials must not reach the database");
  assert.strictEqual(compareCalls, 0, "malformed credentials must not run bcrypt");

  console.log("auth login rules verification ok");
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
