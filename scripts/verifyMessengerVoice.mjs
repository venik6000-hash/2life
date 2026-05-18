import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);

if (!TOKEN || !CHAT_ID) {
  console.log("set MESSENGER_TEST_TOKEN and SMOKE_CHAT_ID");
  process.exit(1);
}

const headers = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, ...extra });

// 1. Upload a fake file with audio mime.
const fakeBlob = new Blob([new Uint8Array(64)], { type: "audio/webm" });
const fd = new FormData();
fd.append("file", fakeBlob, "v.webm");
const up = await fetch(`${BASE}/api/chats/${CHAT_ID}/files`, { method: "POST", headers: headers(), body: fd });
assert.equal(up.status, 200, "upload should 200");
const uploaded = await up.json();
const fileId = uploaded.fileId || uploaded.file?.id;
assert.ok(fileId, "upload returns fileId");

// 2. Post a voice message referencing it.
const payload = JSON.stringify({ fileId, duration: 12.5, waveform: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" });
const post = await fetch(`${BASE}/api/chats/${CHAT_ID}/messages`, {
  method: "POST",
  headers: headers({ "Content-Type": "application/json" }),
  body: JSON.stringify({ msgType: "voice", text: payload, fileId }),
});
assert.equal(post.status, 200, "POST voice should 200");
const { message } = await post.json();
assert.equal(message.msg_type, "voice");

// 3. Oversize payload → 400.
const big = await fetch(`${BASE}/api/chats/${CHAT_ID}/messages`, {
  method: "POST",
  headers: headers({ "Content-Type": "application/json" }),
  body: JSON.stringify({ msgType: "voice", text: "x".repeat(5000) }),
});
assert.equal(big.status, 400);

// 4. Chat list shows voice as last_message.
const chats = await (await fetch(`${BASE}/api/chats`, { headers: headers() })).json();
const target = chats.chats.find((c) => Number(c.id) === CHAT_ID);
assert.equal(target.last_message.type, "voice");
assert.equal(target.last_message.id, message.id);

console.log("messenger voice ok");
