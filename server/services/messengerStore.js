const { pool } = require("./db");

async function createSyncEvent(db, { chatId = null, userId = null, eventType, payload = {} }) {
  const r = await db.query(
    `INSERT INTO messenger_sync_events (chat_id, user_id, event_type, payload)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [chatId, userId, eventType, payload]
  );
  return r.rows[0];
}

async function listSyncEventsForUser(userId, afterId = 0, limit = 200) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const r = await pool.query(
    `SELECT e.*
     FROM messenger_sync_events e
     LEFT JOIN chat_participants cp ON cp.chat_id = e.chat_id AND cp.user_id = $1
     WHERE e.id > $2 AND (e.user_id = $1 OR cp.user_id = $1)
     ORDER BY e.id ASC
     LIMIT $3`,
    [userId, Number(afterId) || 0, safeLimit]
  );
  return r.rows;
}

async function upsertMessengerDevice(userId, device) {
  const r = await pool.query(
    `INSERT INTO messenger_devices (user_id, device_id, endpoint, p256dh, auth, user_agent, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, device_id) DO UPDATE
       SET endpoint = EXCLUDED.endpoint,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           last_seen_at = NOW()
     RETURNING *`,
    [userId, device.deviceId, device.endpoint || "", device.p256dh || "", device.auth || "", device.userAgent || ""]
  );
  return r.rows[0];
}

async function removeMessengerDevice(userId, deviceId) {
  await pool.query("DELETE FROM messenger_devices WHERE user_id = $1 AND device_id = $2", [userId, deviceId]);
}

const listMessengerDevicesForUser = async (pool, userId) => {
  const r = await pool.query(
    `SELECT id, device_id, user_agent, last_seen_at, created_at
       FROM messenger_devices
      WHERE user_id = $1
      ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );
  return r.rows;
};

async function listPushDevicesForUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const r = await pool.query(
    `SELECT * FROM messenger_devices
     WHERE user_id = ANY($1::int[]) AND endpoint <> '' AND p256dh <> '' AND auth <> ''`,
    [userIds]
  );
  return r.rows;
}

module.exports = {
  createSyncEvent,
  listSyncEventsForUser,
  upsertMessengerDevice,
  removeMessengerDevice,
  listPushDevicesForUsers,
  listMessengerDevicesForUser,
};
