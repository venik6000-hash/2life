// scripts/verifyMessengerChatPreviewSync.mjs
// Smoke: проверяет что /messenger/sync возвращает events с lastMessage payload
// для new_message — это нужно для клиентского replaySyncEvents.
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;

if (!TOKEN) {
  console.log("set MESSENGER_TEST_TOKEN");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}` };

const initial = await fetch(`${BASE}/api/messenger/sync?after=0`, { headers: auth });
assert.equal(initial.status, 200);
const initialBody = await initial.json();
const cursor = Number(initialBody.cursor || 0);

const chatsRes = await fetch(`${BASE}/api/chats`, { headers: auth });
const chatsBody = await chatsRes.json();
const chat = (chatsBody.chats || []).find((c) => c.role_in_chat);
assert.ok(chat, "need at least one chat to test");

console.log(`baseline cursor=${cursor}, chat=${chat.id}`);
console.log("send a message to this chat now, then press enter");
process.stdin.once("data", async () => {
  const after = await fetch(`${BASE}/api/messenger/sync?after=${cursor}`, { headers: auth });
  const afterBody = await after.json();
  const newMsgEvent = (afterBody.events || []).find(
    (e) => e.event_type === "new_message" && Number(e.chat_id) === Number(chat.id)
  );
  assert.ok(newMsgEvent, "expected new_message event in sync after sending message");
  const payload = typeof newMsgEvent.payload === "string"
    ? JSON.parse(newMsgEvent.payload) : newMsgEvent.payload;
  assert.ok(payload?.lastMessage, "new_message payload must include lastMessage");
  for (const key of ["id", "senderId", "type", "text", "createdAt"]) {
    assert.ok(key in payload.lastMessage, `lastMessage.${key} required`);
  }
  console.log("messenger chat preview sync ok");
  process.exit(0);
});
