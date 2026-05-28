import assert from "node:assert/strict";
import { withTimeout } from "../src/utils/requestTimeout.js";

const fastResult = await withTimeout(Promise.resolve("ok"), "fallback", 50);
assert.equal(fastResult, "ok", "fast requests should keep their result");

const started = Date.now();
const timeoutResult = await withTimeout(new Promise(() => {}), "fallback", 30);
assert.equal(timeoutResult, "fallback", "hung requests should resolve to fallback");
assert.ok(Date.now() - started < 500, "timeout should not wait for hung request forever");

console.log("dashboard bootstrap timeout ok");
