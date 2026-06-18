/**
 * verifySseClientScope.js — iteration-4 item 3
 *
 * "client-updated" SSE events used to fan out to EVERY open stream via
 * broadcast(), leaking client-id existence and edit-activity timing to staff
 * with no access to that client. broadcastToClientWatchers() scopes delivery to
 * users who may see the client (admin / all_clients_access / assignment — the
 * same predicate as canAccessClient, via getUsersWithClientAccess).
 *
 * Verifies, against a throwaway DB with fake in-memory streams:
 *   1. admin, all_clients_access staff, and assigned staff RECEIVE the event.
 *   2. staff WITHOUT access do NOT receive it.
 *   3. an unauthenticated/legacy stream (no userId) does NOT receive it.
 *   4. excludeRes is honored (the initiating stream is skipped).
 *   5. a resolver error delivers nothing (fail closed — never leak).
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifySseClientScope.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { addConnection, removeConnection, broadcastToClientWatchers } = require("../services/sse");
const { getUsersWithClientAccess } = require("../services/chatAccessSync");

const resolver = (cid) => getUsersWithClientAccess(pool, cid);

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  await pool.query("INSERT INTO clients (id, name) VALUES ('c1','C1') ON CONFLICT (id) DO NOTHING");
  const mkUser = async (name, role, allAccess = false) => (await pool.query(
    "INSERT INTO users (username, password_hash, role, active, all_clients_access) VALUES ($1,'x',$2,true,$3) RETURNING id",
    [name, role, allAccess])).rows[0].id;
  const admin = await mkUser("s4_admin", "admin");
  const assigned = await mkUser("s4_assigned", "doctor");
  const other = await mkUser("s4_other", "doctor");
  const allAcc = await mkUser("s4_all", "doctor", true);
  await pool.query("INSERT INTO client_assignments (user_id, client_id) VALUES ($1,'c1') ON CONFLICT DO NOTHING", [assigned]);

  const live = [];
  const mkConn = (userId) => {
    const res = { __msgs: [], write(m) { this.__msgs.push(m); }, end() {} };
    addConnection(res, userId == null ? null : { userId, jti: null, tokenVersion: 0, role: "x" });
    live.push(res);
    return res;
  };
  const clearConns = () => { while (live.length) removeConnection(live.pop()); };

  // 1–3: scoped delivery
  const cAdmin = mkConn(admin);
  const cAssigned = mkConn(assigned);
  const cOther = mkConn(other);
  const cAll = mkConn(allAcc);
  const cLegacy = mkConn(null);

  await broadcastToClientWatchers("client-updated", "c1", { clientId: "c1" }, resolver);

  assert.equal(cAdmin.__msgs.length, 1, "admin receives client event");
  assert.equal(cAssigned.__msgs.length, 1, "assigned staff receives client event");
  assert.equal(cAll.__msgs.length, 1, "all_clients_access staff receives client event");
  assert.equal(cOther.__msgs.length, 0, "staff WITHOUT access must NOT receive client event");
  assert.equal(cLegacy.__msgs.length, 0, "unauthenticated stream must NOT receive client event");
  assert.match(cAdmin.__msgs[0], /event: client-updated/, "payload is the client-updated event");
  console.log("✓ client-updated scoped to users with access (admin/all/assigned in, others + legacy out)");
  clearConns();

  // 4: excludeRes honored
  const cExcluded = mkConn(admin);
  await broadcastToClientWatchers("client-updated", "c1", { clientId: "c1" }, resolver, cExcluded);
  assert.equal(cExcluded.__msgs.length, 0, "excludeRes stream is skipped even though admin has access");
  console.log("✓ excludeRes honored");
  clearConns();

  // 5: resolver error → fail closed
  const cFailClosed = mkConn(admin);
  await broadcastToClientWatchers("client-updated", "c1", { clientId: "c1" }, async () => { throw new Error("boom"); });
  assert.equal(cFailClosed.__msgs.length, 0, "resolver error delivers nothing (fail closed)");
  console.log("✓ resolver error fails closed (no leak)");
  clearConns();

  console.log("\nALL SSE CLIENT-SCOPE TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
