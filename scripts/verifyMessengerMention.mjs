import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const TARGET_USER_ID = Number(process.env.SMOKE_TARGET_USER_ID);
const NON_PARTICIPANT_USER_ID = Number(process.env.SMOKE_NON_PARTICIPANT_USER_ID);

if (!TOKEN || !CHAT_ID || !TARGET_USER_ID || !NON_PARTICIPANT_USER_ID) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_TARGET_USER_ID, SMOKE_NON_PARTICIPANT_USER_ID");
  process.exit(0);
}

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Valid mention
const ok = await post(`/api/chats/${CHAT_ID}/messages`, {
  text: "hi @someone", mentionedUserIds: [TARGET_USER_ID], clientMessageId: `mention-ok-${Date.now()}`,
});
assert.equal(ok.status, 200);
assert.deepEqual(ok.data.message.meta?.mentionedUserIds, [TARGET_USER_ID]);

// Invalid mention (non-participant)
const bad = await post(`/api/chats/${CHAT_ID}/messages`, {
  text: "hi", mentionedUserIds: [NON_PARTICIPANT_USER_ID], clientMessageId: `mention-bad-${Date.now()}`,
});
assert.equal(bad.status, 400);

console.log("messenger mention ok");
