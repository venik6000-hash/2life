import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const routes = read("../server/routes/whoop.js");
assert.ok(/verifyWebhookSignature/.test(routes), "webhook verifies signature");
assert.ok(/requireSectionWrite\("wave"\)/.test(routes) && /canAccessClient/.test(routes), "connect/disconnect guarded");

const index = read("../server/index.js");
assert.ok(/req\.rawBody\s*=\s*buf/.test(index), "raw body captured for webhook HMAC");
assert.ok(/whoopRouter/.test(index), "whoop router mounted");

const sec = read("../src/sections/Wave.jsx");
assert.ok(/whoop\/connect/.test(sec), "connect entrypoint in UI");
assert.ok(/Отключить/.test(sec), "disconnect control in UI");

console.log("whoop static ok");
