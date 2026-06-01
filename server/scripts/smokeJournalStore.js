const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const {
  createJournalItem,
  listJournalItems,
  countJournalBadgesForUser,
  recordJournalNotificationDelivery,
  wasJournalNotificationDelivered,
} = require("../services/journalStore");

async function main() {
  await initSchema();

  const tables = await pool.query(`
    SELECT to_regclass('public.journal_items') AS items,
           to_regclass('public.journal_comments') AS comments,
           to_regclass('public.journal_checklist_template_items') AS template,
           to_regclass('public.journal_notification_deliveries') AS deliveries
  `);
  assert.equal(tables.rows[0].items, "journal_items");
  assert.equal(tables.rows[0].comments, "journal_comments");
  assert.equal(tables.rows[0].template, null, "checklist template table should be dropped");
  assert.equal(tables.rows[0].deliveries, "journal_notification_deliveries");

  // Create a throwaway user so we work on a fresh DB (no assumption that user id=1 exists).
  const smokeUsername = `smoke-user-${Date.now()}`;
  const userRes = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'admin') RETURNING id",
    [smokeUsername]
  );
  const smokeUserId = userRes.rows[0].id;

  const clientId = `journal-smoke-${Date.now()}`;
  const stage = await pool.query(
    `WITH c AS (
       INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
       VALUES ($1, 'Journal Smoke', 'Journal Smoke', '', 0, '', 'JS', '#888')
       RETURNING id
     )
     INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status)
     SELECT id, 1, 'Stage', '', '', '', '', '', 'active' FROM c
     RETURNING id`,
    [clientId]
  );
  const stageId = stage.rows[0].id;

  const item = await createJournalItem({
    clientId,
    stageId,
    type: "task",
    title: "Smoke task",
    description: "",
    status: "open",
    dueDate: "2026-05-27",
    dueTime: "",
    assigneeUserId: null,
    isTeamTask: true,
    priority: "normal",
    createdBy: smokeUserId,
    metadata: {},
  });
  assert.ok(item.id);

  const items = await listJournalItems(clientId);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Smoke task");

  const badgeCounts = await countJournalBadgesForUser({ userId: smokeUserId, role: "admin", today: "2026-05-27" });
  assert.ok(Number(badgeCounts[clientId]) >= 1);

  const key = `smoke-${Date.now()}`;
  assert.equal(await wasJournalNotificationDelivered({ userId: smokeUserId, kind: "digest", deliveryKey: key }), false);
  await recordJournalNotificationDelivery({ userId: smokeUserId, journalItemId: null, kind: "digest", deliveryKey: key });
  assert.equal(await wasJournalNotificationDelivered({ userId: smokeUserId, kind: "digest", deliveryKey: key }), true);

  // Phase 2: assert metadata round-trips as an object (not a string) after JSONB migration.
  const itemWithMeta = await createJournalItem({
    clientId,
    stageId,
    type: "task",
    title: "Metadata smoke task",
    description: "",
    status: "open",
    dueDate: "2026-05-27",
    dueTime: "",
    assigneeUserId: null,
    isTeamTask: false,
    priority: "normal",
    createdBy: smokeUserId,
    metadata: { foo: "bar", n: 42 },
  });
  assert.ok(itemWithMeta.id, "itemWithMeta should have an id");
  assert.equal(typeof itemWithMeta.metadata, "object", "metadata should be an object, not a string");
  assert.ok(!Array.isArray(itemWithMeta.metadata), "metadata should not be an array");
  assert.deepEqual(itemWithMeta.metadata, { foo: "bar", n: 42 }, "metadata should deep-equal the written object");

  // Phase 2: assert the JSONB ->> operator (used by detection query and functional index) works.
  const itemWithLegacyId = await createJournalItem({
    clientId,
    stageId,
    type: "task",
    title: "Legacy ID smoke task",
    description: "",
    status: "open",
    dueDate: "2026-05-27",
    dueTime: "",
    assigneeUserId: null,
    isTeamTask: false,
    priority: "normal",
    createdBy: smokeUserId,
    metadata: { legacy_journal_entry_id: 987654 },
  });
  assert.ok(itemWithLegacyId.id, "itemWithLegacyId should have an id");
  const legacyIdRes = await pool.query(
    "SELECT (metadata_json->>'legacy_journal_entry_id')::int AS lid FROM journal_items WHERE id=$1",
    [itemWithLegacyId.id]
  );
  assert.equal(legacyIdRes.rows.length, 1, "should find exactly one row");
  assert.equal(legacyIdRes.rows[0].lid, 987654, "JSONB ->> should extract legacy_journal_entry_id correctly");

  // Cleanup: deleting the client cascades to journal_items, stages, etc.
  await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
  await pool.query("DELETE FROM users WHERE username = $1", [smokeUsername]);
  console.log("journal store ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => pool.end());
