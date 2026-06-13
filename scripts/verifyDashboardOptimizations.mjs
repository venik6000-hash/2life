import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPatchOps, collapsePatchOps } from "../src/utils/clientPatch.js";
import { getReferenceRefreshType } from "../src/utils/referenceRefresh.js";

const prevClient = {
  id: "c1",
  profile: { name: "Анна", city: "Москва" },
  stages: [{ tasks: ["Первая", "Вторая"] }],
};
const nextClient = {
  id: "c1",
  profile: { name: "Мария" },
  stages: [{ tasks: ["Первая", "Обновлённая", "Третья"] }],
};
const originalPrevClient = structuredClone(prevClient);

assert.deepEqual(buildPatchOps(prevClient, prevClient), []);
assert.deepEqual(buildPatchOps(prevClient, nextClient), [
  { op: "set", path: ["profile", "name"], value: "Мария" },
  { op: "delete", path: ["profile", "city"] },
  { op: "set", path: ["stages", 0, "tasks", 1], value: "Обновлённая" },
  { op: "set", path: ["stages", 0, "tasks", 2], value: "Третья" },
]);
assert.deepEqual(
  buildPatchOps(
    { stages: [{ tasks: ["a", "b", "c"] }] },
    { stages: [{ tasks: ["a"] }] },
  ),
  [
    { op: "delete", path: ["stages", 0, "tasks", 2] },
    { op: "delete", path: ["stages", 0, "tasks", 1] },
  ],
);
assert.deepEqual(
  collapsePatchOps([
    { op: "set", path: ["profile", "name"], value: "А" },
    { op: "set", path: ["profile", "city"], value: "Казань" },
    { op: "set", path: ["profile", "name"], value: "Б" },
  ]),
  [
    { op: "set", path: ["profile", "city"], value: "Казань" },
    { op: "set", path: ["profile", "name"], value: "Б" },
  ],
);
assert.deepEqual(prevClient, originalPrevClient, "patch diff must not mutate the previous client");

assert.equal(getReferenceRefreshType(false, "overview", "lab"), null);
assert.equal(getReferenceRefreshType(true, "overview", "overview"), null);
assert.equal(getReferenceRefreshType(true, "overview", "nutrition"), null);
assert.equal(getReferenceRefreshType(true, "nutrition", "overview"), "deficit_preset");
assert.equal(getReferenceRefreshType(true, "overview", "lab"), "lab_order_item");
assert.equal(getReferenceRefreshType(true, "lab", "overview"), "deficit_preset");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardSource = fs.readFileSync(
  path.join(repoRoot, "src/context/DashboardContext.jsx"),
  "utf8",
);
const updateStart = dashboardSource.indexOf("const uC = useCallback");
const updateEnd = dashboardSource.indexOf("const uS = useCallback", updateStart);
assert.ok(updateStart >= 0 && updateEnd > updateStart, "uC source block must exist");
const updateSource = dashboardSource.slice(updateStart, updateEnd);
const referenceEffectStart = dashboardSource.indexOf("const previousReferenceSectionRef");
const referenceEffectEnd = dashboardSource.indexOf(
  "const reloadLabOrderTemplates",
  referenceEffectStart,
);
assert.ok(
  referenceEffectStart >= 0 && referenceEffectEnd > referenceEffectStart,
  "reference refresh effect source block must exist",
);
const referenceEffectSource = dashboardSource.slice(referenceEffectStart, referenceEffectEnd);

assert.equal(
  (updateSource.match(/structuredClone\(c\)/g) || []).length,
  1,
  "uC must clone a client only once",
);
assert.match(
  updateSource,
  /queueClientPatchOps\(cid,\s*c,\s*resolvedClient\)/,
  "uC must diff the immutable current client against the resolved draft",
);
assert.match(
  referenceEffectSource,
  /getReferenceRefreshType\(loaded,\s*previousSection,\s*sec\)/,
  "reference effect must use the tested refresh decision",
);
assert.match(
  referenceEffectSource,
  /sec === "overview" && !canReadSection\("overview"\)[\s\S]*setDeficitPresets\(\[\]\)/,
  "overview reference data must clear after permission revocation",
);
assert.match(
  referenceEffectSource,
  /sec === "lab" && !canReadSection\("lab"\)[\s\S]*setLabOrderTemplates\(\[\]\)/,
  "lab reference data must clear after permission revocation",
);
assert.match(
  referenceEffectSource,
  /if \(cancelled\) return;[\s\S]*return \(\) => \{ cancelled = true; \};/,
  "reference refresh must ignore stale async results",
);

console.log("dashboard optimization verification ok");
