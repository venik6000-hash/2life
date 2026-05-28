import assert from "node:assert/strict";
import { withNoStoreCache } from "../src/utils/fetchOptions.js";

assert.deepEqual(
  withNoStoreCache({ headers: { Accept: "application/json" } }),
  { headers: { Accept: "application/json" }, cache: "no-store" },
  "fetch options should disable browser cache by default"
);

assert.deepEqual(
  withNoStoreCache({ cache: "reload", method: "GET" }),
  { cache: "reload", method: "GET" },
  "explicit cache mode should be preserved"
);

console.log("no-store fetch options ok");
