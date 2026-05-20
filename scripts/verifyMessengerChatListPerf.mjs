// scripts/verifyMessengerChatListPerf.mjs
// Smoke: измеряет латентность GET /api/chats и проверяет что денормализация работает.
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const MAX_MS = Number(process.env.CHAT_LIST_MAX_MS || 250);

if (!TOKEN) {
  console.log("set MESSENGER_TEST_TOKEN");
  process.exit(1);
}

const samples = 20;
const timings = [];

for (let i = 0; i < samples; i++) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/chats`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const t1 = performance.now();
  assert.equal(res.status, 200, "GET /api/chats should 200");
  const body = await res.json();
  assert.ok(Array.isArray(body?.chats), "response.chats must be array");
  timings.push(t1 - t0);
}

timings.sort((a, b) => a - b);
const p50 = timings[Math.floor(samples * 0.5)];
const p95 = timings[Math.min(samples - 1, Math.floor(samples * 0.95))];

console.log(`chat list: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms (n=${samples})`);
assert.ok(p95 < MAX_MS, `p95 ${p95.toFixed(1)}ms exceeds threshold ${MAX_MS}ms`);
console.log("messenger chat list perf ok");
