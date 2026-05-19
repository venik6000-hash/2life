import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const OWN_MSG_ID = Number(process.env.SMOKE_OWN_MSG_ID);
const OTHER_MSG_ID = Number(process.env.SMOKE_OTHER_MSG_ID);
const EXPECTED_READER_USER_ID = Number(process.env.SMOKE_READER_USER_ID || 0);

if (!TOKEN || !CHAT_ID || !OWN_MSG_ID || !OTHER_MSG_ID) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_OWN_MSG_ID, SMOKE_OTHER_MSG_ID");
  process.exit(1);
}

const call = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Own message → 200 + array
const ownRes = await call(`/api/chats/${CHAT_ID}/messages/${OWN_MSG_ID}/readers`);
assert.equal(ownRes.status, 200);
assert.ok(Array.isArray(ownRes.data?.readers));
for (const reader of ownRes.data.readers) {
  assert.ok(Number.isInteger(Number(reader.userId)) && Number(reader.userId) > 0, "reader.userId required");
  assert.ok(typeof reader.name === "string" && reader.name.trim(), "reader.name required");
  assert.ok(reader.readAt, "reader.readAt required");
}
if (EXPECTED_READER_USER_ID) {
  assert.ok(
    ownRes.data.readers.some((reader) => Number(reader.userId) === EXPECTED_READER_USER_ID),
    `expected reader ${EXPECTED_READER_USER_ID} should be present`,
  );
}

// Other's message → 403
const otherRes = await call(`/api/chats/${CHAT_ID}/messages/${OTHER_MSG_ID}/readers`);
assert.equal(otherRes.status, 403);

// Bad id → 400
const badRes = await call(`/api/chats/${CHAT_ID}/messages/abc/readers`);
assert.equal(badRes.status, 400);

console.log("messenger readers ok");
