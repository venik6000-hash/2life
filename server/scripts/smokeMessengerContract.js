require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertMessengerTableAllowlist } = require("../services/messengerReset");
const { encryptText, decryptText } = require("../services/messengerCrypto");

assert.strictEqual(assertMessengerTableAllowlist(), true);
assert.strictEqual(decryptText(encryptText("contract")), "contract");

const routeSource = fs.readFileSync(path.join(__dirname, "../routes/messenger.js"), "utf8");
const composePath = path.join(__dirname, "../../docker-compose.yml");
assert.ok(routeSource.includes('router.get("/messenger/sync"'), "messenger sync endpoint must exist");
assert.ok(routeSource.includes('router.post("/messenger/devices"'), "messenger device register endpoint must exist");
assert.ok(routeSource.includes('router.delete("/messenger/devices/:deviceId"'), "messenger device unregister endpoint must exist");
assert.ok(!routeSource.includes('router.post("/crypto/keys"'), "old E2E key write endpoint must not remain active");
if (fs.existsSync(composePath)) {
  const composeSource = fs.readFileSync(composePath, "utf8");
  assert.ok(
    /MESSENGER_ENCRYPTION_SECRET:\s*\$\{MESSENGER_ENCRYPTION_SECRET:\?/.test(composeSource),
    "docker compose server must receive required MESSENGER_ENCRYPTION_SECRET"
  );
} else {
  assert.ok(
    String(process.env.MESSENGER_ENCRYPTION_SECRET || "").length >= 32,
    "runtime must receive required MESSENGER_ENCRYPTION_SECRET"
  );
}

console.log("messenger contract smoke ok");
