const {
  pool, withTransaction,
  deleteClient, getClientById,
  listDoctors,
  getAssignmentsByUser, hasAllClientsAccess,
  upsertClientAssignment
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
//
// Loading is BATCHED: a fixed 7 queries for any number of clients (clients ×
// stages × categories × markers × values used to be one query per row — an
// N+1 explosion). Output shape is identical to the old per-row loaders.

const mapValueRow = (v) => {
  const entry = { date: v.date, value: v.value };
  if (v.flag_off) entry.flagOff = true;
  return entry;
};

const mapStageRow = (row, { protocolRows, nutritionRows, journalRows, analyticsCategories }) => ({
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
  protocolRevisions:    protocolRows.map(pr => ({
    id:     pr.revision_num,
    date:   pr.date,
    label:  pr.label,
    groups: jArr(pr.groups_json)
  })),
  nutritionRevisions:   nutritionRows.map(nr => {
    const data = jObj(nr.data_json);
    return Object.assign({ id: nr.revision_num, date: nr.date, label: nr.label, comment: nr.comment }, data);
  }),
  journal:              journalRows.map(je => ({
    date:   je.date,
    type:   je.type,
    text:   je.text,
    author: je.author
  })),
  analyticsCategories
});

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
};

// Assemble full client objects for the given `clients` rows in 6 batched
// queries (analytics: 3, stages + revisions + journal: 3).
const buildClientsBatch = async (clientRows) => {
  if (!clientRows.length) return [];
  const clientIds = clientRows.map((row) => row.id);

  const [catsRes, markersRes, valuesRes, stagesRes] = await Promise.all([
    pool.query(
      "SELECT * FROM analytics_categories WHERE client_id = ANY($1) ORDER BY sort_order, id",
      [clientIds]
    ),
    pool.query(
      `SELECT m.* FROM analytics_markers m
       JOIN analytics_categories c ON c.id = m.category_id
       WHERE c.client_id = ANY($1)
       ORDER BY m.sort_order, m.id`,
      [clientIds]
    ),
    pool.query(
      `SELECT v.* FROM analytics_values v
       JOIN analytics_markers m ON m.id = v.marker_id
       JOIN analytics_categories c ON c.id = m.category_id
       WHERE c.client_id = ANY($1)
       ORDER BY v.id`,
      [clientIds]
    ),
    pool.query(
      "SELECT * FROM stages WHERE client_id = ANY($1) ORDER BY stage_num",
      [clientIds]
    ),
  ]);

  const stageIds = stagesRes.rows.map((row) => row.id);
  const [protoRes, nutriRes, journalRes] = stageIds.length
    ? await Promise.all([
        pool.query("SELECT * FROM protocol_revisions WHERE stage_id = ANY($1) ORDER BY revision_num", [stageIds]),
        pool.query("SELECT * FROM nutrition_revisions WHERE stage_id = ANY($1) ORDER BY revision_num", [stageIds]),
        pool.query("SELECT * FROM journal_entries WHERE stage_id = ANY($1) ORDER BY entry_num", [stageIds]),
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }];

  const catsByClient    = groupBy(catsRes.rows, "client_id");
  const markersByCat    = groupBy(markersRes.rows, "category_id");
  const valuesByMarker  = groupBy(valuesRes.rows, "marker_id");
  const stagesByClient  = groupBy(stagesRes.rows, "client_id");
  const protoByStage    = groupBy(protoRes.rows, "stage_id");
  const nutriByStage    = groupBy(nutriRes.rows, "stage_id");
  const journalByStage  = groupBy(journalRes.rows, "stage_id");

  return clientRows.map((row) => {
    const analyticsCategories = (catsByClient.get(row.id) || []).map((cat) => ({
      name: cat.name,
      markers: (markersByCat.get(cat.id) || []).map((m) => ({
        name:    m.name,
        unit:    m.unit,
        refMin:  m.ref_min,
        refMax:  m.ref_max,
        optimal: m.optimal,
        values:  (valuesByMarker.get(m.id) || []).map(mapValueRow)
      }))
    }));

    const stages = (stagesByClient.get(row.id) || []).map((stageRow) => mapStageRow(stageRow, {
      protocolRows:  protoByStage.get(stageRow.id) || [],
      nutritionRows: nutriByStage.get(stageRow.id) || [],
      journalRows:   journalByStage.get(stageRow.id) || [],
      analyticsCategories,
    }));

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
  });
};

const getClients = async () => {
  const r = await pool.query("SELECT * FROM clients ORDER BY id");
  return buildClientsBatch(r.rows);
};

