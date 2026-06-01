// Verifies Phase 3: one-chat-per-client invariant.
//
// Checks:
//   1. Static: MessengerContext.jsx dedupes by item.id (not item.client_id).
//   2. createChat is idempotent for client chats: calling it twice returns the same id.
//   3. createChat is NOT idempotent for internal chats: two internal chats get distinct ids.
//   4. normalizeChatList (inline re-implementation of the new logic) collapses same-id entries
//      and keeps both entries with distinct ids.
//
// Usage: run against a throwaway DB (DATABASE_URL env var).
// All test rows are cleaned up; pool.end() is called in finally.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pool, initSchema, createChat } = require("../services/db");

// ---------------------------------------------------------------------------
// Static check: MessengerContext.jsx must dedupe by item.id, not item.client_id
// ---------------------------------------------------------------------------
function checkMessengerContextStatic() {
  // Inside the container: __dirname = /app/scripts, src is mounted at /app/src
  const filePath = path.join(__dirname, "../src/context/MessengerContext.jsx");
  const src = fs.readFileSync(filePath, "utf8");

  assert.ok(
    src.includes("const key = item.id;"),
    'MessengerContext.jsx must contain `const key = item.id;` in normalizeChatList'
  );
  assert.ok(
    !src.includes("item.client_id || "),
    'MessengerContext.jsx must NOT contain `item.client_id || ` in normalizeChatList (old dedup key)'
  );
  console.log("✓ static: MessengerContext dedupes by item.id");
}

// ---------------------------------------------------------------------------
// Inline logic check: normalizeChatList new behaviour
// ---------------------------------------------------------------------------
function checkNormalizeChatListLogic() {
  // Inline re-implementation of the new normalizeChatList logic (key = item.id)
  const normalizeChatList = (items = []) => {
    const seen = new Set();
    const normalized = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.id) continue;
      const key = item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({ ...item, participants: item.participants || [], receipts: item.receipts || [] });
    }
    return normalized;
  };

  // Two entries with the same id collapse to one (dedup by id)
  const list1 = normalizeChatList([
    { id: 1, client_id: "c-abc", title: "A" },
    { id: 1, client_id: "c-abc", title: "A duplicate" },
  ]);
  assert.equal(list1.length, 1, "same-id entries should collapse to one");

  // Two internal chats with distinct ids are both kept
  const list2 = normalizeChatList([
    { id: 10, client_id: null, title: "Internal 1" },
    { id: 11, client_id: null, title: "Internal 2" },
  ]);
  assert.equal(list2.length, 2, "distinct-id entries should both be kept");

  // Two client chats with different ids but same client_id are both kept (old bug is gone)
  const list3 = normalizeChatList([
    { id: 20, client_id: "c-xyz", title: "Client chat 1" },
    { id: 21, client_id: "c-xyz", title: "Client chat 2" },
  ]);
  assert.equal(list3.length, 2, "distinct-id entries with same client_id must both be kept");

  console.log("✓ logic: normalizeChatList deduplication by id is correct");
}

// ---------------------------------------------------------------------------
// DB checks: createChat idempotency
// ---------------------------------------------------------------------------
async function checkCreateChatIdempotency() {
  // Create a throwaway user (don't assume user id=1 exists)
  const smokeUsername = `cu-smoke-user-${Date.now()}`;
  const userRes = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'admin') RETURNING id",
    [smokeUsername]
  );
  const smokeUserId = userRes.rows[0].id;

  // Create a throwaway client
  const clientId = `cu-smoke-client-${Date.now()}`;
  await pool.query(
    `INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
     VALUES ($1, 'CU Smoke', 'CU Smoke', '', 0, '', 'CU', '#000')`,
    [clientId]
  );

  const createdChatIds = [];
  const createdInternalChatIds = [];

  try {
    // --- Client chat idempotency ---
    const chat1 = await createChat({ clientId, title: "Test Chat A", createdBy: smokeUserId });
    const chat2 = await createChat({ clientId, title: "Test Chat A", createdBy: smokeUserId });
    createdChatIds.push(chat1.id);

    assert.equal(
      chat1.id, chat2.id,
      `createChat called twice for the same clientId must return the same id; got ${chat1.id} vs ${chat2.id}`
    );

    const countRes = await pool.query(
      "SELECT count(*)::int AS n FROM chats WHERE client_id = $1 AND is_internal = false",
      [clientId]
    );
    assert.equal(countRes.rows[0].n, 1, "exactly one client chat must exist after two createChat calls");
    console.log(`✓ createChat idempotent for client chats (both calls returned id=${chat1.id})`);

    // --- Internal chat non-idempotency ---
    const internal1 = await createChat({ clientId: null, title: "Internal A", createdBy: smokeUserId, isInternal: true });
    const internal2 = await createChat({ clientId: null, title: "Internal B", createdBy: smokeUserId, isInternal: true });
    createdInternalChatIds.push(internal1.id, internal2.id);

    assert.notEqual(
      internal1.id, internal2.id,
      "two internal chats (clientId=null) must get distinct ids"
    );
    console.log(`✓ createChat NOT idempotent for internal chats (ids ${internal1.id} and ${internal2.id} are distinct)`);

  } finally {
    // Cleanup: chats reference clients, clients cleanup cascades to chats via FK
    await pool.query("DELETE FROM chats WHERE id = ANY($1::int[])", [createdInternalChatIds]);
    await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
    await pool.query("DELETE FROM users WHERE username = $1", [smokeUsername]);
    console.log("✓ cleanup done");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  // Static checks (no DB needed)
  checkMessengerContextStatic();
  checkNormalizeChatListLogic();

  // DB checks
  await initSchema();
  await checkCreateChatIdempotency();

  console.log("chat uniqueness ok");
})()
  .catch((e) => {
    console.error("✗", e);
    process.exit(1);
  })
  .finally(() => pool.end());
