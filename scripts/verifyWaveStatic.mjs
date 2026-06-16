import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const ctx = read("../src/context/DashboardContext.jsx");
assert.ok(/id:"wave"/.test(ctx), "wave registered in SECTIONS");

const dash = read("../src/dashboard.jsx");
assert.ok(/import\("\.\/sections\/Wave"\)/.test(dash), "Wave lazy-imported");
assert.ok(/\bwave:\s*\(\)\s*=>/.test(dash), "wave renderer registered");

const sec = read("../src/sections/Wave.jsx");
assert.ok(/не диагноз/.test(sec), "disclaimer present");

const routes = read("../server/routes/wave.js");
assert.ok(/requireSectionWrite\("wave"\)/.test(routes), "checkin guarded by section write");
assert.ok(/canAccessClient/.test(routes), "routes call canAccessClient");

console.log("wave static ok");
