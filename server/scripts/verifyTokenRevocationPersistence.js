const assert = require("assert");
const path = require("path");

const dbPath = path.resolve(__dirname, "../services/db.js");
const servicePath = path.resolve(__dirname, "../services/tokenBlacklist.js");
const revoked = new Map();

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      async query(sql, params = []) {
        const text = String(sql);
        if (text.includes("INSERT INTO revoked_auth_tokens")) {
          revoked.set(params[0], new Date(params[1]));
          return { rows: [], rowCount: 1 };
        }
        if (text.includes("SELECT expires_at FROM revoked_auth_tokens")) {
          const expiresAt = revoked.get(params[0]);
          return expiresAt && expiresAt.getTime() > Date.now()
            ? { rows: [{ expires_at: expiresAt }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        if (text.includes("DELETE FROM revoked_auth_tokens")) {
          return { rows: [], rowCount: 0 };
        }
        throw new Error(`Unexpected query: ${text}`);
      },
    },
  },
};

(async () => {
  let service = require(servicePath);
  const expiresAt = new Date(Date.now() + 60_000);
  await service.blacklistToken("persisted-jti", expiresAt);
  assert.strictEqual(service.isBlacklisted("persisted-jti"), true, "same-process revocation must be immediate");

  delete require.cache[servicePath];
  service = require(servicePath);
  assert.strictEqual(
    await service.isTokenRevoked("persisted-jti"),
    true,
    "revocation must survive a process/module restart",
  );

  console.log("token revocation persistence verification ok");
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
