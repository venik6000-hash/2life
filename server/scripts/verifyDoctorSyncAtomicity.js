/**
 * verifyDoctorSyncAtomicity.js — iteration-2 step 3 test
 *
 * Verifies on a THROWAWAY DB that doctor-assignment changes and chat-access
 * sync now commit ATOMICALLY:
 *   1. Happy path: replacing the doctor inside one transaction updates both
 *      client_assignments and chat_participants together.
 *   2. Failure path: an error inside the same transaction rolls back BOTH —
 *      the old doctor keeps assignment AND chat access consistently (no state
 *      where assignments point to the new doctor while the old one still sits
 *      in the chat).
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyDoctorSyncAtomicity.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema, withTransaction, replaceDoctorClientAssignments } = require("../services/db");
const { syncUserChatAccessByClientPermissions } = require("../services/chatAccessSync");

const snapshot = async () => {
  const a = await pool.query("SELECT user_id, client_id, assignment_source FROM client_assignments ORDER BY user_id, client_id");
  const p = await pool.query("SELECT chat_id, user_id FROM chat_participants ORDER BY chat_id, user_id");
  return JSON.stringify({ a: a.rows, p: p.rows });
};

(async () => {
  const dbNameRes = await pool.query("SELECT current_database() AS db");
  if (!/test|ttest|throwaway/i.test(dbNameRes.rows[0].db)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbNameRes.rows[0].db}'`);
    process.exit(2);
  }

  await initSchema();

  // Fixture: client c1, doctors A (current) and B (next), client chat with A inside.
  await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('doc_a','x','doctor'), ('doc_b','x','doctor') ON CONFLICT DO NOTHING");
  const docA = (await pool.query("SELECT id FROM users WHERE username='doc_a'")).rows[0].id;
  const docB = (await pool.query("SELECT id FROM users WHERE username='doc_b'")).rows[0].id;
  await pool.query("INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color) VALUES ('c1','Клиент 1','К1','',0,'','','') ON CONFLICT DO NOTHING");
  const chatRes = await pool.query(
    "INSERT INTO chats (client_id, title, created_by, is_internal) VALUES ('c1','Чат К1',$1,false) RETURNING id",
    [docA]
  );
  const chatId = chatRes.rows[0].id;
  await pool.query(
    "INSERT INTO client_assignments (user_id, client_id, assigned_by, assignment_source) VALUES ($1,'c1',0,'doctor')",
    [docA]
  );
  await pool.query(
    "INSERT INTO chat_participants (chat_id, user_id, role_in_chat, encrypted_chat_key) VALUES ($1,$2,'owner','')",
    [chatId, docA]
  );

  // ── 1. Happy path: one transaction moves assignment AND chat access A→B ──
  const syncResults = await withTransaction(async (db) => {
    const touched = await replaceDoctorClientAssignments("c1", [docB], null, db);
    const results = [];
    for (const userId of touched) {
      results.push({ userId, syncResult: await syncUserChatAccessByClientPermissions(db, userId) });
    }
    return results;
  });
  assert.equal(syncResults.length, 2, "both old and new doctor must be synced");

  const aAfter = await pool.query("SELECT user_id FROM client_assignments WHERE client_id='c1'");
  assert.deepEqual(aAfter.rows.map(r => r.user_id), [docB], "assignment must point to new doctor only");
  const pAfter = await pool.query("SELECT user_id FROM chat_participants WHERE chat_id=$1 ORDER BY user_id", [chatId]);
  assert.deepEqual(pAfter.rows.map(r => r.user_id), [docB].sort(), "chat must contain new doctor only");
  console.log("✓ happy path: assignment and chat access switch A→B in one transaction");

  // ── 2. Failure path: error inside the transaction rolls back BOTH ──
  const before = await snapshot();
  let threw = false;
  try {
    await withTransaction(async (db) => {
      const touched = await replaceDoctorClientAssignments("c1", [docA], null, db);
      for (const userId of touched) {
        await syncUserChatAccessByClientPermissions(db, userId);
      }
      // Mid-transaction sanity: inside the txn the change IS visible…
      const inside = await db.query("SELECT user_id FROM client_assignments WHERE client_id='c1'");
      assert.deepEqual(inside.rows.map(r => r.user_id), [docA]);
      throw new Error("simulated crash between sub-steps");
    });
  } catch (e) {
    threw = /simulated crash/.test(e.message);
  }
  assert.equal(threw, true, "transaction must have aborted via the simulated crash");
  const after = await snapshot();
  assert.equal(after, before, "rollback must restore BOTH client_assignments and chat_participants exactly");
  console.log("✓ failure path: simulated crash rolls back assignments AND chat access together");

  console.log("\nALL DOCTOR-SYNC ATOMICITY TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
