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

const needle = `marker-${Date.now()}`;
const send = await call(`/api/chats/${CHAT_ID}/messages`, "POST", { text: `hello ${needle} world`, clientMessageId: needle });
assert.equal(send.status, 200);

// In-chat search
const inChat = await call(`/api/chats/${CHAT_ID}/messages/search?q=${encodeURIComponent(needle)}`);
assert.equal(inChat.status, 200);
assert.ok(inChat.data.matches.some((m) => m.snippet.includes(needle)));

// Global search
const global = await call(`/api/messenger/search?q=${encodeURIComponent(needle)}`);
assert.equal(global.status, 200);
assert.ok(global.data.groups.some((g) => g.matches.some((m) => m.snippet.includes(needle))));

// Too-short query returns empty done
const short = await call(`/api/chats/${CHAT_ID}/messages/search?q=a`);
assert.deepEqual(short.data, { matches: [], done: true });

console.log("messenger search ok");
