import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);

if (!TOKEN || !CHAT_ID) { console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID"); process.exit(0); }

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Send parent
const parent = await call(`/api/chats/${CHAT_ID}/messages`, "POST", {
  text: "parent for reply test", clientMessageId: `parent-${Date.now()}`,
});
assert.equal(parent.status, 200);
const parentId = parent.data.message.id;

// Reply to parent
const reply = await call(`/api/chats/${CHAT_ID}/messages`, "POST", {
  text: "this is a reply", replyToMessageId: parentId, clientMessageId: `reply-${Date.now()}`,
});
assert.equal(reply.status, 200);
assert.equal(reply.data.message.reply_to_message_id, parentId);

// Delete parent for all (only works if you own it)
await call(`/api/chats/${CHAT_ID}/messages/${parentId}?scope=all`, "DELETE");

// Re-fetch reply — reply_to_message_id should now be null (ON DELETE SET NULL)
const fetched = await call(`/api/chats/${CHAT_ID}/messages?before=${reply.data.message.id + 1}&limit=20`);
const found = fetched.data.messages.find((m) => m.id === reply.data.message.id);
assert.equal(found.reply_to_message_id, null);

console.log("messenger reply ok");
