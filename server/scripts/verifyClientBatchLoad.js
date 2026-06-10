/**
 * verifyClientBatchLoad.js — iteration-2 step 5 test (N+1 fix parity)
 *
 * Builds a fixture (clients → stages → categories → markers → values +
 * protocol/nutrition revisions + per-stage journal) on a THROWAWAY DB, then
 * asserts the new batched getClients()/getOneClient()/getClientsForUser()
 * return EXACTLY what the old per-row N+1 loader produced (reimplemented
 * inline below from the previous clientStore.js code).
 *
 * Usage: DATABASE_URL=<throwaway> node scripts/verifyClientBatchLoad.js
 */
"use strict";

const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const { getClients, getOneClient, getClientsForUser } = require("../services/clientStore");

// ── OLD per-row loader (verbatim logic from before the batch rewrite) ───────
const j = (v, fallback) => { try { return JSON.parse(v); } catch (_) { return fallback; } };
const jArr = (v) => j(v, []);
const jObj = (v) => j(v, {});
const normalizeInjectionSchedule = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { startDate: "", phases: [] };
  }
  return {
    ...value,
    startDate: typeof value.startDate === "string" ? value.startDate : "",
    phases: Array.isArray(value.phases) ? value.phases : []
  };
};

const oldReadAnalytics = async (clientId) => {
  const cats = (await pool.query("SELECT * FROM analytics_categories WHERE client_id = $1 ORDER BY sort_order", [clientId])).rows;
  const result = [];
  for (const cat of cats) {
    const markers = (await pool.query("SELECT * FROM analytics_markers WHERE category_id = $1 ORDER BY sort_order", [cat.id])).rows;
    const markerResults = [];
    for (const m of markers) {
      const values = (await pool.query("SELECT * FROM analytics_values WHERE marker_id = $1 ORDER BY id", [m.id])).rows;
      markerResults.push({
        name: m.name, unit: m.unit, refMin: m.ref_min, refMax: m.ref_max, optimal: m.optimal,
        values: values.map(v => {
          const entry = { date: v.date, value: v.value };
          if (v.flag_off) entry.flagOff = true;
          return entry;
        })
      });
    }
    result.push({ name: cat.name, markers: markerResults });
  }
  return result;
};

const oldReadStages = async (clientId, analyticsCategories) => {
  const rows = (await pool.query("SELECT * FROM stages WHERE client_id = $1 ORDER BY stage_num", [clientId])).rows;
  const stages = [];
  for (const row of rows) {
    const prRows = (await pool.query("SELECT * FROM protocol_revisions WHERE stage_id = $1 ORDER BY revision_num", [row.id])).rows;
    const nrRows = (await pool.query("SELECT * FROM nutrition_revisions WHERE stage_id = $1 ORDER BY revision_num", [row.id])).rows;
    const jRows = (await pool.query("SELECT * FROM journal_entries WHERE stage_id = $1 ORDER BY entry_num", [row.id])).rows;
    stages.push({
      id: row.stage_num, title: row.title, subtitle: row.subtitle, doctor: row.doctor, doctorRole: row.doctor_role,
      dateStart: row.date_start, dateEnd: row.date_end, status: row.status, email: row.email, phone: row.phone,
      city: row.city, height: row.height, weightCurrent: row.weight_current, weightGoal: row.weight_goal,
      bmi: row.bmi, waist: row.waist,
      tasks: jArr(row.tasks_json), syndromes: jArr(row.syndromes_json), diagnoses: jArr(row.diagnoses_json),
      deficits: jArr(row.deficits_json), autoDeficitSelection: jArr(row.auto_deficit_selection_json),
      labOrderSelected: jObj(row.lab_order_selected_json), labOrderGroupOrder: jArr(row.lab_order_group_order_json),
      nutrition: jObj(row.nutrition_json), injections: jArr(row.injections_json),
      injectionSchedule: normalizeInjectionSchedule(jObj(row.injection_schedule_json)),
      questionnaire: jObj(row.questionnaire_json),
      protocolRevisions: prRows.map(pr => ({ id: pr.revision_num, date: pr.date, label: pr.label, groups: jArr(pr.groups_json) })),
      nutritionRevisions: nrRows.map(nr => {
        const data = jObj(nr.data_json);
        return Object.assign({ id: nr.revision_num, date: nr.date, label: nr.label, comment: nr.comment }, data);
      }),
      journal: jRows.map(je => ({ date: je.date, type: je.type, text: je.text, author: je.author })),
      analyticsCategories
    });
  }
  return stages;
};

const oldGetClients = async () => {
  const r = await pool.query("SELECT * FROM clients ORDER BY id");
  const clients = [];
  for (const row of r.rows) {
    const analyticsCategories = await oldReadAnalytics(row.id);
    const stages = await oldReadStages(row.id, analyticsCategories);
    clients.push({
      id: row.id, name: row.name, shortName: row.short_name, dob: row.dob, age: row.age,
      sex: row.sex, avatar: row.avatar, color: row.color, stages
    });
  }
  return clients;
};

