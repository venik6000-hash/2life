import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
if (!TOKEN) { console.log("set MESSENGER_TEST_TOKEN"); process.exit(1); }

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Get current me
const me = await call(`/api/auth/me`);
assert.equal(me.status, 200);
const original = me.data.user?.display_name || "";

// Patch display name
const patch = await call(`/api/auth/me`, "PATCH", { displayName: `verify-${Date.now()}` });
assert.equal(patch.status, 200);
assert.match(patch.data.displayName, /^verify-/);

// Restore
const restore = await call(`/api/auth/me`, "PATCH", { displayName: original });
assert.equal(restore.status, 200, "restore display name should succeed");

// Devices list
const devices = await call(`/api/messenger/devices`);
assert.equal(devices.status, 200);
assert.ok(Array.isArray(devices.data.devices));

console.log("messenger settings ok");
