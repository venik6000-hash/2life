/**
 * verifyClientCreateRace.js — iteration-4 item 2
 *
 * The PUT /clients/:id create path used to do getOneClient() (existence check,
 * no lock) and then saveOneClient() (INSERT ... ON CONFLICT DO UPDATE). Two
 * concurrent "creators" of the same id both saw null and both wrote — the loser
 * silently overwrote the winner (or a pre-existing client it had no access to).
 *
 * createOneClientExclusive() claims the id atomically. This verifies:
 *   1. A brand-new id → { created: true } and stages/journal are written.
 *   2. Two concurrent creates of the SAME id → exactly one { created: true },
 *      one { created: false }, and the stored row is the WINNER's data
 *      (the loser does NOT overwrite it).
 *   3. createOneClientExclusive on an already-existing id → { created: false }
 *      and the existing row is untouched.
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyClientCreateRace.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { createOneClientExclusive, getOneClient } = require("../services/clientStore");

(async () => {
  const dbName = (await pool.query("SELECT current_database() AS db")).rows[0].db;
  if (!/test|ttest|throwaway/i.test(dbName)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbName}'`);
    process.exit(2);
  }
  await initSchema();

  // 1. Brand-new id creates and writes its stages.
  const fresh = {
    id: "race_new", name: "Fresh Client", shortName: "Fresh", dob: "1990-01-01",
    age: 35, sex: "м", avatar: "", color: "#fff",
    stages: [{ id: 1, title: "Этап 1", doctor: "Иванов" }],
  };
  const r1 = await createOneClientExclusive(fresh);
  assert.equal(r1.created, true, "brand-new id must create");
  const stored1 = await getOneClient("race_new");
  assert.ok(stored1, "created client must be readable");
  assert.equal(stored1.name, "Fresh Client", "created client keeps its name");
  assert.equal(stored1.stages.length, 1, "stages must be written by createOneClientExclusive");
  assert.equal(stored1.stages[0].title, "Этап 1", "stage data must persist");
  console.log("✓ new id creates + writes stages");

  // 2. Two concurrent creates of the SAME id — only one wins, loser must NOT overwrite.
  const winner = { id: "race_dup", name: "WINNER", shortName: "W", dob: "", age: 1, sex: "", avatar: "", color: "", stages: [] };
  const loser  = { id: "race_dup", name: "LOSER",  shortName: "L", dob: "", age: 2, sex: "", avatar: "", color: "", stages: [] };
  const [a, b] = await Promise.all([
    createOneClientExclusive(winner),
    createOneClientExclusive(loser),
  ]);
  const createdFlags = [a.created, b.created].sort();
  assert.deepEqual(createdFlags, [false, true], "exactly one concurrent create succeeds");
  const storedDup = await getOneClient("race_dup");
  // Whichever call won, the stored name must equal that winner — never a blend,
  // never the loser overwriting the winner.
  const winnerName = a.created ? "WINNER" : "LOSER";
  assert.equal(storedDup.name, winnerName, "stored row is the create-race winner, not overwritten by the loser");
  console.log("✓ concurrent same-id create: one winner, loser rejected (no overwrite)");

  // 3. Re-create over an existing id is rejected and leaves the row untouched.
  const intruder = { id: "race_dup", name: "INTRUDER", shortName: "X", dob: "", age: 9, sex: "", avatar: "", color: "", stages: [] };
  const r3 = await createOneClientExclusive(intruder);
  assert.equal(r3.created, false, "create over existing id must be rejected");
  const stillWinner = await getOneClient("race_dup");
  assert.equal(stillWinner.name, winnerName, "existing row must be untouched by a rejected create");
  console.log("✓ create over existing id rejected, row untouched");

  console.log("\nALL CLIENT-CREATE-RACE TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
