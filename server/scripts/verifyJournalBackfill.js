const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { backfillLegacyJournalEntries, listJournalItems } = require("../services/journalStore");

async function main() {
  await initSchema();
  const clientId = `journal-backfill-${Date.now()}`;
  const stageRes = await pool.query(
    `WITH c AS (
       INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
       VALUES ($1, 'Backfill Client', 'Backfill Client', '', 0, '', 'BC', '#999')
       RETURNING id
     )
     INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status)
     SELECT id, 1, 'Stage', '', '', '', '', '', 'active' FROM c
     RETURNING id`,
    [clientId]
  );
  const stageId = stageRes.rows[0].id;
  await pool.query(
    "INSERT INTO journal_entries (client_id, stage_id, entry_num, date, type, text, author) VALUES ($1,$2,0,'27.05.2026','Созвон','Обсудили анализы','Врач')",
    [clientId, stageId]
  );

  const first = await backfillLegacyJournalEntries();
  const second = await backfillLegacyJournalEntries();
  assert.ok(first.migrated >= 1);
  assert.equal(second.migrated, 0, "backfill must be idempotent");

  const items = await listJournalItems(clientId);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "note");
  assert.equal(items[0].description, "Обсудили анализы");
  assert.equal(items[0].metadata.legacy_type, "Созвон");
  assert.equal(items[0].metadata.legacy_author, "Врач");

  // Regression guard: ids whose numeric form is a prefix of an already-migrated id
  // must not be falsely skipped by the idempotency check.
  await pool.query(
    "INSERT INTO journal_entries (client_id, stage_id, entry_num, date, type, text, author) VALUES ($1,$2,1,'27.05.2026','Заметка','Префикс','Врач')",
    [clientId, stageId]
  );
  const third = await backfillLegacyJournalEntries();
  assert.ok(third.migrated >= 1, "prefix-id legacy entry must be migrated");
  const itemsAfter = await listJournalItems(clientId);
  assert.equal(itemsAfter.length, 2, "both legacy entries must be present");

  await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
  console.log("journal backfill ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => pool.end());
