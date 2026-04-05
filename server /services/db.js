const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/2life",
});

const initSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'doctor',
      all_clients_access BOOLEAN NOT NULL DEFAULT false,
      active        BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id      SERIAL PRIMARY KEY,
      name    TEXT NOT NULL UNIQUE,
      role    TEXT NOT NULL DEFAULT '',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT '',
      short_name TEXT NOT NULL DEFAULT '',
      dob        TEXT NOT NULL DEFAULT '',
      age        INTEGER NOT NULL DEFAULT 0,
      sex        TEXT NOT NULL DEFAULT '',
      avatar     TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS stages (
      id               SERIAL PRIMARY KEY,
      client_id        TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      stage_num        INTEGER NOT NULL DEFAULT 0,
      title            TEXT NOT NULL DEFAULT '',
      subtitle         TEXT NOT NULL DEFAULT '',
      doctor           TEXT NOT NULL DEFAULT '',
      doctor_role      TEXT NOT NULL DEFAULT '',
      date_start       TEXT NOT NULL DEFAULT '',
      date_end         TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'active',
      email            TEXT NOT NULL DEFAULT '',
      phone            TEXT NOT NULL DEFAULT '',
      city             TEXT NOT NULL DEFAULT '',
      height           REAL NOT NULL DEFAULT 0,
      weight_current   REAL NOT NULL DEFAULT 0,
      weight_goal      REAL NOT NULL DEFAULT 0,
      bmi              REAL NOT NULL DEFAULT 0,
      waist            REAL NOT NULL DEFAULT 0,
      tasks_json                   TEXT NOT NULL DEFAULT '[]',
      syndromes_json               TEXT NOT NULL DEFAULT '[]',
      diagnoses_json               TEXT NOT NULL DEFAULT '[]',
      deficits_json                TEXT NOT NULL DEFAULT '[]',
      auto_deficit_selection_json  TEXT NOT NULL DEFAULT '[]',
      lab_order_selected_json      TEXT NOT NULL DEFAULT '{}',
      lab_order_group_order_json   TEXT NOT NULL DEFAULT '[]',
      nutrition_json               TEXT NOT NULL DEFAULT '{}',
      injections_json              TEXT NOT NULL DEFAULT '[]',
      injection_schedule_json      TEXT NOT NULL DEFAULT '{}',
      questionnaire_json           TEXT NOT NULL DEFAULT '{}',
      UNIQUE(client_id, stage_num)
    );

    CREATE TABLE IF NOT EXISTS analytics_categories (
      id         SERIAL PRIMARY KEY,
      client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name       TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS analytics_markers (
      id          SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES analytics_categories(id) ON DELETE CASCADE,
      name        TEXT NOT NULL DEFAULT '',
      unit        TEXT NOT NULL DEFAULT '',
      ref_min     REAL NOT NULL DEFAULT 0,
      ref_max     REAL NOT NULL DEFAULT 0,
      optimal     TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS analytics_values (
      id        SERIAL PRIMARY KEY,
      marker_id INTEGER NOT NULL REFERENCES analytics_markers(id) ON DELETE CASCADE,
      date      TEXT NOT NULL DEFAULT '',
      value     TEXT NOT NULL DEFAULT '',
      flag_off  BOOLEAN NOT NULL DEFAULT false
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_ac_client_name  ON analytics_categories(client_id, name);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_am_cat_name     ON analytics_markers(category_id, name);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_av_marker_date  ON analytics_values(marker_id, date);

    CREATE INDEX IF NOT EXISTS idx_av_marker ON analytics_values(marker_id);
    CREATE INDEX IF NOT EXISTS idx_ac_client ON analytics_categories(client_id);

    CREATE TABLE IF NOT EXISTS journal_entries (
      id        SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      stage_id  INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      entry_num INTEGER NOT NULL DEFAULT 0,
      date      TEXT NOT NULL DEFAULT '',
      type      TEXT NOT NULL DEFAULT '',
      text      TEXT NOT NULL DEFAULT '',
      author    TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_je_client ON journal_entries(client_id);

    CREATE TABLE IF NOT EXISTS protocol_revisions (
      id           SERIAL PRIMARY KEY,
      stage_id     INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      revision_num INTEGER NOT NULL DEFAULT 0,
      date         TEXT NOT NULL DEFAULT '',
      label        TEXT NOT NULL DEFAULT '',
      groups_json  TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS nutrition_revisions (
      id           SERIAL PRIMARY KEY,
      stage_id     INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      revision_num INTEGER NOT NULL DEFAULT 0,
      date         TEXT NOT NULL DEFAULT '',
      label        TEXT NOT NULL DEFAULT '',
      comment      TEXT NOT NULL DEFAULT '',
      data_json    TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id           SERIAL PRIMARY KEY,
      ts           TEXT NOT NULL DEFAULT '',
      action       TEXT NOT NULL DEFAULT '',
      actor        TEXT NOT NULL DEFAULT '',
      client_id    TEXT,
      client_name  TEXT NOT NULL DEFAULT '',
      stage_id     TEXT,
      stage_title  TEXT NOT NULL DEFAULT '',
      details_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_al_ts ON activity_log(ts);
    CREATE INDEX IF NOT EXISTS idx_al_client ON activity_log(client_id);

    CREATE TABLE IF NOT EXISTS roles (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      is_system    BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS role_sections (
      id         SERIAL PRIMARY KEY,
      role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL,
      can_read   BOOLEAN NOT NULL DEFAULT false,
      can_write  BOOLEAN NOT NULL DEFAULT false,
      UNIQUE(role_id, section_id)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      id         SERIAL PRIMARY KEY,
      role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted    BOOLEAN NOT NULL DEFAULT false,
      UNIQUE(role_id, permission)
    );

    CREATE TABLE IF NOT EXISTS reference_data (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL,
      value      TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active     BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS client_assignments (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      assigned_by INTEGER,
      UNIQUE(user_id, client_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ca_user ON client_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_ca_client ON client_assignments(client_id);
  `);

  // Forward-compatible column migrations
  const stageColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'stages'`
  );
  const stageCols = stageColsRes.rows.map(r => r.column_name);

  if (!stageCols.includes("diagnoses_json")) {
    try { await pool.query("ALTER TABLE stages ADD COLUMN diagnoses_json TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
  }
  if (!stageCols.includes("lab_order_group_order_json")) {
    try { await pool.query("ALTER TABLE stages ADD COLUMN lab_order_group_order_json TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
  }

  const doctorColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'doctors'`
  );
  const doctorCols = doctorColsRes.rows.map(r => r.column_name);

  if (!doctorCols.includes("user_id")) {
    try { await pool.query("ALTER TABLE doctors ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"); } catch (_) {}
  }

  const userColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
  );
  const userCols = userColsRes.rows.map(r => r.column_name);

  if (!userCols.includes("all_clients_access")) {
    try { await pool.query("ALTER TABLE users ADD COLUMN all_clients_access BOOLEAN NOT NULL DEFAULT false"); } catch (_) {}
  }
};

// ─── Users ──────────────────────────────────────────────────────────────────

const getUser = async (username) => {
  const r = await pool.query("SELECT * FROM users WHERE username = $1 AND active = true", [username]);
  return r.rows[0] ?? null;
};

const listUsers = async () => {
  const r = await pool.query(
    "SELECT id, username, role, created_at, active, all_clients_access FROM users ORDER BY id"
  );
  return r.rows;
};

const createUser = async (username, passwordHash, role) => {
  const r = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
    [username, passwordHash, role]
  );
  return { id: r.rows[0].id };
};

const updatePass = async (passwordHash, id) => {
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
};

const setActive = async (active, id) => {
  await pool.query("UPDATE users SET active = $1 WHERE id = $2", [active, id]);
};

const setAllClientsAccess = async (allClientsAccess, id) => {
  await pool.query("UPDATE users SET all_clients_access = $1 WHERE id = $2", [allClientsAccess, id]);
};

const hasAllClientsAccess = async (id) => {
  const r = await pool.query(
    "SELECT role, active, all_clients_access FROM users WHERE id = $1 LIMIT 1",
    [id]
  );
  const user = r.rows[0] || null;
  if (!user || !user.active) return false;
  return user.role === "admin" || !!user.all_clients_access;
};

// ─── Clients ────────────────────────────────────────────────────────────────

const insertClient = async (id, name, shortName, dob, age, sex, avatar, color) => {
  await pool.query(
    `INSERT INTO clients (id, name, short_name, dob, age, sex, avatar, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET name=$2, short_name=$3, dob=$4, age=$5, sex=$6, avatar=$7, color=$8`,
    [id, name, shortName, dob, age, sex, avatar, color]
  );
};

const deleteClient = async (id) => {
  await pool.query("DELETE FROM clients WHERE id = $1", [id]);
};

const getClientById = async (id) => {
  const r = await pool.query("SELECT * FROM clients WHERE id = $1", [id]);
  return r.rows[0] ?? null;
};

const listClientIds = async () => {
  const r = await pool.query("SELECT id FROM clients");
  return r.rows;
};

// ─── Stages ─────────────────────────────────────────────────────────────────

const insertStage = async (clientId, stageNum, title, subtitle, doctor, doctorRole, dateStart, dateEnd, status, email, phone, city, height, weightCurrent, weightGoal, bmi, waist, tasksJson, syndromesJson, diagnosesJson, deficitsJson, autoDeficitSelectionJson, labOrderSelectedJson, labOrderGroupOrderJson, nutritionJson, injectionsJson, injectionScheduleJson, questionnaireJson) => {
  await pool.query(
    `INSERT INTO stages (client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status, email, phone, city, height, weight_current, weight_goal, bmi, waist, tasks_json, syndromes_json, diagnoses_json, deficits_json, auto_deficit_selection_json, lab_order_selected_json, lab_order_group_order_json, nutrition_json, injections_json, injection_schedule_json, questionnaire_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
    [clientId, stageNum, title, subtitle, doctor, doctorRole, dateStart, dateEnd, status, email, phone, city, height, weightCurrent, weightGoal, bmi, waist, tasksJson, syndromesJson, diagnosesJson, deficitsJson, autoDeficitSelectionJson, labOrderSelectedJson, labOrderGroupOrderJson, nutritionJson, injectionsJson, injectionScheduleJson, questionnaireJson]
  );
};

const deleteStagesByClient = async (clientId) => {
  await pool.query("DELETE FROM stages WHERE client_id = $1", [clientId]);
};

const getStagesByClient = async (clientId) => {
  const r = await pool.query("SELECT * FROM stages WHERE client_id = $1 ORDER BY stage_num", [clientId]);
  return r.rows;
};

const getStageDbId = async (clientId, stageNum) => {
  const r = await pool.query("SELECT id FROM stages WHERE client_id = $1 AND stage_num = $2", [clientId, stageNum]);
  return r.rows[0] ?? null;
};

const listClientIdsByDoctorName = async (doctorName) => {
  const normalized = String(doctorName || "").trim();
  if (!normalized) return [];
  const r = await pool.query(
    `SELECT DISTINCT client_id
     FROM stages
     WHERE NULLIF(BTRIM(doctor), '') IS NOT NULL
       AND LOWER(BTRIM(doctor)) = LOWER(BTRIM($1))`,
    [normalized]
  );
  return r.rows.map((row) => row.client_id);
};

// ─── Analytics ──────────────────────────────────────────────────────────────

const insertAnalyticsCategory = async (clientId, name, sortOrder) => {
  const r = await pool.query(
    "INSERT INTO analytics_categories (client_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id",
    [clientId, name, sortOrder]
  );
  return { id: r.rows[0].id };
};

const insertAnalyticsMarker = async (categoryId, name, unit, refMin, refMax, optimal, sortOrder) => {
  const r = await pool.query(
    "INSERT INTO analytics_markers (category_id, name, unit, ref_min, ref_max, optimal, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [categoryId, name, unit, refMin, refMax, optimal, sortOrder]
  );
  return { id: r.rows[0].id };
};

const insertAnalyticsValue = async (markerId, date, value, flagOff) => {
  await pool.query(
    "INSERT INTO analytics_values (marker_id, date, value, flag_off) VALUES ($1, $2, $3, $4)",
    [markerId, date, value, flagOff]
  );
};

const deleteAnalyticsByClient = async (clientId) => {
  await pool.query("DELETE FROM analytics_categories WHERE client_id = $1", [clientId]);
};

const getCategoriesByClient = async (clientId) => {
  const r = await pool.query("SELECT * FROM analytics_categories WHERE client_id = $1 ORDER BY sort_order", [clientId]);
  return r.rows;
};

const getMarkersByCategory = async (categoryId) => {
  const r = await pool.query("SELECT * FROM analytics_markers WHERE category_id = $1 ORDER BY sort_order", [categoryId]);
  return r.rows;
};

const getValuesByMarker = async (markerId) => {
  const r = await pool.query("SELECT * FROM analytics_values WHERE marker_id = $1 ORDER BY id", [markerId]);
  return r.rows;
};

// ─── Journal ────────────────────────────────────────────────────────────────

const insertJournalEntry = async (clientId, stageId, entryNum, date, type, text, author) => {
  await pool.query(
    "INSERT INTO journal_entries (client_id, stage_id, entry_num, date, type, text, author) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [clientId, stageId, entryNum, date, type, text, author]
  );
};

const deleteJournalByClient = async (clientId) => {
  await pool.query("DELETE FROM journal_entries WHERE client_id = $1", [clientId]);
};

const getJournalByStage = async (stageId) => {
  const r = await pool.query("SELECT * FROM journal_entries WHERE stage_id = $1 ORDER BY entry_num", [stageId]);
  return r.rows;
};

// ─── Protocol revisions ─────────────────────────────────────────────────────

const insertProtocolRevision = async (stageId, revisionNum, date, label, groupsJson) => {
  await pool.query(
    "INSERT INTO protocol_revisions (stage_id, revision_num, date, label, groups_json) VALUES ($1, $2, $3, $4, $5)",
    [stageId, revisionNum, date, label, groupsJson]
  );
};

const deleteProtocolByStage = async (stageId) => {
  await pool.query("DELETE FROM protocol_revisions WHERE stage_id = $1", [stageId]);
};

const getProtocolByStage = async (stageId) => {
  const r = await pool.query("SELECT * FROM protocol_revisions WHERE stage_id = $1 ORDER BY revision_num", [stageId]);
  return r.rows;
};

// ─── Nutrition revisions ────────────────────────────────────────────────────

const insertNutritionRevision = async (stageId, revisionNum, date, label, comment, dataJson) => {
  await pool.query(
    "INSERT INTO nutrition_revisions (stage_id, revision_num, date, label, comment, data_json) VALUES ($1, $2, $3, $4, $5, $6)",
    [stageId, revisionNum, date, label, comment, dataJson]
  );
};

const deleteNutritionByStage = async (stageId) => {
  await pool.query("DELETE FROM nutrition_revisions WHERE stage_id = $1", [stageId]);
};

const getNutritionByStage = async (stageId) => {
  const r = await pool.query("SELECT * FROM nutrition_revisions WHERE stage_id = $1 ORDER BY revision_num", [stageId]);
  return r.rows;
};

// ─── Doctors ────────────────────────────────────────────────────────────────

const insertDoctor = async (name, role, userId) => {
  await pool.query(
    `INSERT INTO doctors (name, role, user_id) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, user_id = EXCLUDED.user_id`,
    [name, role, userId]
  );
};

const listDoctors = async () => {
  const r = await pool.query("SELECT id, name, role, user_id FROM doctors ORDER BY id");
  return r.rows;
};

const getDoctorByName = async (name) => {
  const r = await pool.query(
    "SELECT * FROM doctors WHERE LOWER(name) = LOWER($1) AND user_id IS NOT NULL LIMIT 1",
    [name]
  );
  return r.rows[0] ?? null;
};

// ─── Activity log ───────────────────────────────────────────────────────────

// ─── Roles ──────────────────────────────────────────────────────────────────

const listRoles = async () => {
  const r = await pool.query("SELECT * FROM roles ORDER BY id");
  return r.rows;
};

const getRoleByName = async (name) => {
  const r = await pool.query("SELECT * FROM roles WHERE name = $1", [name]);
  return r.rows[0] ?? null;
};

const insertRole = async (name, displayName, isSystem) => {
  const r = await pool.query(
    "INSERT INTO roles (name, display_name, is_system) VALUES ($1, $2, $3) RETURNING id",
    [name, displayName, isSystem]
  );
  return { id: r.rows[0].id };
};

const updateRoleDisplayName = async (displayName, id) => {
  await pool.query("UPDATE roles SET display_name = $1 WHERE id = $2", [displayName, id]);
};

const deleteRole = async (id) => {
  const r = await pool.query("DELETE FROM roles WHERE id = $1 AND is_system = false", [id]);
  return { rowCount: r.rowCount };
};

// ─── Role sections ──────────────────────────────────────────────────────────

const getRoleSections = async (roleId) => {
  const r = await pool.query("SELECT * FROM role_sections WHERE role_id = $1", [roleId]);
  return r.rows;
};

const upsertRoleSection = async (roleId, sectionId, canRead, canWrite) => {
  await pool.query(
    `INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1, $2, $3, $4)
     ON CONFLICT (role_id, section_id) DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write`,
    [roleId, sectionId, canRead, canWrite]
  );
};

const deleteRoleSections = async (roleId) => {
  await pool.query("DELETE FROM role_sections WHERE role_id = $1", [roleId]);
};

// ─── Role permissions ───────────────────────────────────────────────────────

const getRolePermissions = async (roleId) => {
  const r = await pool.query("SELECT * FROM role_permissions WHERE role_id = $1", [roleId]);
  return r.rows;
};

const upsertRolePermission = async (roleId, permission, granted) => {
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission, granted) VALUES ($1, $2, $3)
     ON CONFLICT (role_id, permission) DO UPDATE SET granted = EXCLUDED.granted`,
    [roleId, permission, granted]
  );
};

// ─── Reference data ─────────────────────────────────────────────────────────

const listRefData = async (type) => {
  const r = await pool.query(
    "SELECT * FROM reference_data WHERE type = $1 AND active = true ORDER BY sort_order, id",
    [type]
  );
  return r.rows;
};

const insertRefData = async (type, value, sortOrder) => {
  const r = await pool.query(
    "INSERT INTO reference_data (type, value, sort_order) VALUES ($1, $2, $3) RETURNING id",
    [type, value, sortOrder]
  );
  return { id: r.rows[0].id };
};

const updateRefData = async (value, id) => {
  const r = await pool.query("UPDATE reference_data SET value = $1 WHERE id = $2", [value, id]);
  return { rowCount: r.rowCount };
};

const deleteRefData = async (id) => {
  await pool.query("UPDATE reference_data SET active = false WHERE id = $1", [id]);
};

const listDistinctAnalyticsMarkers = async () => {
  const r = await pool.query(`
    SELECT DISTINCT ac.name AS category_name, am.name AS marker_name
    FROM analytics_markers am
    JOIN analytics_categories ac ON ac.id = am.category_id
    ORDER BY ac.name, am.name
  `);
  return r.rows;
};

// ─── Client assignments ─────────────────────────────────────────────────────

const upsertClientAssignment = async (userId, clientId, assignedBy) => {
  await pool.query(
    "INSERT INTO client_assignments (user_id, client_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [userId, clientId, assignedBy]
  );
};

const deleteClientAssignment = async (userId, clientId) => {
  await pool.query("DELETE FROM client_assignments WHERE user_id = $1 AND client_id = $2", [userId, clientId]);
};

const getAssignmentsByUser = async (userId) => {
  const r = await pool.query("SELECT client_id FROM client_assignments WHERE user_id = $1", [userId]);
  return r.rows;
};

const getAssignmentsByClient = async (clientId) => {
  const r = await pool.query(
    "SELECT ca.user_id, u.username, u.role FROM client_assignments ca JOIN users u ON u.id = ca.user_id WHERE ca.client_id = $1",
    [clientId]
  );
  return r.rows;
};

const deleteAssignmentsByClient = async (clientId) => {
  await pool.query("DELETE FROM client_assignments WHERE client_id = $1", [clientId]);
};

module.exports = {
  pool,
  initSchema,
  // users
  getUser, listUsers, createUser, updatePass, setActive, setAllClientsAccess, hasAllClientsAccess,
  // clients
  insertClient, deleteClient, getClientById, listClientIds,
  // stages
  insertStage, deleteStagesByClient, getStagesByClient, getStageDbId, listClientIdsByDoctorName,
  // analytics
  insertAnalyticsCategory, insertAnalyticsMarker, insertAnalyticsValue,
  deleteAnalyticsByClient, getCategoriesByClient, getMarkersByCategory, getValuesByMarker,
  // journal
  insertJournalEntry, deleteJournalByClient, getJournalByStage,
  // protocol
  insertProtocolRevision, deleteProtocolByStage, getProtocolByStage,
  // nutrition revisions
  insertNutritionRevision, deleteNutritionByStage, getNutritionByStage,
  // doctors
  insertDoctor, listDoctors, getDoctorByName,
  // roles
  listRoles, getRoleByName, insertRole, updateRoleDisplayName, deleteRole,
  // role sections
  getRoleSections, upsertRoleSection, deleteRoleSections,
  // role permissions
  getRolePermissions, upsertRolePermission,
  // reference data
  listRefData, insertRefData, updateRefData, deleteRefData, listDistinctAnalyticsMarkers,
  // client assignments
  upsertClientAssignment, deleteClientAssignment,
  getAssignmentsByUser, getAssignmentsByClient, deleteAssignmentsByClient
};
