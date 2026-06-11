import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helpers = await import("../src/utils/helpers.js");
assert.equal(typeof helpers.escapeHtml, "function", "shared print HTML escaper must exist");
const { escapeHtml } = helpers;

const payload = `<img src=x onerror="localStorage.setItem('stolen','1')">`;
assert.equal(
  escapeHtml(payload),
  "&lt;img src=x onerror=&quot;localStorage.setItem(&#39;stolen&#39;,&#39;1&#39;)&quot;&gt;",
  "print metadata must be HTML escaped",
);

const dashboard = readFileSync(new URL("../src/dashboard.jsx", import.meta.url), "utf8");
assert.ok(dashboard.includes("escapeHtml"), "dashboard print metadata must use the shared HTML escaper");
assert.ok(
  dashboard.includes("Content-Security-Policy"),
  "dashboard print document must carry a script-blocking CSP",
);

const labOrder = readFileSync(new URL("../src/utils/labOrderUtils.js", import.meta.url), "utf8");
assert.ok(labOrder.includes("escapeHtml"), "lab-order print metadata must use the shared HTML escaper");
assert.ok(
  labOrder.includes("Content-Security-Policy"),
  "lab-order print document must carry a script-blocking CSP",
);

const nginx = readFileSync(new URL("../nginx.conf", import.meta.url), "utf8");
assert.ok(
  nginx.includes("Content-Security-Policy"),
  "production frontend must send a restrictive CSP",
);

console.log("print security verification ok");
