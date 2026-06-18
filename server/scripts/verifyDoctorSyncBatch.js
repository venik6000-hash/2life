/**
 * verifyDoctorSyncBatch.js — iteration-4 item 7
 *
 * syncDoctorAssignmentsForAllClients() used to call getClients() (a full
 * buildClientsBatch for every client) and getDoctorByName() once per doctor name
 * per client (N+1). It now uses three flat queries + in-memory maps. This is a
 * BEHAVIOR-PARITY test: the derived assignments it produces must be unchanged.
 *
 * Covers: exact-name match, case-insensitive match, a doctor with no linked
 * user (no assignment), a stale doctor-derived assignment cleared when the
 * client has no doctor stage, and a manual assignment left untouched.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyDoctorSyncBatch.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { syncDoctorAssignmentsForAllClients } = require("../routes/doctors");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  const mkUser = async (name, role) => (await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1,'x',$2) RETURNING id", [name, role])).rows[0].id;
  const admin = await mkUser("s7_admin", "admin");
  const ivanov = await mkUser("s7_ivanov", "doctor");
  const petrov = await mkUser("s7_petrov", "doctor");
  const other = await mkUser("s7_other", "doctor");

  // Registry: Иванов→ivanov, Петров→petrov, Сидоров→(unlinked).
  await pool.query(
    "INSERT INTO doctors (name, role, user_id) VALUES ('Иванов','Кардиолог',$1),('Петров','Невролог',$2),('Сидоров','Терапевт',NULL)",
    [ivanov, petrov]);

  const mkClient = (id) => pool.query("INSERT INTO clients (id, name) VALUES ($1,$1) ON CONFLICT DO NOTHING", [id]);
  for (const id of ["c1", "c2", "c3", "c4"]) await mkClient(id);
  const mkStage = (cid, doctor) => pool.query("INSERT INTO stages (client_id, stage_num, doctor) VALUES ($1,1,$2)", [cid, doctor]);
  await mkStage("c1", "Иванов");   // exact match
  await mkStage("c2", "ПЕТРОВ");   // uppercase → must still match Петров
  await mkStage("c3", "Сидоров");  // doctor exists but has no linked user
  // c4: no doctor stage, but a STALE doctor-derived assignment that must be cleared.
  await pool.query("INSERT INTO client_assignments (user_id, client_id, assignment_source) VALUES ($1,'c4','doctor')", [ivanov]);
  // A MANUAL assignment on c1 that must survive the doctor sync.
  await pool.query("INSERT INTO client_assignments (user_id, client_id, assignment_source) VALUES ($1,'c1','manual')", [other]);

  await syncDoctorAssignmentsForAllClients(admin);

  const usersFor = async (clientId, source) => {
    const r = await pool.query(
      "SELECT user_id FROM client_assignments WHERE client_id=$1 AND assignment_source=$2 ORDER BY user_id",
      [clientId, source]);
    return r.rows.map((x) => x.user_id);
  };

  assert.deepEqual(await usersFor("c1", "doctor"), [ivanov], "c1 derived → Иванов (exact)");
  assert.deepEqual(await usersFor("c2", "doctor"), [petrov], "c2 derived → Петров (case-insensitive ПЕТРОВ)");
  assert.deepEqual(await usersFor("c3", "doctor"), [], "c3 → none (Сидоров has no linked user)");
  assert.deepEqual(await usersFor("c4", "doctor"), [], "c4 stale derived assignment cleared (no doctor stage)");
  assert.deepEqual(await usersFor("c1", "manual"), [other], "manual assignment untouched by doctor sync");
  console.log("✓ batched doctor-sync reproduces exact assignment behavior");

  // Idempotent: a second run changes nothing.
  await syncDoctorAssignmentsForAllClients(admin);
  assert.deepEqual(await usersFor("c1", "doctor"), [ivanov], "c1 stable after re-run");
  assert.deepEqual(await usersFor("c2", "doctor"), [petrov], "c2 stable after re-run");
  assert.deepEqual(await usersFor("c4", "doctor"), [], "c4 stays cleared after re-run");
  console.log("✓ re-run is idempotent");

  console.log("\nALL DOCTOR-SYNC-BATCH TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
