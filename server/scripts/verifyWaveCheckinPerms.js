const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { canAccessClient } = require("../services/clientAccess");
const store = require("../services/waveStore");

async function main() {
  await initSchema();
  await pool.query("INSERT INTO roles (name, is_client) VALUES ('viewer', true) ON CONFLICT (name) DO UPDATE SET is_client=true");
  await pool.query(`INSERT INTO role_sections (role_id, section_id, can_read, can_write)
    SELECT id,'wave',true,true FROM roles WHERE name='viewer'
    ON CONFLICT (role_id, section_id) DO UPDATE SET can_read=true, can_write=true`);

  const s = Date.now();
  const clientA = `wave-perm-A-${s}`, clientB = `wave-perm-B-${s}`;
  for (const id of [clientA, clientB])
    await pool.query("INSERT INTO clients (id,name,short_name,dob,age,sex,avatar,color) VALUES ($1,'t','t','',0,'','','')", [id]);
  const u = await pool.query("INSERT INTO users (username,password_hash,role,active,all_clients_access) VALUES ($1,'x','viewer',true,false) RETURNING id", [`wave-perm-u-${s}`]);
  const userId = u.rows[0].id;
  await pool.query("INSERT INTO client_assignments (user_id, client_id, assigned_by) VALUES ($1,$2,0)", [userId, clientA]);

  const clientUser = { id: userId, role: "viewer" };
  assert.equal(await canAccessClient(clientUser, clientA), true, "own assigned client");
  assert.equal(await canAccessClient(clientUser, clientB), false, "NOT another client");

  const today = new Date().toISOString().slice(0, 10);
  const due = await store.listDueWaveCheckinReminders(today);
  assert.ok(due.some((d) => d.user_id === userId && d.client_id === clientA), "assigned client-user is due");
  await store.upsertCheckin({ clientId: clientA, userId, date: today, scores: { energy: 4, sleep: 4, mood: 4, focus: 4, calm: 4 } });
  const due2 = await store.listDueWaveCheckinReminders(today);
  assert.ok(!due2.some((d) => d.user_id === userId), "checked-in client-user is not due");

  await pool.query("DELETE FROM clients WHERE id = ANY($1)", [[clientA, clientB]]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  console.log("wave checkin perms ok");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