// ── fixture ──────────────────────────────────────────────────────────────────
const seed = async () => {
  await pool.query(`INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color) VALUES
    ('c1','Клиент Один','К1','01.01.1980',45,'м','А','#f00'),
    ('c2','Клиент Два','К2','02.02.1990',36,'ж','Б','#0f0'),
    ('c3','Клиент Три','К3','',0,'','','')
    ON CONFLICT DO NOTHING`);

  // c1: 2 stages with revisions/journal; c2: 1 stage bare; c3: none
  const st = async (clientId, num, title) => (await pool.query(
    `INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status, email, phone, city, height, weight_current, weight_goal, bmi, waist,
      tasks_json, syndromes_json, diagnoses_json, deficits_json, auto_deficit_selection_json, lab_order_selected_json, lab_order_group_order_json, nutrition_json, injections_json, injection_schedule_json, questionnaire_json)
     VALUES ($1,$2,$3,'sub','Доктор А','врач','01.01.2026','','active','e@e','7','М','170','80','70','27','90',
      '["t1"]','["s1"]','["d1"]','[]','[]','{}','[]','{"cal":1800}','[]','{"startDate":"01.02.2026","phases":[]}','{"q1":"a1"}')
     RETURNING id`, [clientId, num, title])).rows[0].id;

  const s1 = await st('c1', 1, 'Этап 1');
  const s2 = await st('c1', 2, 'Этап 2');
  const s3 = await st('c2', 1, 'Этап X');

  await pool.query(`INSERT INTO protocol_revisions (stage_id, revision_num, date, label, groups_json) VALUES
    ($1,1,'01.01','v1','[{"g":1}]'), ($1,2,'02.01','v2','[{"g":2}]'), ($2,1,'03.01','v1','[]')`, [s1, s2]);
  await pool.query(`INSERT INTO nutrition_revisions (stage_id, revision_num, date, label, comment, data_json) VALUES
    ($1,1,'01.01','n1','c1','{"cal":1500}'), ($2,1,'02.01','n1','','{}')`, [s1, s3]);
  await pool.query(`INSERT INTO journal_entries (client_id, stage_id, entry_num, date, type, text, author) VALUES
    ('c1',$1,1,'01.01','note','запись 1','Док'), ('c1',$1,2,'02.01','note','запись 2','Док'), ('c2',$2,1,'03.01','note','зап','Док')`, [s1, s3]);

  // analytics: c1 two categories (2 markers / 1 marker), values incl. flag_off
  const cat = async (clientId, name, ord) => (await pool.query(
    "INSERT INTO analytics_categories (client_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id", [clientId, name, ord])).rows[0].id;
  const mk = async (catId, name, ord) => (await pool.query(
    "INSERT INTO analytics_markers (category_id, name, unit, ref_min, ref_max, optimal, sort_order) VALUES ($1,$2,'ед','1','9','5',$3) RETURNING id", [catId, name, ord])).rows[0].id;

  const c1cat1 = await cat('c1', 'Кровь', 0);
  const c1cat2 = await cat('c1', 'Гормоны', 1);
  const c2cat1 = await cat('c2', 'Кровь', 0);
  const m1 = await mk(c1cat1, 'Гемоглобин', 0);
  const m2 = await mk(c1cat1, 'Ферритин', 1);
  const m3 = await mk(c1cat2, 'ТТГ', 0);
  const m4 = await mk(c2cat1, 'Гемоглобин', 0);
  await pool.query(`INSERT INTO analytics_values (marker_id, date, value, flag_off) VALUES
    ($1,'01.01','140',false), ($1,'02.01','143',true), ($2,'01.01','30',false), ($3,'01.01','2.1',false), ($4,'05.01','120',false)`, [m1, m2, m3, m4]);

  // assignment for getClientsForUser test
  await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('doc_batch','x','doctor') ON CONFLICT DO NOTHING");
  const docId = (await pool.query("SELECT id FROM users WHERE username='doc_batch'")).rows[0].id;
  await pool.query("INSERT INTO client_assignments (user_id, client_id, assigned_by, assignment_source) VALUES ($1,'c2',0,'manual') ON CONFLICT DO NOTHING", [docId]);
  return docId;
};

(async () => {
  const dbNameRes = await pool.query("SELECT current_database() AS db");
  if (!/test|ttest|throwaway/i.test(dbNameRes.rows[0].db)) {
    console.error(`REFUSING to run on non-throwaway DB '${dbNameRes.rows[0].db}'`);
    process.exit(2);
  }

  await initSchema();
  const docId = await seed();

  const [oldAll, newAll] = [await oldGetClients(), await getClients()];
  assert.equal(newAll.length, 3, "3 clients expected");
  assert.deepEqual(newAll, oldAll, "batched getClients must equal old N+1 loader output");
  console.log("✓ getClients: batched output identical to old per-row loader (3 clients, stages+analytics+revisions+journal)");

  const one = await getOneClient('c1');
  assert.deepEqual(one, oldAll.find(c => c.id === 'c1'), "getOneClient must equal old output");
  assert.equal(await getOneClient('no_such'), null, "missing client → null");
  console.log("✓ getOneClient: identical + null for missing");

  // Duplication contract (deliberately kept): every stage carries the SAME
  // analyticsCategories array as the client's analytics.
  assert.equal(one.stages.length, 2);
  assert.deepEqual(one.stages[0].analyticsCategories, one.stages[1].analyticsCategories);
  assert.equal(one.stages[0].analyticsCategories.length, 2);
  console.log("✓ analyticsCategories duplication in stages preserved (intentional contract)");

  const forUser = await getClientsForUser(docId, 'doctor');
  assert.deepEqual(forUser.map(c => c.id), ['c2'], "assigned-only filtering must hold");
  assert.deepEqual(forUser[0], oldAll.find(c => c.id === 'c2'));
  console.log("✓ getClientsForUser: assignment filtering + identical payload");

  console.log("\nALL CLIENT BATCH-LOAD PARITY TESTS PASSED");
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
