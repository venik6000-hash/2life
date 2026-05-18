import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);

if (!TOKEN || !CHAT_ID) {
  console.log("set MESSENGER_TEST_TOKEN and SMOKE_CHAT_ID");
  process.exit(1);
}

const call = async (path) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const { status, data } = await call("/api/chats");
assert.equal(status, 200, "GET /api/chats should 200");
assert.ok(Array.isArray(data?.chats), "response.chats must be array");

const target = data.chats.find((c) => Number(c.id) === CHAT_ID);
assert.ok(target, `chat ${CHAT_ID} should be reachable`);
assert.ok("last_message" in target, "every chat row must include last_message");

if (target.last_message) {
  for (const key of ["id", "senderId", "type", "text", "createdAt"]) {
    assert.ok(key in target.last_message, `last_message.${key} required`);
  }
  assert.notEqual(target.last_message.type, "system",
    "system messages must not surface as last_message");
}

console.log("messenger chat preview ok");
