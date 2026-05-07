const assert = require("assert");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { getPushConfigStatus } = require("../services/messengerPush");

const rootDir = path.join(__dirname, "../..");
const composePath = path.join(rootDir, "docker-compose.yml");
const dockerfileFrontendPath = path.join(rootDir, "Dockerfile.frontend");

if (fs.existsSync(composePath) && fs.existsSync(dockerfileFrontendPath)) {
  const composeSource = fs.readFileSync(composePath, "utf8");
  const dockerfileFrontend = fs.readFileSync(dockerfileFrontendPath, "utf8");

  assert.ok(
    /VAPID_SUBJECT:\s*\$\{VAPID_SUBJECT/.test(composeSource),
    "docker compose server must receive VAPID_SUBJECT"
  );
  assert.ok(
    /VAPID_PUBLIC_KEY:\s*\$\{VAPID_PUBLIC_KEY/.test(composeSource),
    "docker compose server must receive VAPID_PUBLIC_KEY"
  );
  assert.ok(
    /VAPID_PRIVATE_KEY:\s*\$\{VAPID_PRIVATE_KEY/.test(composeSource),
    "docker compose server must receive VAPID_PRIVATE_KEY"
  );
  assert.ok(
    /VITE_VAPID_PUBLIC_KEY/.test(composeSource) && /VITE_VAPID_PUBLIC_KEY/.test(dockerfileFrontend),
    "frontend build must receive VITE_VAPID_PUBLIC_KEY"
  );
  assert.ok(
    /COPY\s+public\s+\.\/public/.test(dockerfileFrontend),
    "frontend build must copy public service worker assets"
  );
}

const status = getPushConfigStatus();
assert.ok(status.hasSubject, "runtime VAPID_SUBJECT must be configured");
assert.ok(status.hasPublicKey, "runtime VAPID_PUBLIC_KEY must be configured");
assert.ok(status.hasPrivateKey, "runtime VAPID_PRIVATE_KEY must be configured");
assert.equal(status.ready, true, "runtime push config must be ready");

console.log("messenger push config ok");
