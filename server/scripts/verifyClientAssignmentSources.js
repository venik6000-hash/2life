"use strict";

const assert = require("node:assert/strict");
const {
  pool,
  initSchema,
  upsertClientAssignment,
  deleteClientAssignment,
  getClientAssignment,
  replaceDoctorClientAssignments,
} = require("../services/db");

async function currentDatabaseName() {
  const r = await pool.query("SELECT current_database() AS name");
  return String(r.rows[0]?.name || "");
}

(async () => {
  const dbName = await currentDatabaseName();
  if (!dbName.includes("test")) {
    throw new Error(`Refusing to run on non-throwaway database "${dbName}" — its name must contain "test".`);
  }

  await initSchema();
  const suffix = `${Date.now()}_${process.pid}`;
  const userId = (await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'doctor') RETURNING id",
    [`assignment_source_${suffix}`]
  )).rows[0].id;
  const clientId = `assignment-source-${suffix}`;
  await pool.query(
    "INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color) VALUES ($1, 'Test', 'Test', '', 0, '', '', '')",
    [clientId]
  );

  try {
    await upsertClientAssignment(userId, clientId, 0, "manual");
    assert.equal((await getClientAssignment(userId, clientId)).assignment_source, "manual");

    await replaceDoctorClientAssignments(clientId, [userId], 0);
    assert.equal((await getClientAssignment(userId, clientId)).assignment_source, "manual_doctor");

    await deleteClientAssignment(userId, clientId);
    assert.equal((await getClientAssignment(userId, clientId)).assignment_source, "doctor");

    await upsertClientAssignment(userId, clientId, 0, "manual");
    assert.equal((await getClientAssignment(userId, clientId)).assignment_source, "manual_doctor");

    await replaceDoctorClientAssignments(clientId, [], 0);
    assert.equal((await getClientAssignment(userId, clientId)).assignment_source, "manual");

    await deleteClientAssignment(userId, clientId);
    assert.equal(await getClientAssignment(userId, clientId), null);

    await replaceDoctorClientAssignments(clientId, [userId], 0);
    assert.equal((await getClientAssignment(userId, clientId)).assignment_source, "doctor");

    const removed = await deleteClientAssignment(userId, clientId);
    assert.equal(removed.rowCount, 0);
    assert.equal((await getClientAssignment(userId, clientId)).assignment_source, "doctor");

    console.log("client assignment sources ok");
  } finally {
    await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  }
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
