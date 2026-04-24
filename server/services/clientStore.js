const {
  pool,
  insertClient, deleteClient, getClientById,
  insertStage, deleteStagesByClient, getStagesByClient,
  insertAnalyticsCategory, insertAnalyticsMarker, insertAnalyticsValue,
  deleteAnalyticsByClient, getCategoriesByClient, getMarkersByCategory, getValuesByMarker,
  insertJournalEntry, deleteJournalByClient, getJournalByStage,
  insertProtocolRevision, deleteProtocolByStage, getProtocolByStage,
  insertNutritionRevision, deleteNutritionByStage, getNutritionByStage,
  insertDoctor, listDoctors,
  getAssignmentsByUser, hasAllClientsAccess
} = require("./db");

// ─── Helpers ────────────────────────────────────────────────────────────────

const j  = (v, fallback) => { try { return JSON.parse(v); } catch (_) { return fallback; } };
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
const toStr  = (v) => (v == null ? "" : String(v));
const toReal = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const toInt  = (v) => { const n = parseInt(v, 10); return isFinite(n) ? n : 0; };

// ─── Read (PostgreSQL → JS objects) ─────────────────────────────────────────

const readAnalyticsForClient = async (clientId) => {
  const cats = await getCategoriesByClient(clientId);
  const result = [];
  for (const cat of cats) {
    const markers = await getMarkersByCategory(cat.id);
    const markerResults = [];
    for (const m of markers) {
      const values = await getValuesByMarker(m.id);
      markerResults.push({
        name:    m.name,
        unit:    m.unit,
        refMin:  m.ref_min,
        refMax:  m.ref_max,
        optimal: m.optimal,
        values:  values.map(v => {
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

const readStagesForClient = async (clientId, analyticsCategories) => {
  const rows = await getStagesByClient(clientId);
  const stages = [];
  for (const row of rows) {
    const stageDbId = row.id;

    // Protocol revisions
    const prRows = await getProtocolByStage(stageDbId);
    const protocolRevisions = prRows.map(pr => ({
      id:     pr.revision_num,
      date:   pr.date,
      label:  pr.label,
      groups: jArr(pr.groups_json)
    }));

    // Nutrition revisions
    const nrRows = await getNutritionByStage(stageDbId);
    const nutritionRevisions = nrRows.map(nr => {
      const data = jObj(nr.data_json);
      return Object.assign({ id: nr.revision_num, date: nr.date, label: nr.label, comment: nr.comment }, data);
    });

    // Journal for this stage
    const jRows = await getJournalByStage(stageDbId);
    const journal = jRows.map(je => ({
      date:   je.date,
      type:   je.type,
      text:   je.text,
      author: je.author
    }));

    stages.push({
      id:                   row.stage_num,
      title:                row.title,
      subtitle:             row.subtitle,
      doctor:               row.doctor,
      doctorRole:           row.doctor_role,
      dateStart:            row.date_start,
      dateEnd:              row.date_end,
      status:               row.status,
      email:                row.email,
      phone:                row.phone,
      city:                 row.city,
      height:               row.height,
      weightCurrent:        row.weight_current,
      weightGoal:           row.weight_goal,
      bmi:                  row.bmi,
      waist:                row.waist,
      tasks:                jArr(row.tasks_json),
      syndromes:            jArr(row.syndromes_json),
      diagnoses:            jArr(row.diagnoses_json),
      deficits:             jArr(row.deficits_json),
      autoDeficitSelection: jArr(row.auto_deficit_selection_json),
      labOrderSelected:     jObj(row.lab_order_selected_json),
      labOrderGroupOrder:   jArr(row.lab_order_group_order_json),
      nutrition:            jObj(row.nutrition_json),
      injections:           jArr(row.injections_json),
      injectionSchedule:    normalizeInjectionSchedule(jObj(row.injection_schedule_json)),
      questionnaire:        jObj(row.questionnaire_json),
      protocolRevisions:    protocolRevisions,
      nutritionRevisions:   nutritionRevisions,
      journal:              journal,
      analyticsCategories:  analyticsCategories
    });
  }
  return stages;
};

const rowToClient = async (row) => {
  const analyticsCategories = await readAnalyticsForClient(row.id);
  const stages = await readStagesForClient(row.id, analyticsCategories);
  return {
    id:        row.id,
    name:      row.name,
    shortName: row.short_name,
    dob:       row.dob,
    age:       row.age,
    sex:       row.sex,
    avatar:    row.avatar,
    color:     row.color,
    stages:    stages
  };
};

const getClients = async () => {
  const r = await pool.query("SELECT * FROM clients ORDER BY id");
  const clients = [];
  for (const row of r.rows) {
    clients.push(await rowToClient(row));
  }
  return clients;
};

const getOneClient = async (clientId) => {
  const row = await getClientById(clientId);
  if (!row) return null;
  return rowToClient(row);
};

const getClientsForUser = async (userId, role) => {
  if (role === "admin" || await hasAllClientsAccess(userId)) return getClients();
  const assignedRows = await getAssignmentsByUser(userId);
  const assignedIds = new Set(assignedRows.map(r => r.client_id));
  const r = await pool.query("SELECT * FROM clients ORDER BY id");
  const clients = [];
  for (const row of r.rows) {
    if (assignedIds.has(row.id)) {
      clients.push(await rowToClient(row));
    }
  }
  return clients;
};

// ─── Write (JS objects → PostgreSQL) ────────────────────────────────────────

// Core per-client write logic using a pg client for transaction
const _writeOneClient = async (client, pgClient) => {
  const q = pgClient.query.bind(pgClient);
  const clientId = toStr(client.id);

  await q(
    `INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET name=$2, short_name=$3, dob=$4, age=$5, sex=$6, avatar=$7, color=$8`,
    [clientId, toStr(client.name), toStr(client.shortName), toStr(client.dob), toInt(client.age), toStr(client.sex), toStr(client.avatar), toStr(client.color)]
  );

  // Delete existing stages and journal — analytics are managed separately via saveAnalyticsForClient
  await q("DELETE FROM stages WHERE client_id = $1", [clientId]);
  await q("DELETE FROM journal_entries WHERE client_id = $1", [clientId]);

  const stages = Array.isArray(client.stages) ? client.stages : [];

  // Insert stages
  for (const stage of stages) {
    const stageNum = toInt(stage.id);

    await q(
      `INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status, email, phone, city, height, weight_current, weight_goal, bmi, waist, tasks_json, syndromes_json, diagnoses_json, deficits_json, auto_deficit_selection_json, lab_order_selected_json, lab_order_group_order_json, nutrition_json, injections_json, injection_schedule_json, questionnaire_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
      [
        clientId,
        stageNum,
        toStr(stage.title),
        toStr(stage.subtitle),
        toStr(stage.doctor),
        toStr(stage.doctorRole),
        toStr(stage.dateStart),
        toStr(stage.dateEnd),
        toStr(stage.status) || "active",
        toStr(stage.email),
        toStr(stage.phone),
        toStr(stage.city),
        toReal(stage.height),
        toReal(stage.weightCurrent),
        toReal(stage.weightGoal),
        toReal(stage.bmi),
        toReal(stage.waist),
        JSON.stringify(Array.isArray(stage.tasks) ? stage.tasks : []),
        JSON.stringify(Array.isArray(stage.syndromes) ? stage.syndromes : []),
        JSON.stringify(Array.isArray(stage.diagnoses) ? stage.diagnoses : []),
        JSON.stringify(Array.isArray(stage.deficits) ? stage.deficits : []),
        JSON.stringify(Array.isArray(stage.autoDeficitSelection) ? stage.autoDeficitSelection : []),
        JSON.stringify(stage.labOrderSelected && typeof stage.labOrderSelected === "object" ? stage.labOrderSelected : {}),
        JSON.stringify(Array.isArray(stage.labOrderGroupOrder) ? stage.labOrderGroupOrder : []),
        JSON.stringify(stage.nutrition && typeof stage.nutrition === "object" ? stage.nutrition : {}),
        JSON.stringify(Array.isArray(stage.injections) ? stage.injections : []),
        JSON.stringify(stage.injectionSchedule && typeof stage.injectionSchedule === "object" ? stage.injectionSchedule : {}),
        JSON.stringify(stage.questionnaire && typeof stage.questionnaire === "object" ? stage.questionnaire : {})
      ]
    );

    // Get the auto-increment id for this stage
    const stageRow = (await q("SELECT id FROM stages WHERE client_id = $1 AND stage_num = $2", [clientId, stageNum])).rows[0];
    if (!stageRow) continue;
    const stageDbId = stageRow.id;

    // Protocol revisions
    const protocolRevisions = Array.isArray(stage.protocolRevisions) ? stage.protocolRevisions : [];
    for (let idx = 0; idx < protocolRevisions.length; idx++) {
      const pr = protocolRevisions[idx];
      await q(
        "INSERT INTO protocol_revisions (stage_id, revision_num, date, label, groups_json) VALUES ($1, $2, $3, $4, $5)",
        [stageDbId, toInt(pr.id != null ? pr.id : idx), toStr(pr.date), toStr(pr.label), JSON.stringify(Array.isArray(pr.groups) ? pr.groups : [])]
      );
    }

    // Nutrition revisions
    const nutritionRevisions = Array.isArray(stage.nutritionRevisions) ? stage.nutritionRevisions : [];
    for (let idx = 0; idx < nutritionRevisions.length; idx++) {
      const nr = nutritionRevisions[idx];
      const { id: nrId, date, label, comment, ...rest } = nr;
      await q(
        "INSERT INTO nutrition_revisions (stage_id, revision_num, date, label, comment, data_json) VALUES ($1, $2, $3, $4, $5, $6)",
        [stageDbId, toInt(nrId != null ? nrId : idx), toStr(date), toStr(label), toStr(comment), JSON.stringify(rest)]
      );
    }

    // Journal entries for this stage
    const journal = Array.isArray(stage.journal) ? stage.journal : [];
    for (let entryIdx = 0; entryIdx < journal.length; entryIdx++) {
      const je = journal[entryIdx];
      await q(
        "INSERT INTO journal_entries (client_id, stage_id, entry_num, date, type, text, author) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [clientId, stageDbId, entryIdx, toStr(je.date), toStr(je.type), toStr(je.text), toStr(je.author)]
      );
    }
  }
};

const saveClients = async (clients) => {
  const arr = Array.isArray(clients) ? clients : [];
  const pgClient = await pool.connect();
  try {
    await pgClient.query("BEGIN");

    const existingRows = await pgClient.query("SELECT id FROM clients");
    const existingIds = new Set(existingRows.rows.map(r => r.id));
    const incomingIds = new Set(arr.map(c => c.id));

    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        await pgClient.query("DELETE FROM clients WHERE id = $1", [id]);
      }
    }

    for (const client of arr) {
      await _writeOneClient(client, pgClient);
    }

    await pgClient.query("COMMIT");
  } catch (e) {
    await pgClient.query("ROLLBACK");
    throw e;
  } finally {
    pgClient.release();
  }
};

const saveOneClient = async (client) => {
  const pgClient = await pool.connect();
  try {
    await pgClient.query("BEGIN");
    // Lock existing row (if any) to serialize with concurrent PATCHes on same client
    await pgClient.query("SELECT id FROM clients WHERE id = $1 FOR UPDATE", [toStr(client.id)]);
    await _writeOneClient(client, pgClient);
    await pgClient.query("COMMIT");
  } catch (e) {
    await pgClient.query("ROLLBACK");
    throw e;
  } finally {
    pgClient.release();
  }
};

// Atomically patches a client: locks the row, reads fresh state, calls applyFn,
// then saves the result — all within a single transaction.
// Returns { prev, next } on success, null if client not found.
const patchClientLocked = async (clientId, applyFn) => {
  const pgClient = await pool.connect();
  try {
    await pgClient.query("BEGIN");
    // Acquire row-level lock — any concurrent PATCH or PUT blocks here until we COMMIT
    const lockResult = await pgClient.query(
      "SELECT id FROM clients WHERE id = $1 FOR UPDATE",
      [clientId]
    );
    if (!lockResult.rows.length) {
      await pgClient.query("ROLLBACK");
      return null;
    }
    // Read fresh state now that we hold the lock (no other writer can change it)
    const prev = await getOneClient(clientId);
    if (!prev) {
      await pgClient.query("ROLLBACK");
      return null;
    }
    const next = applyFn(prev);
    if (!next) {
      await pgClient.query("ROLLBACK");
      return null;
    }
    await _writeOneClient(next, pgClient);
    await pgClient.query("COMMIT");
    return { prev, next };
  } catch (e) {
    await pgClient.query("ROLLBACK");
    throw e;
  } finally {
    pgClient.release();
  }
};

const deleteOneClient = async (clientId) => {
  await deleteClient(clientId);
};

// ─── Doctors ────────────────────────────────────────────────────────────────

const getDoctors = async () => {
  const rows = await listDoctors();
  return rows.map(r => ({ name: r.name, role: r.role, user_id: r.user_id ?? null }));
};

const saveDoctors = async (doctors) => {
  const arr = Array.isArray(doctors) ? doctors : [];
  const pgClient = await pool.connect();
  try {
    await pgClient.query("BEGIN");
    // Upsert each doctor by name (no DELETE-all: two admins saving simultaneously won't wipe each other's changes)
    const names = [];
    for (const d of arr) {
      const name = toStr(d.name);
      if (!name) continue;
      names.push(name);
      const userIdNum = Number(d.user_id);
      const userId = Number.isInteger(userIdNum) && userIdNum > 0 ? userIdNum : null;
      await pgClient.query(
        `INSERT INTO doctors (name, role, user_id) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET
           role = EXCLUDED.role,
           user_id = COALESCE(EXCLUDED.user_id, doctors.user_id)`,
        [name, toStr(d.role), userId]
      );
    }
    // Remove doctors that are no longer in the list
    if (names.length > 0) {
      await pgClient.query(
        "DELETE FROM doctors WHERE NOT (name = ANY($1::text[]))",
        [names]
      );
    } else {
      await pgClient.query("DELETE FROM doctors");
    }
    await pgClient.query("COMMIT");
  } catch (e) {
    await pgClient.query("ROLLBACK");
    throw e;
  } finally {
    pgClient.release();
  }
};

// ─── Analytics (concurrent-safe upsert) ─────────────────────────────────────
//
// Saves analytics for a client using upsert semantics:
//   - Adds new categories / markers / values
//   - Updates existing ones (by name for categories/markers, by date for values)
//   - Removes rows that are NOT in the incoming data (handles explicit deletions)
//
// Safe for concurrent use: two people editing different markers never conflict.

const saveAnalyticsForClient = async (clientId, categories) => {
  if (!Array.isArray(categories)) return;

  const pgClient = await pool.connect();
  try {
    await pgClient.query("BEGIN");

    const incomingCatNames = [];

    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
      const cat = categories[catIdx];
      const catName = toStr(cat.name);
      incomingCatNames.push(catName);

      // Upsert category by name
      const catResult = await pgClient.query(
        `INSERT INTO analytics_categories (client_id, name, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (client_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [clientId, catName, catIdx]
      );
      const catDbId = catResult.rows[0].id;

      const markers = Array.isArray(cat.markers) ? cat.markers : [];
      const incomingMarkerNames = [];

      for (let mIdx = 0; mIdx < markers.length; mIdx++) {
        const m = markers[mIdx];
        const mName = toStr(m.name);
        incomingMarkerNames.push(mName);

        // Upsert marker by name within category
        const mResult = await pgClient.query(
          `INSERT INTO analytics_markers (category_id, name, unit, ref_min, ref_max, optimal, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (category_id, name) DO UPDATE SET
             unit = EXCLUDED.unit, ref_min = EXCLUDED.ref_min, ref_max = EXCLUDED.ref_max,
             optimal = EXCLUDED.optimal, sort_order = EXCLUDED.sort_order
           RETURNING id`,
          [catDbId, mName, toStr(m.unit), toReal(m.refMin), toReal(m.refMax), toStr(m.optimal), mIdx]
        );
        const markerDbId = mResult.rows[0].id;

        const values = Array.isArray(m.values) ? m.values : [];
        const incomingDates = [];

        for (const v of values) {
          const vDate = toStr(v.date);
          if (!vDate) continue;
          incomingDates.push(vDate);

          // Upsert value by date within marker
          await pgClient.query(
            `INSERT INTO analytics_values (marker_id, date, value, flag_off)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (marker_id, date) DO UPDATE SET
               value = EXCLUDED.value, flag_off = EXCLUDED.flag_off`,
            [markerDbId, vDate, toStr(v.value), v.flagOff ? true : false]
          );
        }

        // Remove dates not in incoming set (explicit value deletions)
        if (incomingDates.length > 0) {
          await pgClient.query(
            `DELETE FROM analytics_values WHERE marker_id = $1 AND NOT (date = ANY($2::text[]))`,
            [markerDbId, incomingDates]
          );
        } else {
          await pgClient.query("DELETE FROM analytics_values WHERE marker_id = $1", [markerDbId]);
        }
      }

      // Remove markers not in incoming set (explicit marker deletions)
      if (incomingMarkerNames.length > 0) {
        await pgClient.query(
          `DELETE FROM analytics_markers WHERE category_id = $1 AND NOT (name = ANY($2::text[]))`,
          [catDbId, incomingMarkerNames]
        );
      } else {
        await pgClient.query("DELETE FROM analytics_markers WHERE category_id = $1", [catDbId]);
      }
    }

    // Remove categories not in incoming set (explicit category deletions)
    if (incomingCatNames.length > 0) {
      await pgClient.query(
        `DELETE FROM analytics_categories WHERE client_id = $1 AND NOT (name = ANY($2::text[]))`,
        [clientId, incomingCatNames]
      );
    } else {
      await pgClient.query("DELETE FROM analytics_categories WHERE client_id = $1", [clientId]);
    }

    await pgClient.query("COMMIT");
  } catch (e) {
    await pgClient.query("ROLLBACK");
    throw e;
  } finally {
    pgClient.release();
  }
};

module.exports = { getClients, getOneClient, getClientsForUser, saveClients, saveOneClient, patchClientLocked, deleteOneClient, getDoctors, saveDoctors, saveAnalyticsForClient };
