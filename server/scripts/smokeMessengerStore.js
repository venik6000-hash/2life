require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const assert = require("assert");
const { initSchema, pool } = require("../services/db");
const { assertMessengerTableAllowlist } = require("../services/messengerReset");

(async () => {
  await initSchema();
  assert.strictEqual(assertMessengerTableAllowlist(), true);
  const r = await pool.query("SELECT to_regclass('public.messenger_devices') AS devices, to_regclass('public.messenger_sync_events') AS sync");
  assert.strictEqual(r.rows[0].devices, "messenger_devices");
  assert.strictEqual(r.rows[0].sync, "messenger_sync_events");
  console.log("messenger store schema ok");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
