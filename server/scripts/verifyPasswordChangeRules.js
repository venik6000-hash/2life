const assert = require("assert");
const path = require("path");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-password-change-rules-secret";

const dbPath = path.resolve(__dirname, "../services/db.js");
const permissionsPath = path.resolve(__dirname, "../services/permissions.js");
const chatAccessPath = path.resolve(__dirname, "../services/chatAccessSync.js");
const notifyPath = path.resolve(__dirname, "../services/messengerAccessNotifications.js");
const middlewarePath = path.resolve(__dirname, "../middleware/auth.js");

let scenario = null;
let forceLogoutCalls = [];

const makeClient = () => ({
  queries: [],
  async query(sql, params = []) {
    this.queries.push({ sql, params });
    const text = String(sql);
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
    if (text.includes("SELECT * FROM users WHERE id = $1 FOR UPDATE")) {
      return { rows: scenario.selfUser ? [scenario.selfUser] : [], rowCount: scenario.selfUser ? 1 : 0 };
    }
    if (text.includes("SELECT id, role, active FROM users WHERE id = $1 FOR UPDATE")) {
      return { rows: scenario.targetUser ? [scenario.targetUser] : [], rowCount: scenario.targetUser ? 1 : 0 };
    }
    if (text.includes("SELECT COUNT(*)::int AS n FROM users")) return { rows: [{ n: 1 }], rowCount: 1 };
    if (text.includes("SELECT public_key_jwk")) return { rows: [], rowCount: 0 };
    if (text.includes("SELECT name FROM roles")) {
      return { rows: [{ name: "admin" }, { name: "doctor" }, { name: "client" }], rowCount: 3 };
    }
    if (text.includes("UPDATE users SET password_hash")) return { rows: [], rowCount: 1 };
    if (text.includes("UPDATE users SET active")) return { rows: [], rowCount: 1 };
    if (text.includes("UPDATE users SET role")) return { rows: [], rowCount: 1 };
    if (text.includes("UPDATE users SET all_clients_access")) return { rows: [], rowCount: 1 };
    if (text.includes("UPDATE users SET display_name")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${text}`);
  },
  release() {},
});

let lastClient = null;
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      connect: async () => {
        lastClient = makeClient();
        return lastClient;
      },
      query: async () => ({ rows: [], rowCount: 0 }),
    },
    getUser: async () => null,
    listUsers: async () => [],
    createUser: async () => null,
  },
};
require.cache[permissionsPath] = {
  id: permissionsPath,
  filename: permissionsPath,
  loaded: true,
  exports: {
    getPermissionsForRole: async () => {
      if (scenario?.permissionsThrow) throw new Error("permissions unavailable");
      return { isAdmin: true, sections: {} };
    },
  },
};
require.cache[chatAccessPath] = {
  id: chatAccessPath,
  filename: chatAccessPath,
  loaded: true,
  exports: { syncUserChatAccessByClientPermissions: async () => ({ added: [], removed: [] }) },
};
require.cache[notifyPath] = {
  id: notifyPath,
  filename: notifyPath,
  loaded: true,
  exports: {
    notifyUserChatAccessChanges: async () => {
      if (scenario?.notifyThrows) throw new Error("notification unavailable");
    },
  },
};
require.cache[middlewarePath] = {
  id: middlewarePath,
  filename: middlewarePath,
  loaded: true,
  exports: {
    requireAuth: () => (_req, _res, next) => next(),
    signToken: (payload) => `token:${payload.id}:${payload.token_version}`,
  },
};

const router = require("../routes/auth");
const wsPath = path.resolve(__dirname, "../services/ws.js");
require.cache[wsPath] = {
  id: wsPath,
  filename: wsPath,
  loaded: true,
  exports: {
    forceLogoutUser: (userId, reason) => forceLogoutCalls.push({ userId, reason }),
  },
};

const findHandler = (method, routePath) => {
  const layer = router.stack.find((item) => item.route?.path === routePath && item.route?.methods?.[method]);
  assert.ok(layer, `missing ${method.toUpperCase()} ${routePath}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
};

const changePassword = findHandler("post", "/auth/change-password");
const patchUser = findHandler("patch", "/admin/users/:id");

const call = async (handler, req) => {
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  await handler(req, res);
  return { statusCode, body, queries: lastClient?.queries || [] };
};

(async () => {
  const passwordHash = await bcrypt.hash("old-password", 4);
  const baseUser = {
    id: 7,
    username: "user",
    role: "client",
    active: true,
    all_clients_access: false,
    password_hash: passwordHash,
    token_version: 0,
  };

  scenario = { selfUser: baseUser };
  const missingCurrent = await call(changePassword, {
    user: { id: 7, role: "client", jti: "jti-1" },
    body: { newPassword: "new-password" },
  });
  assert.strictEqual(missingCurrent.statusCode, 400, "non-admin self change must require current password");
  assert.match(missingCurrent.body.error, /текущий пароль/i);

  scenario = { selfUser: baseUser };
  const wrongCurrent = await call(changePassword, {
    user: { id: 7, role: "client", jti: "jti-2" },
    body: { currentPassword: "wrong-password", newPassword: "new-password" },
  });
  assert.strictEqual(wrongCurrent.statusCode, 400, "wrong current password must be a form error, not session-ending 401");
  assert.match(wrongCurrent.body.error, /неверный текущий пароль/i);

  scenario = { selfUser: { ...baseUser, role: "admin", all_clients_access: true } };
  const adminSelf = await call(changePassword, {
    user: { id: 7, role: "admin", jti: "jti-3" },
    body: { newPassword: "new-password" },
  });
  assert.strictEqual(adminSelf.statusCode, 200, "admin self change must allow missing current password");
  assert.strictEqual(adminSelf.body.ok, true);
  assert.ok(adminSelf.body.token, "admin self change should return a fresh token");

  scenario = {
    targetUser: { id: 8, role: "client", active: true },
  };
  const adminReset = await call(patchUser, {
    user: { id: 7, role: "admin", jti: "jti-4" },
    params: { id: "8" },
    body: { password: "reset-password" },
  });
  assert.strictEqual(adminReset.statusCode, 200, "admin reset of another user must not require old password");
  assert.strictEqual(adminReset.body.ok, true);

  scenario = {
    targetUser: { id: 8, role: "doctor", active: true },
    notifyThrows: true,
  };
  forceLogoutCalls = [];
  const roleChange = await call(patchUser, {
    user: { id: 7, role: "admin", jti: "jti-5" },
    params: { id: "8" },
    body: { role: "client" },
  });
  assert.strictEqual(roleChange.statusCode, 200, "committed role changes must not be reported as failed when notifications fail");
  assert.deepStrictEqual(
    forceLogoutCalls,
    [{ userId: 8, reason: "role_changed" }],
    "role changes must immediately close the user's open websocket sessions",
  );

  scenario = {
    selfUser: { ...baseUser, role: "admin", all_clients_access: true },
    permissionsThrow: true,
  };
  const permissionFailure = await call(changePassword, {
    user: { id: 7, role: "admin", jti: "jti-6" },
    body: { newPassword: "new-password" },
  });
  assert.strictEqual(permissionFailure.statusCode, 500);
  assert.strictEqual(
    permissionFailure.queries.some(({ sql }) => String(sql) === "COMMIT"),
    false,
    "password change must not commit before all response data is ready",
  );

  console.log("password change rules ok");
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