const getOneClient = async (clientId) => {
  const row = await getClientById(clientId);
  if (!row) return null;
  const [client] = await buildClientsBatch([row]);
  return client || null;
};

const getClientsForUser = async (userId, role) => {
  if (role === "admin" || await hasAllClientsAccess(userId)) return getClients();
  const assignedRows = await getAssignmentsByUser(userId);
  const assignedIds = assignedRows.map(r => r.client_id);
  if (assignedIds.length === 0) return [];
  const r = await pool.query("SELECT * FROM clients WHERE id = ANY($1) ORDER BY id", [assignedIds]);
  return buildClientsBatch(r.rows);
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

    const ins = await q(
      `INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status, email, phone, city, height, weight_current, weight_goal, bmi, waist, tasks_json, syndromes_json, diagnoses_json, deficits_json, auto_deficit_selection_json, lab_order_selected_json, lab_order_group_order_json, nutrition_json, injections_json, injection_schedule_json, questionnaire_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28) RETURNING id`,
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

    // Auto-increment id for this stage, returned directly by the INSERT above.
    const stageDbId = ins.rows[0]?.id;
    if (!stageDbId) continue;

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
  await withTransaction(async (pgClient) => {
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
  });
};

const saveOneClient = async (client) => {
  await withTransaction(async (pgClient) => {
    // Lock existing row (if any) to serialize with concurrent PATCHes on same client
    await pgClient.query("SELECT id FROM clients WHERE id = $1 FOR UPDATE", [toStr(client.id)]);
    await _writeOneClient(client, pgClient);
  });
};

// Atomic create that CLAIMS the id with INSERT ... ON CONFLICT DO NOTHING.
// The bare existence check in the PUT route (getOneClient → null) is a TOCTOU:
// two requests can both see "no such client" and both call saveOneClient, whose
// ON CONFLICT DO UPDATE makes the loser silently overwrite the winner — or a
// pre-existing client the loser has no access to. Claiming the row in one
// statement closes that window: the loser gets { created: false } and the route
// answers 409 instead of clobbering. Returns { created: true } when THIS call
// inserted the row.
const createOneClientExclusive = async (client, { assignToUserId = null } = {}) => {
  const clientId = toStr(client.id);
  return await withTransaction(async (pgClient) => {
    const claim = await pgClient.query(
      `INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [clientId, toStr(client.name), toStr(client.shortName), toStr(client.dob), toInt(client.age), toStr(client.sex), toStr(client.avatar), toStr(client.color)]
    );
    if (!claim.rows.length) return { created: false };
    // We hold the freshly-inserted row inside this transaction; _writeOneClient
    // fills stages/journal. Its leading clients-row upsert is a harmless no-op
    // UPDATE of the row we just inserted.
    await _writeOneClient(client, pgClient);
    // Grant the creator access in the SAME transaction so a crash can't leave a
    // committed client with no assignment (a non-admin creator unable to see the
    // client they just created).
    if (assignToUserId) {
      await upsertClientAssignment(assignToUserId, clientId, assignToUserId, "manual", pgClient);
    }
    return { created: true };
  });
};

// Atomically patches a client: locks the row, reads fresh state, calls applyFn,
// then saves the result. Returns { prev, next }, or null if client not found
// or applyFn declines the update.
const PATCH_ABORT = Symbol("patch_abort");

const patchClientLocked = async (clientId, applyFn) => {
  try {
    return await withTransaction(async (pgClient) => {
      const lockResult = await pgClient.query(
        "SELECT id FROM clients WHERE id = $1 FOR UPDATE",
        [clientId]
      );
      if (!lockResult.rows.length) throw PATCH_ABORT;
      const prev = await getOneClient(clientId);
      if (!prev) throw PATCH_ABORT;
      const next = applyFn(prev);
      if (!next) throw PATCH_ABORT;
      await _writeOneClient(next, pgClient);
      return { prev, next };
    });
  } catch (e) {
    if (e === PATCH_ABORT) return null;
    throw e;
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
  await withTransaction(async (pgClient) => {
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
    if (names.length > 0) {
      await pgClient.query("DELETE FROM doctors WHERE NOT (name = ANY($1::text[]))", [names]);
    } else {
      await pgClient.query("DELETE FROM doctors");
    }
  });
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

  await withTransaction(async (pgClient) => {
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
  });
};

module.exports = { getClients, getOneClient, getClientsForUser, saveClients, saveOneClient, createOneClientExclusive, patchClientLocked, deleteOneClient, getDoctors, saveDoctors, saveAnalyticsForClient };
