const assert = require("assert");
const path = require("path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-auth-fresh-user-secret";

const dbPath = path.resolve(__dirname, "../services/db.js");
let currentDbUser = null;

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async () => ({
        rows: currentDbUser?.active ? [currentDbUser] : [],
      }),
    },
  },
};

const { requireAuth, signToken } = require("../middleware/auth");

const runMiddleware = async (middleware, token) => {
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const req = {
    headers: { authorization: `Bearer ${token}` },
    query: {},
  };
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

  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { req, statusCode, body, nextCalled };
};

(async () => {
  const staleAdminToken = signToken({ id: 7, username: "old-admin", role: "admin" });

  currentDbUser = {
    id: 7,
    username: "doctor-now",
    role: "doctor",
    active: true,
    all_clients_access: false,
    display_name: "Doctor Now",
    token_version: 0,
  };
  const downgraded = await runMiddleware(requireAuth("admin"), staleAdminToken);
  assert.strictEqual(downgraded.nextCalled, false, "stale admin token must not pass admin gate after role downgrade");
  assert.strictEqual(downgraded.statusCode, 403, "downgraded user should receive 403");

  currentDbUser = {
    id: 7,
    username: "inactive-admin",
    role: "admin",
    active: false,
    all_clients_access: true,
    display_name: "Inactive Admin",
    token_version: 0,
  };
  const inactive = await runMiddleware(requireAuth("admin"), staleAdminToken);
  assert.strictEqual(inactive.nextCalled, false, "inactive user must not pass auth");
  assert.strictEqual(inactive.statusCode, 401, "inactive user should receive 401");

  currentDbUser = null;
  const deleted = await runMiddleware(requireAuth(), staleAdminToken);
  assert.strictEqual(deleted.nextCalled, false, "deleted user must not pass auth");
  assert.strictEqual(deleted.statusCode, 401, "deleted user should receive 401");

  currentDbUser = {
    id: 7,
    username: "current-admin",
    role: "admin",
    active: true,
    all_clients_access: true,
    display_name: "Current Admin",
    token_version: 1,
  };
  const staleVersion = await runMiddleware(requireAuth("admin"), staleAdminToken);
  assert.strictEqual(staleVersion.nextCalled, false, "stale token version must not pass auth");
  assert.strictEqual(staleVersion.statusCode, 401, "stale token version should receive 401");

  const currentAdminToken = signToken({ id: 7, username: "current-admin", role: "admin", token_version: 1 });
  const active = await runMiddleware(requireAuth("admin"), currentAdminToken);
  assert.strictEqual(active.nextCalled, true, "active current admin should pass auth");
  assert.strictEqual(active.req.user.username, "current-admin");
  assert.strictEqual(active.req.user.role, "admin");
  assert.strictEqual(active.req.user.jti.length > 0, true, "fresh user context should retain token jti");

  console.log("auth fresh user verification ok");
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
