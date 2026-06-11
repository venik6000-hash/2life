import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldClearSessionAfterAuthCheck } from "../src/utils/authSession.js";

assert.equal(shouldClearSessionAfterAuthCheck(401), true, "401 must clear an invalid cached session");
assert.equal(shouldClearSessionAfterAuthCheck(500), false, "500 must preserve a cached session");
assert.equal(shouldClearSessionAfterAuthCheck(503), false, "startup 503 must preserve a cached session");
assert.equal(shouldClearSessionAfterAuthCheck(null), false, "network failures must preserve a cached session");

const authContext = readFileSync(new URL("../src/context/AuthContext.jsx", import.meta.url), "utf8");
assert.ok(
  authContext.includes("shouldClearSessionAfterAuthCheck(res.status)"),
  "AuthContext bootstrap must distinguish invalid credentials from transient failures",
);
assert.ok(
  authContext.includes("if (!res.ok) return null"),
  "AuthContext bootstrap must preserve the cached session after non-auth HTTP failures",
);
assert.ok(
  authContext.indexOf("clearSessionCache();") < authContext.indexOf('fetch("/api/auth/logout"'),
  "logout must clear local credentials before waiting for best-effort server revocation",
);

console.log("auth client lifecycle verification ok");
