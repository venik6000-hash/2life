/**
 * verifyMessengerReadDelivery.js — iteration-3 task 2
 *
 * Push (and WS chat-payload) recipients must be filtered by messenger.read:
 * disabling the messenger section for a role must stop deliveries, not just
 * REST access. Admin always passes; inactive users never do.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyMessengerReadDelivery.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { filterMessengerReadUserIds } = require("../services/messengerPush");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  const mkRole = async (name, read) => {
    const r = await pool.query(
      `INSERT INTO roles (name, display_name) VALUES ($1, $1)
       ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING id`,
      [name]
    );
    await pool.query(
      `INSERT INTO role_sections (role_id, section_id, can_read, can_write)
       VALUES ($1, 'messenger', $2, $2)
       ON CONFLICT (role_id, section_id) DO UPDATE SET can_read = $2, can_write = $2`,
      [r.rows[0].id, read]
    );
  };
  await mkRole("t3m_reader", true);
  await mkRole("t3m_muted", false);

  const mkUser = async (name, role, active = true) => (await pool.query(
    `INSERT INTO users (username, password_hash, role, active) VALUES ($1, 'x', $2, $3) RETURNING id`,
    [name, role, active]
  )).rows[0].id;
  const reader = await mkUser("t3m_reader_u", "t3m_reader");
  const muted = await mkUser("t3m_muted_u", "t3m_muted");
  const admin = await mkUser("t3m_admin_u", "admin");
  const inactive = await mkUser("t3m_off_u", "t3m_reader", false);

  const got = await filterMessengerReadUserIds([reader, muted, admin, inactive, 999999]);
  assert.deepEqual(
    new Set(got),
    new Set([reader, admin]),
    "only active users whose role has messenger.read (or admin) survive the filter"
  );
  console.log("✓ push recipient filter honors messenger.read (admin bypass, inactive dropped)");

  // The WS gate uses the same permission source — assert it is wired in.
  const fs = require("node:fs");
  const wsSrc = fs.readFileSync(require.resolve("../services/ws.js"), "utf8");
  assert.match(wsSrc, /canRoleReadMessenger/, "ws.js must define the messenger.read gate");
  assert.match(wsSrc, /sendChatPayloadTo\(p\.user_id, payload\)/, "broadcastToChat must use the gated sender");
  console.log("✓ WS broadcastToChat delivers through the messenger.read gate");

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
