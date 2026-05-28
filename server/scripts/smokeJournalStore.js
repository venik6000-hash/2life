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
    createdBy: 1,
    metadata: {},
  });
  assert.ok(item.id);

  const items = await listJournalItems(clientId);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Smoke task");

  const badgeCounts = await countJournalBadgesForUser({ userId: 1, role: "admin", today: "2026-05-27" });
  assert.ok(Number(badgeCounts[clientId]) >= 1);

  const key = `smoke-${Date.now()}`;
  assert.equal(await wasJournalNotificationDelivered({ userId: 1, kind: "digest", deliveryKey: key }), false);
  await recordJournalNotificationDelivery({ userId: 1, journalItemId: null, kind: "digest", deliveryKey: key });
  assert.equal(await wasJournalNotificationDelivered({ userId: 1, kind: "digest", deliveryKey: key }), true);

  await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
  console.log("journal store ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => pool.end());
