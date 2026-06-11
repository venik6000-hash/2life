/**
 * verifyJournalReminderPerms.js — iteration-3 task 1
 *
 * Exact-time journal reminders must honor journal.read/write (like the digest
 * already does) and must never target client (is_client) roles.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyJournalReminderPerms.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { listDueJournalReminders, listUsersForJournalDigest } = require("../services/journalStore");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  // Roles: with journal.read / without journal access / client role WITH read
  const mkRole = async (name, canRead, isClient) => {
    const r = await pool.query(
      `INSERT INTO roles (name, display_name, is_system, is_client)
       VALUES ($1, $1, false, $2)
       ON CONFLICT (name) DO UPDATE SET is_client = $2
       RETURNING id`,
      [name, isClient]
    );
    if (canRead != null) {
      await pool.query(
        `INSERT INTO role_sections (role_id, section_id, can_read, can_write)
         VALUES ($1, 'journal', $2, false)
         ON CONFLICT (role_id, section_id) DO UPDATE SET can_read = $2`,
        [r.rows[0].id, canRead]
      );
    }
    return r.rows[0].id;
  };
  await mkRole("t3_with_journal", true, false);
  await mkRole("t3_no_journal", null, false);
  await mkRole("t3_clientish", true, true);

  const mkUser = async (name, role) => (await pool.query(
    `INSERT INTO users (username, password_hash, role, active) VALUES ($1, 'x', $2, true) RETURNING id`,
    [name, role]
  )).rows[0].id;
  const uYes = await mkUser("t3_u_yes", "t3_with_journal");
  const uNo = await mkUser("t3_u_no", "t3_no_journal");
  const uClient = await mkUser("t3_u_client", "t3_clientish");
  const uAdmin = await mkUser("t3_u_admin", "admin");

  await pool.query(`INSERT INTO clients (id, name) VALUES ('t3c', 'T3 Client') ON CONFLICT (id) DO NOTHING`);
  for (const uid of [uYes, uNo, uClient]) {
    await pool.query(
      `INSERT INTO client_assignments (user_id, client_id) VALUES ($1, 't3c') ON CONFLICT DO NOTHING`,
      [uid]
    );
  }
  await pool.query(
    `INSERT INTO journal_items (client_id, type, title, status, is_team_task, due_date, due_time)
     VALUES ('t3c', 'task', 't3 task', 'open', true, '2020-01-01', '09:00')`
  );

  const due = await listDueJournalReminders("2020-01-02T00:00:00");
  const dueUsers = new Set(due.map((r) => r.user_id));
  assert.equal(dueUsers.has(uYes), true, "user WITH journal.read must get the reminder");
  assert.equal(dueUsers.has(uNo), false, "user WITHOUT journal access must NOT get the reminder");
  assert.equal(dueUsers.has(uClient), false, "client-role user must NOT get the reminder");
  assert.equal(dueUsers.has(uAdmin), true, "admin must get the reminder even without a role_sections row");
  console.log("✓ exact reminders honor journal.read, include admin, skip client roles");

  const digest = await listUsersForJournalDigest("2020-01-02");
  const digestUsers = new Set(digest.map((r) => r.id));
  assert.equal(digestUsers.has(uYes), true, "digest keeps user with journal.read");
  assert.equal(digestUsers.has(uNo), false, "digest must skip user without journal access");
  assert.equal(digestUsers.has(uClient), false, "digest must skip client roles");
  assert.equal(digestUsers.has(uAdmin), true, "digest must include admin even without a role_sections row");
  console.log("✓ digest honors journal.read, includes admin, skips client roles");

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
