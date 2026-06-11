// Behavioral verifier for SSE (Server-Sent Events) session revocation.
//
// A long-lived /events stream authenticates once at connect time and then stays
// open for the full token TTL. Without revocation it keeps emitting live
// client-update events after the user logs out, has their password reset, is
// downgraded to a client role, or is deactivated. This drives the real sse.js
// against a mocked pool (no Postgres needed) and asserts:
//   1. the periodic DB-backed sweep closes revoked / version-mismatched / inactive streams,
//   2. a fresh stream is preserved,
//   3. broadcast() drops a stream whose jti is in the in-memory blacklist,
//   4. closeConnectionsForJti / closeConnectionsForUser tear down matching streams.

const assert = require("assert");
const path = require("path");

const dbPath = path.resolve(__dirname, "../services/db.js");
const tokenPath = path.resolve(__dirname, "../services/tokenBlacklist.js");

// userId -> { token_version, token_revoked } | null (null = inactive/deleted)
let userRows = {};
const blacklisted = new Set();

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async (_text, params) => {
        const userId = params?.[0];
        const row = userRows[userId];
        return row
          ? { rows: [{ token_version: row.token_version, token_revoked: row.token_revoked, role: row.role }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      },
    },
  },
};
require.cache[tokenPath] = {
  id: tokenPath,
  filename: tokenPath,
  loaded: true,
  exports: { isBlacklisted: (jti) => blacklisted.has(jti) },
};

const sse = require("../services/sse");

const makeRes = (auth) => {
  const res = {
    __sseAuth: auth,
    writes: [],
    ended: false,
    write(msg) {
      if (this.ended) throw new Error("write after end");
      this.writes.push(msg);
      return true;
    },
    end() { this.ended = true; },
  };
  return res;
};

(async () => {
  // ── 1. Sweep closes revoked / version-mismatch / inactive, keeps fresh ──────
  const fresh    = makeRes({ userId: 1, jti: "jti-1", tokenVersion: 3, role: "doctor" });
  const revoked  = makeRes({ userId: 2, jti: "jti-2", tokenVersion: 1, role: "doctor" });
  const stale    = makeRes({ userId: 3, jti: "jti-3", tokenVersion: 4, role: "doctor" }); // version bumped in DB
  const inactive = makeRes({ userId: 4, jti: "jti-4", tokenVersion: 0, role: "doctor" }); // user row gone
  const demoted  = makeRes({ userId: 5, jti: "jti-5", tokenVersion: 2, role: "doctor" }); // role changed in DB

  for (const res of [fresh, revoked, stale, inactive, demoted]) sse.addConnection(res, res.__sseAuth);

  userRows = {
    1: { token_version: 3, token_revoked: false, role: "doctor" }, // matches → keep
    2: { token_version: 1, token_revoked: true,  role: "doctor" }, // jti revoked → close
    3: { token_version: 5, token_revoked: false, role: "doctor" }, // version mismatch → close
    // 4: absent → inactive/deleted → close
    5: { token_version: 2, token_revoked: false, role: "viewer" }, // role downgraded → close
  };

  await sse.sweepRevokedConnections();

  assert.strictEqual(fresh.ended, false, "fresh authorized stream must stay open");
  assert.strictEqual(revoked.ended, true, "stream with a persisted jti revocation must be closed");
  assert.strictEqual(stale.ended, true, "stream with an outdated token_version must be closed");
  assert.strictEqual(inactive.ended, true, "stream of a deactivated/deleted user must be closed");
  assert.strictEqual(demoted.ended, true, "stream whose role changed (no token_version bump) must be closed by the sweep");

  // ── 2. broadcast drops same-process blacklisted jti, delivers to the rest ───
  blacklisted.add("jti-1");
  sse.broadcast("client-updated", { clientId: "c1" });
  assert.strictEqual(fresh.ended, true, "broadcast must drop a stream whose jti is blacklisted in-process");
  assert.strictEqual(fresh.writes.length, 0, "a blacklisted stream must not receive the event");
  blacklisted.clear();

  // ── 3. broadcast delivers to a healthy stream and skips the excluded one ─────
  const a = makeRes({ userId: 10, jti: "jti-10", tokenVersion: 0 });
  const b = makeRes({ userId: 11, jti: "jti-11", tokenVersion: 0 });
  sse.addConnection(a, a.__sseAuth);
  sse.addConnection(b, b.__sseAuth);
  sse.broadcast("client-updated", { clientId: "c2" }, b);
  assert.strictEqual(a.writes.length, 1, "healthy stream must receive the broadcast");
  assert.strictEqual(b.writes.length, 0, "the originating stream must be excluded");

  // ── 4. closeConnectionsForJti / closeConnectionsForUser ─────────────────────
  sse.closeConnectionsForJti("jti-10");
  assert.strictEqual(a.ended, true, "closeConnectionsForJti must close the matching stream");
  assert.strictEqual(b.ended, false, "closeConnectionsForJti must not touch other streams");

  sse.closeConnectionsForUser(11);
  assert.strictEqual(b.ended, true, "closeConnectionsForUser must close the user's stream");

  // ── 5. transient DB error must fail open (do not drop everyone) ─────────────
  const survivor = makeRes({ userId: 99, jti: "jti-99", tokenVersion: 0 });
  sse.addConnection(survivor, survivor.__sseAuth);
  const dbExports = require.cache[dbPath].exports;
  const originalQuery = dbExports.pool.query;
  dbExports.pool.query = async () => { throw new Error("db blip"); };
  await sse.sweepRevokedConnections();
  assert.strictEqual(survivor.ended, false, "a transient DB error must not close authorized streams");
  dbExports.pool.query = originalQuery;

  sse.stopRevocationSweep();
  console.log("sse auth freshness verification ok");
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
