import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const FOREIGN_MSG_ID = Number(process.env.SMOKE_FOREIGN_MSG_ID);

if (!TOKEN || !CHAT_ID || !FOREIGN_MSG_ID) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_FOREIGN_MSG_ID");
  process.exit(1);
}

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Send 2 own messages
const a = await call(`/api/chats/${CHAT_ID}/messages`, "POST", { text: "bulk a", clientMessageId: `bulk-a-${Date.now()}` });
const b = await call(`/api/chats/${CHAT_ID}/messages`, "POST", { text: "bulk b", clientMessageId: `bulk-b-${Date.now()}` });
assert.equal(a.status, 200, "send message a should succeed");
assert.equal(b.status, 200, "send message b should succeed");

// Mixed selection (own + foreign), scope=all → expect 403 atomic reject
const mixed = await call(`/api/chats/${CHAT_ID}/messages/bulk-delete`, "POST", {
  ids: [a.data.message.id, b.data.message.id, FOREIGN_MSG_ID], scope: "all",
});
assert.equal(mixed.status, 403);
assert.equal(mixed.data.error, "BULK_DELETE_FORBIDDEN");
assert.ok(Array.isArray(mixed.data.deniedIds));
assert.ok(mixed.data.deniedIds.includes(FOREIGN_MSG_ID));

// scope=self with same mixed selection → succeeds for self
const mixedSelf = await call(`/api/chats/${CHAT_ID}/messages/bulk-delete`, "POST", {
  ids: [a.data.message.id, b.data.message.id, FOREIGN_MSG_ID], scope: "self",
});
assert.equal(mixedSelf.status, 200);

console.log("messenger bulk ok");
