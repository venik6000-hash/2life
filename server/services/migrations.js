const { pool } = require("./db");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

async function isApplied(id) {
  const r = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1 LIMIT 1", [id]);
  return r.rowCount > 0;
}

// Runs `fn` once, ever. `fn` receives a dedicated client inside a transaction.
// Records the id only if fn succeeds. Throws on failure (caller decides fatality).
async function runOnce(id, fn) {
  if (await isApplied(id)) return { id, ran: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
    await client.query("COMMIT");
    return { id, ran: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureMigrationsTable, isApplied, runOnce };
