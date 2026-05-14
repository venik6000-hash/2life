import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const MSG_IDS = String(process.env.SMOKE_MSG_IDS || "").split(",").map(Number).filter(Boolean);

if (!TOKEN || !CHAT_ID || MSG_IDS.length < 6) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_MSG_IDS (>=6 ids comma-sep)");
  process.exit(0);
}

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

// Pin 5 messages
for (const id of MSG_IDS.slice(0, 5)) {
  const r = await call(`/api/chats/${CHAT_ID}/messages/${id}/pin`, "POST");
  assert.equal(r.status, 200, `pin ${id} should succeed`);
}

// 6th should hit limit
const sixth = await call(`/api/chats/${CHAT_ID}/messages/${MSG_IDS[5]}/pin`, "POST");
assert.equal(sixth.status, 409, "6th pin should fail with limit");
assert.match(sixth.data?.error || "", /PIN_LIMIT_REACHED/);

// List
const list = await call(`/api/chats/${CHAT_ID}/pinned`);
assert.equal(list.status, 200);
assert.equal(list.data.messages.length, 5);

// Unpin all
for (const id of MSG_IDS.slice(0, 5)) {
  const r = await call(`/api/chats/${CHAT_ID}/messages/${id}/pin`, "DELETE");
  assert.equal(r.status, 200);
}

// Personal pin lifecycle
for (const id of MSG_IDS.slice(0, 5)) {
  await call(`/api/chats/${CHAT_ID}/messages/${id}/pin-for-me`, "POST");
}
const sixthMe = await call(`/api/chats/${CHAT_ID}/messages/${MSG_IDS[5]}/pin-for-me`, "POST");
assert.equal(sixthMe.status, 409);
const listMe = await call(`/api/chats/${CHAT_ID}/pinned-for-me`);
assert.equal(listMe.data.messages.length, 5);
for (const id of MSG_IDS.slice(0, 5)) {
  await call(`/api/chats/${CHAT_ID}/messages/${id}/pin-for-me`, "DELETE");
}

console.log("messenger pin ok");
