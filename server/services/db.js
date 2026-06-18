const { Pool } = require("pg");
const crypto = require("crypto");
const { decryptText } = require("./messengerCrypto");

const ADMIN_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/2life";

const adminPool = new Pool({ connectionString: ADMIN_URL });

// pg emits 'error' on an IDLE pooled client dying out-of-band (Postgres restart,
// network blip). Log and swallow it: without this listener the event would surface
// as an uncaughtException (see server/index.js) and bounce the whole container for a
// transient drop. The pool transparently reconnects on the next query.
adminPool.on("error", (err) => console.error("[pg pool] idle client error:", err.message));

// Runtime queries run as a least-privilege role; the configured (admin)
// connection is only used for boot-time schema/seeds and stays available as
// a fallback. The swap happens behind this facade because every module
// destructures { pool } at require-time.
let activePool = adminPool;

const pool = {
  query: (...args) => activePool.query(...args),
  connect: (...args) => activePool.connect(...args),
  on: (...args) => activePool.on(...args),
  end: async () => {
    if (activePool !== adminPool) await activePool.end();
    await adminPool.end();
  },
};

// Creates/refreshes the DML-only role and switches the runtime pool to it.
// Called once at boot AFTER all schema/seed work (which needs the admin
// connection). The password is random per boot and never stored — only this
// process uses the role. Any failure (no superuser on a managed PG, etc.)
// logs and keeps the admin connection so boot never breaks.
const APP_DB_ROLE = "app_2life";
const quoteAppIdent = (s) => '"' + String(s).replace(/"/g, '""') + '"';

const ensureAppDbRole = async () => {
  if (process.env.APP_DB_ROLE === "off") {
    console.log("[db] least-privilege role disabled via APP_DB_ROLE=off");
    return { switched: false, reason: "disabled by APP_DB_ROLE=off" };
  }
  try {
    const url = new URL(ADMIN_URL);
    const dbName = decodeURIComponent(url.pathname.slice(1));
    const password = crypto.randomBytes(24).toString("base64url"); // URL-safe, no quotes
    // Defense-in-depth: this password is interpolated into a DDL string below
    // (PASSWORD '...' cannot be a bind parameter). base64url yields only
    // [A-Za-z0-9_-], so it can't break out of the literal today — pin that
    // invariant so a future generator change can't open SQL injection on the
    // privileged admin connection.
    if (!/^[A-Za-z0-9_-]+$/.test(password)) {
      throw new Error("generated app DB role password contains unsafe characters for DDL interpolation");
    }
    const ident = quoteAppIdent(APP_DB_ROLE);

    const exists = await adminPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_DB_ROLE]);
    if (!exists.rows.length) await adminPool.query(`CREATE ROLE ${ident} LOGIN`);
    await adminPool.query(
      `ALTER ROLE ${ident} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`
    );
    await adminPool.query(`GRANT CONNECT ON DATABASE ${quoteAppIdent(dbName)} TO ${ident}`);
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${ident}`);
    // TRUNCATE: the messenger full-reset uses it; same blast radius as DELETE.
    await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO ${ident}`);
    await adminPool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ident}`);

    const appUrl = new URL(ADMIN_URL);
    appUrl.username = APP_DB_ROLE;
    appUrl.password = password;
    const candidate = new Pool({ connectionString: appUrl.toString() });
    await candidate.query("SELECT 1"); // smoke-test before switching
    candidate.on("error", (err) => console.error("[pg pool] idle client error:", err.message));
    activePool = candidate;
    console.log(`[db] runtime pool switched to least-privilege role '${APP_DB_ROLE}' (DML-only)`);
    return { switched: true };
  } catch (e) {
    console.warn("[db] least-privilege role unavailable, staying on admin connection:", e.message);
    return { switched: false, reason: e.message };
  }
};

const initSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'doctor',
      all_clients_access BOOLEAN NOT NULL DEFAULT false,
      active        BOOLEAN NOT NULL DEFAULT true,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS revoked_auth_tokens (
      jti        TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_revoked_auth_tokens_expires
      ON revoked_auth_tokens(expires_at);

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
      is_system    BOOLEAN NOT NULL DEFAULT false,
      is_client    BOOLEAN NOT NULL DEFAULT false
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
      assignment_source TEXT NOT NULL DEFAULT 'manual',
      UNIQUE(user_id, client_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ca_user ON client_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_ca_client ON client_assignments(client_id);

    -- ── Client menu ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS dishes (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      meal_type   TEXT NOT NULL DEFAULT 'universal',
      ingredients TEXT NOT NULL DEFAULT '',
      recipe      TEXT NOT NULL DEFAULT '',
      calories    REAL,
      protein     REAL,
      fat         REAL,
      carbs       REAL,
      additions   TEXT NOT NULL DEFAULT '',
      active      BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_dishes_active ON dishes(active);
    CREATE INDEX IF NOT EXISTS idx_dishes_meal_type ON dishes(meal_type);

    CREATE TABLE IF NOT EXISTS client_weekly_menus (
      id         SERIAL PRIMARY KEY,
      client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(client_id, week_start)
    );

    CREATE INDEX IF NOT EXISTS idx_cwm_client_week ON client_weekly_menus(client_id, week_start);

    CREATE TABLE IF NOT EXISTS client_menu_items (
      id                   SERIAL PRIMARY KEY,
      menu_id              INTEGER NOT NULL REFERENCES client_weekly_menus(id) ON DELETE CASCADE,
      dish_id              INTEGER NOT NULL REFERENCES dishes(id),
      day_index            INTEGER NOT NULL DEFAULT 0,
      meal_type            TEXT NOT NULL DEFAULT 'breakfast',
      custom_additions     TEXT NOT NULL DEFAULT '',
      grams                TEXT NOT NULL DEFAULT '',
      calories_override    REAL,
      protein_override     REAL,
      fat_override         REAL,
      carbs_override       REAL,
      comment              TEXT NOT NULL DEFAULT '',
      sort_order           INTEGER NOT NULL DEFAULT 0,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cmi_menu_slot ON client_menu_items(menu_id, day_index, meal_type, sort_order);
    CREATE INDEX IF NOT EXISTS idx_cmi_dish ON client_menu_items(dish_id);

    -- ── Messenger ───────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS user_public_keys (
      id                        SERIAL PRIMARY KEY,
      user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      public_key_jwk            TEXT NOT NULL,
      encrypted_private_key_jwk TEXT NOT NULL DEFAULT '',
      key_derivation_salt       TEXT NOT NULL DEFAULT '',
      key_derivation_iv         TEXT NOT NULL DEFAULT '',
      recovery_encrypted_private_key_jwk TEXT NOT NULL DEFAULT '',
      recovery_key_iv           TEXT NOT NULL DEFAULT '',
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chats (
      id          SERIAL PRIMARY KEY,
      client_id   TEXT REFERENCES clients(id) ON DELETE CASCADE,
      is_internal BOOLEAN NOT NULL DEFAULT false,
      title       TEXT NOT NULL DEFAULT '',
      icon        TEXT NOT NULL DEFAULT '',
      created_by  INTEGER NOT NULL REFERENCES users(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_chats_client ON chats(client_id);
    CREATE TABLE IF NOT EXISTS chat_participants (
      id           SERIAL PRIMARY KEY,
      chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_in_chat TEXT NOT NULL DEFAULT 'member',
      is_pinned    BOOLEAN NOT NULL DEFAULT false,
      joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(chat_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cp_user ON chat_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_cp_chat ON chat_participants(chat_id);

    CREATE TABLE IF NOT EXISTS messages (
      id                 SERIAL PRIMARY KEY,
      chat_id            INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id          INTEGER NOT NULL REFERENCES users(id),
      encrypted_text     TEXT NOT NULL DEFAULT '',
      encrypted_meta     TEXT NOT NULL DEFAULT '',
      msg_type           TEXT NOT NULL DEFAULT 'text',
      file_id            TEXT,
      client_message_id  TEXT NOT NULL DEFAULT '',
      deleted_for_all    BOOLEAN NOT NULL DEFAULT false,
      deleted_for_all_at TIMESTAMPTZ,
      deleted_by         INTEGER REFERENCES users(id),
      edited_at          TIMESTAMPTZ,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_msg_chat_created ON messages(chat_id, created_at);
    CREATE TABLE IF NOT EXISTS message_hidden_for_users (
      id         SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hidden_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mh_user_msg ON message_hidden_for_users(user_id, message_id);
    CREATE INDEX IF NOT EXISTS idx_mh_msg ON message_hidden_for_users(message_id);

    CREATE TABLE IF NOT EXISTS message_receipts (
      id                   SERIAL PRIMARY KEY,
      chat_id              INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id INTEGER NOT NULL REFERENCES messages(id),
      read_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(chat_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mr_chat ON message_receipts(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id_id_desc ON messages(chat_id, id DESC);

    CREATE TABLE IF NOT EXISTS chat_files (
      id            TEXT PRIMARY KEY,
      chat_id       INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      uploader_id   INTEGER NOT NULL REFERENCES users(id),
      original_name TEXT NOT NULL DEFAULT '',
      mime_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      storage_path  TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cf_chat ON chat_files(chat_id);

    CREATE TABLE IF NOT EXISTS messenger_devices (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id    TEXT NOT NULL,
      endpoint     TEXT NOT NULL DEFAULT '',
      p256dh       TEXT NOT NULL DEFAULT '',
      auth         TEXT NOT NULL DEFAULT '',
      user_agent   TEXT NOT NULL DEFAULT '',
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, device_id)
    );

    CREATE INDEX IF NOT EXISTS idx_md_user ON messenger_devices(user_id);

    CREATE TABLE IF NOT EXISTS messenger_sync_events (
      id         BIGSERIAL PRIMARY KEY,
      chat_id    INTEGER REFERENCES chats(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sync_user_id ON messenger_sync_events(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_sync_chat_id ON messenger_sync_events(chat_id, id);

    -- ── Analytics files ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS analytics_files (
      id            SERIAL PRIMARY KEY,
      client_id     TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      display_name  TEXT NOT NULL DEFAULT '',
      analysis_date TEXT NOT NULL DEFAULT '',
      comment       TEXT NOT NULL DEFAULT '',
      original_name TEXT NOT NULL DEFAULT '',
      mime_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      storage_path  TEXT NOT NULL DEFAULT '',
      uploaded_by   INTEGER REFERENCES users(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_anf_client ON analytics_files(client_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_items (
      id                      SERIAL PRIMARY KEY,
      client_id               TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      stage_id                INTEGER REFERENCES stages(id) ON DELETE SET NULL,
      type                    TEXT NOT NULL DEFAULT 'note',
      title                   TEXT NOT NULL DEFAULT '',
      description             TEXT NOT NULL DEFAULT '',
      status                  TEXT NOT NULL DEFAULT 'open',
      due_date                DATE,
      due_time                TIME,
      assignee_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_team_task            BOOLEAN NOT NULL DEFAULT true,
      priority                TEXT NOT NULL DEFAULT 'normal',
      created_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at            TIMESTAMPTZ,
      cancelled_at            TIMESTAMPTZ,
      deleted_at              TIMESTAMPTZ,
      deleted_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
      delete_reason           TEXT NOT NULL DEFAULT '',
      metadata_json           TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS journal_comments (
      id              SERIAL PRIMARY KEY,
      journal_item_id INTEGER NOT NULL REFERENCES journal_items(id) ON DELETE CASCADE,
      author_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body            TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at      TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS journal_notification_deliveries (
      id              SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      journal_item_id  INTEGER REFERENCES journal_items(id) ON DELETE CASCADE,
      kind             TEXT NOT NULL,
      delivery_key     TEXT NOT NULL,
      delivered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, kind, delivery_key)
    );

    CREATE INDEX IF NOT EXISTS idx_ji_client ON journal_items(client_id);
    CREATE INDEX IF NOT EXISTS idx_ji_stage ON journal_items(stage_id);
    CREATE INDEX IF NOT EXISTS idx_ji_due ON journal_items(due_date, due_time);
    CREATE INDEX IF NOT EXISTS idx_ji_assignee ON journal_items(assignee_user_id);
    CREATE INDEX IF NOT EXISTS idx_jc_item ON journal_comments(journal_item_id);
    CREATE INDEX IF NOT EXISTS idx_jnd_user_kind_key ON journal_notification_deliveries(user_id, kind, delivery_key);
  `);

  const { ensureMigrationsTable, runOnce } = require("./migrations");
  await ensureMigrationsTable();

  // Additive column for existing DBs (CREATE TABLE IF NOT EXISTS won't add it).
  // Idempotent catalog no-op after the first boot, so it's safe outside runOnce.
  await pool.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_client BOOLEAN NOT NULL DEFAULT false`);

  // Optimistic-concurrency counter for role permission edits. Bumped on every
  // sections/permissions save and on is_client toggle so two admins editing the
  // same role can't silently overwrite each other (the second save 409s).
  // NOTE: this is roles.version — deliberately NOT users.token_version. Role/perm
  // changes must NOT bump token_version (HTTP/WS re-read the role live; the SSE
  // sweep compares it) — bumping it would break that live-reload revocation path.
  await pool.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0`);

  // One-time backfill: the legacy client roles were identified by NAME
  // ('viewer'/'client'); mark them with the explicit flag. Behind runOnce so an
  // admin can later untick the flag without it being re-applied on every boot.
  await runOnce("2026-06_roles_is_client_backfill", async (c) => {
    await c.query(`UPDATE roles SET is_client = true WHERE LOWER(TRIM(name)) IN ('viewer', 'client')`);
  });

  // Messenger section permissions become ENFORCED in this release (they were
  // decorative before). Force-enable messenger read+write for every existing
  // staff (non-client) role so staff messaging keeps working after upgrade.
  // Overriding blindly is safe: the messenger checkbox was never shown in the
  // admin UI before this release, so no deliberate admin choice can be lost.
  // Client roles are left untouched (the seeded viewer role already has
  // messenger read+write). MUST run after the is_client backfill above.
  await runOnce("2026-06_messenger_enable_staff_roles", async (c) => {
    await c.query(`
      INSERT INTO role_sections (role_id, section_id, can_read, can_write)
      SELECT r.id, 'messenger', true, true
      FROM roles r
      WHERE r.is_client = false
      ON CONFLICT (role_id, section_id) DO UPDATE SET can_read = true, can_write = true
    `);
  });

  // One-time cleanup: journal checklist subsystem was removed in 2026-05-28.
  // Wrapped in runOnce so the LIKE '%"checklist":true%' operator only runs while
  // metadata_json is still TEXT (before the JSONB conversion below). LIKE is a
  // TEXT operator — once the column becomes JSONB it would throw on every boot.
  await runOnce("2026-05_journal_checklist_cleanup", async (c) => {
    const colExistsRes = await c.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'journal_items' AND column_name = 'source_template_item_id'
      LIMIT 1
    `);
    if (colExistsRes.rowCount > 0) {
      await c.query(`
        DELETE FROM journal_items
        WHERE source_template_item_id IS NOT NULL
           OR metadata_json LIKE '%"checklist":true%'
      `);
      await c.query(`ALTER TABLE journal_items DROP COLUMN IF EXISTS source_template_item_id`);
    } else {
      await c.query(`
        DELETE FROM journal_items
        WHERE metadata_json LIKE '%"checklist":true%'
      `);
    }
    await c.query(`DROP TABLE IF EXISTS journal_checklist_template_items`);
  });

  // Convert metadata_json TEXT → JSONB so the column type matches the data,
  // eliminates per-row JSON.parse, and makes the legacy_journal_entry_id path
  // indexable. The defensive COALESCE/NULLIF guards against any empty-string
  // rows that would cause a naive ::jsonb cast to throw.
  await runOnce("2026-06_journal_metadata_jsonb", async (c) => {
    // Drop the TEXT default first; PostgreSQL cannot implicitly cast it when
    // changing column type, so we need a clean ALTER TYPE then restore default.
    await c.query("ALTER TABLE journal_items ALTER COLUMN metadata_json DROP DEFAULT");
    await c.query("ALTER TABLE journal_items ALTER COLUMN metadata_json TYPE JSONB USING COALESCE(NULLIF(metadata_json,''),'{}')::jsonb");
    await c.query("ALTER TABLE journal_items ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb");
    // Index the ::int expression (not the raw text ->>): the legacy-detection query
    // compares (metadata_json->>'legacy_journal_entry_id')::int = je.id, so the index
    // must match that exact expression to be used. Safe because this key is only ever
    // written as an integer (journal_entries.id) by backfillLegacyJournalEntries.
    await c.query("CREATE INDEX IF NOT EXISTS idx_ji_legacy_entry ON journal_items (((metadata_json->>'legacy_journal_entry_id')::int))");
  });

  // Merge duplicate client chats (one per client is the invariant).
  // Strategy: keep the chat with the lowest id ("survivor"), re-point all related rows to it.
  //   messages + chat_files  — re-pointed by UPDATE (no client_message_id collisions exist).
  //   chat_participants      — de-duped like a set: delete conflicting loser rows first, then re-point.
  //   message_receipts       — merged preserving the max last_read_message_id per user.
  //   messenger_sync_events  — cascade-deleted with the loser chats (ephemeral delta-sync log, not preserved).
  //   message_hidden_for_users / message_pinned_for_users — key on message_id, not chat_id, so they
  //     follow their messages automatically and must NOT be touched here.
  // After the merge a partial unique index enforces the invariant going forward.
  await runOnce("2026-06_chats_one_per_client", async (c) => {
    const dupes = await c.query(`
      SELECT client_id, MIN(id) AS keep_id, array_agg(id) AS ids
      FROM chats WHERE client_id IS NOT NULL AND is_internal = false
      GROUP BY client_id HAVING COUNT(*) > 1
    `);
    for (const row of dupes.rows) {
      const losers = row.ids.filter((id) => id !== row.keep_id);
      if (!losers.length) continue;
      // 1) messages + files: re-point to survivor (no client_message_id collisions exist)
      await c.query("UPDATE messages SET chat_id = $1 WHERE chat_id = ANY($2::int[])", [row.keep_id, losers]);
      await c.query("UPDATE chat_files SET chat_id = $1 WHERE chat_id = ANY($2::int[])", [row.keep_id, losers]);
      // 2) participants: delete losers' rows that would collide with survivor's (chat_id,user_id), then re-point the rest
      await c.query(`DELETE FROM chat_participants cp WHERE cp.chat_id = ANY($1::int[])
                     AND EXISTS (SELECT 1 FROM chat_participants k WHERE k.chat_id=$2 AND k.user_id=cp.user_id)`, [losers, row.keep_id]);
      await c.query("UPDATE chat_participants SET chat_id = $1 WHERE chat_id = ANY($2::int[])", [row.keep_id, losers]);
      // 3) message_receipts: PRESERVE read-state (preserve real last_read AND read_at — read_at
      //    feeds the "seen by" ordering, so keep the genuine timestamps rather than stamping now()).
      //    For users who have a receipt on BOTH survivor and a loser: bump survivor to the max.
      await c.query(`
        UPDATE message_receipts s
        SET last_read_message_id = GREATEST(s.last_read_message_id, l.maxlrm),
            read_at = GREATEST(s.read_at, l.maxread)
        FROM (SELECT user_id, MAX(last_read_message_id) AS maxlrm, MAX(read_at) AS maxread
              FROM message_receipts WHERE chat_id = ANY($2::int[]) GROUP BY user_id) l
        WHERE s.chat_id = $1 AND s.user_id = l.user_id`, [row.keep_id, losers]);
      //    For users who had a receipt ONLY on a loser: create one on the survivor.
      await c.query(`
        INSERT INTO message_receipts (chat_id, user_id, last_read_message_id, read_at)
        SELECT $1, user_id, MAX(last_read_message_id), MAX(read_at)
        FROM message_receipts
        WHERE chat_id = ANY($2::int[])
          AND user_id NOT IN (SELECT user_id FROM message_receipts WHERE chat_id = $1)
        GROUP BY user_id`, [row.keep_id, losers]);
      // 4) delete loser chats. This CASCADE-deletes their now-empty message_receipts and their
      //    messenger_sync_events (ephemeral delta-sync log — intentionally not preserved).
      await c.query("DELETE FROM chats WHERE id = ANY($1::int[])", [losers]);
      // 5) the survivor just absorbed the losers' (possibly newer) messages. Recompute its
      //    denormalized last_message_* cache — the IS NULL-guarded backfill above cannot, because
      //    the survivor's cache is already populated, so without this its chat-list preview/sort
      //    would stay stale until the next message arrives.
      await applyChatLastMessage(c, row.keep_id);
    }
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_one_per_client
                   ON chats(client_id) WHERE client_id IS NOT NULL AND is_internal = false`);
  });

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
  if (!userCols.includes("display_name")) {
    try { await pool.query("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  }
  if (!userCols.includes("token_version")) {
    await pool.query("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
  }

  const assignmentColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'client_assignments'`
  );
  const assignmentCols = assignmentColsRes.rows.map(r => r.column_name);
  if (!assignmentCols.includes("assignment_source")) {
    try { await pool.query("ALTER TABLE client_assignments ADD COLUMN assignment_source TEXT NOT NULL DEFAULT 'manual'"); } catch (_) {}
  }

  await runOnce("2026-06_backfill_doctor_assignment_source", async (c) => {
    await c.query(`
      UPDATE client_assignments ca
         SET assignment_source = 'doctor'
        FROM doctors d
       WHERE d.user_id = ca.user_id
         AND d.user_id IS NOT NULL
         AND EXISTS (
           SELECT 1
             FROM stages s
            WHERE s.client_id = ca.client_id
              AND NULLIF(BTRIM(s.doctor), '') IS NOT NULL
              AND LOWER(BTRIM(s.doctor)) = LOWER(BTRIM(d.name))
         )
    `);
  });

  // Functional index backing the LOWER(BTRIM(doctor)) doctor-name scans
  // (listClientIdsByDoctorName, deleteDoctorClientAssignmentsCore, the backfill above).
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_stages_doctor_lower ON stages (LOWER(BTRIM(doctor))) WHERE NULLIF(BTRIM(doctor), '') IS NOT NULL"); } catch (_) {}

  try { await pool.query("ALTER TABLE dishes ALTER COLUMN calories DROP NOT NULL"); } catch (_) {}
  try { await pool.query("ALTER TABLE dishes ALTER COLUMN calories DROP DEFAULT"); } catch (_) {}

  try { await pool.query("ALTER TABLE messages ADD COLUMN encrypted_text TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { await pool.query("ALTER TABLE messages ADD COLUMN encrypted_meta TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { await pool.query("ALTER TABLE messages ADD COLUMN client_message_id TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  // messages encrypted_text/meta migration (ciphertext/iv are old column names that
  // don't exist on fresh installs — guard so this is a no-op on a blank database)
  await runOnce("2026-05_messages_encrypted_columns", async (c) => {
    const msgCols = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'`
    );
    const msgColNames = msgCols.rows.map(r => r.column_name);
    if (msgColNames.includes("ciphertext")) {
      await c.query("UPDATE messages SET encrypted_text = ciphertext WHERE encrypted_text = '' AND NULLIF(ciphertext, '') IS NOT NULL");
    }
    if (msgColNames.includes("iv")) {
      await c.query("UPDATE messages SET encrypted_meta = iv WHERE encrypted_meta = '' AND NULLIF(iv, '') IS NOT NULL");
    }
  });
  try { await pool.query("ALTER TABLE messages ALTER COLUMN ciphertext DROP NOT NULL"); } catch (_) {}
  try { await pool.query("ALTER TABLE messages ALTER COLUMN iv DROP NOT NULL"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"); } catch (_) {}
  try { await pool.query("ALTER TABLE chat_participants ADD COLUMN encrypted_chat_key TEXT NOT NULL DEFAULT ''"); } catch (_) {}

  const chatColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'chats'`
  );
  const chatCols = chatColsRes.rows.map(r => r.column_name);

  if (!chatCols.includes("is_internal")) {
    try { await pool.query("ALTER TABLE chats ADD COLUMN is_internal BOOLEAN NOT NULL DEFAULT false"); } catch (_) {}
  }
  if (!chatCols.includes("icon")) {
    try { await pool.query("ALTER TABLE chats ADD COLUMN icon TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  }
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_chats_internal ON chats(is_internal)"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_id INTEGER"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_at TIMESTAMPTZ"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_sender_id INTEGER"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_type TEXT"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_encrypted_text TEXT"); } catch (_) {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC NULLS LAST)"); } catch (_) {}
  // chats last-message backfill
  await runOnce("2026-05_backfill_chats_last_message", async (c) => {
    await c.query(`UPDATE chats c SET last_message_id = lm.id, last_message_at = lm.created_at,
          last_message_sender_id = lm.sender_id, last_message_type = lm.msg_type,
          last_message_encrypted_text = lm.encrypted_text
      FROM ( SELECT DISTINCT ON (chat_id) chat_id, id, created_at, sender_id, msg_type, encrypted_text
        FROM messages WHERE msg_type <> 'system' AND deleted_for_all = false
        ORDER BY chat_id, id DESC ) lm
      WHERE c.id = lm.chat_id AND c.last_message_id IS NULL`);
  });
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_msg_client_message ON messages(chat_id, client_message_id)"); } catch (_) {}
  try {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uniq_msg_client_message_sender
       ON messages(chat_id, sender_id, client_message_id)
       WHERE client_message_id <> ''`
    );
  } catch (_) {}
  try { await pool.query("ALTER TABLE chats ALTER COLUMN client_id DROP NOT NULL"); } catch (_) {}
  // chats is_internal normalization (two UPDATEs)
  await runOnce("2026-05_normalize_chats_is_internal", async (c) => {
    await c.query("UPDATE chats SET is_internal = true  WHERE client_id IS NULL");
    await c.query("UPDATE chats SET is_internal = false WHERE client_id IS NOT NULL AND is_internal IS DISTINCT FROM false");
  });

  const chatParticipantColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'chat_participants'`
  );
  const chatParticipantCols = chatParticipantColsRes.rows.map(r => r.column_name);
  if (!chatParticipantCols.includes("is_pinned")) {
    try { await pool.query("ALTER TABLE chat_participants ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false"); } catch (_) {}
  }

  // Role migration: "Наблюдатель" -> "Клиент", and ensure messenger access is configured.
  try {
    await pool.query("UPDATE roles SET display_name = 'Клиент' WHERE name IN ('viewer', 'client')");
  } catch (_) {}

  // Ensure every role has explicit messenger section permissions.
  await runOnce("2026-05_role_sections_messenger", async (c) => {
    await c.query(`
      INSERT INTO role_sections (role_id, section_id, can_read, can_write)
      SELECT r.id, 'messenger', true, true
      FROM roles r
      WHERE NOT EXISTS (
        SELECT 1
        FROM role_sections rs
        WHERE rs.role_id = r.id
          AND rs.section_id = 'messenger'
      )
    `);
  });

  // Existing staff roles should see the new menu section after upgrade.
  await runOnce("2026-05_role_sections_menu", async (c) => {
    await c.query(`
      INSERT INTO role_sections (role_id, section_id, can_read, can_write)
      SELECT r.id, 'menu', true, CASE WHEN r.name = 'viewer' THEN false ELSE true END
      FROM roles r
      WHERE NOT EXISTS (
        SELECT 1
        FROM role_sections rs
        WHERE rs.role_id = r.id
          AND rs.section_id = 'menu'
      )
    `);
  });

  // NOTE: Do NOT force-reset the client/viewer role's sections on startup.
  // The "messenger-only" default for the client role is seeded once during
  // initial setup (initDefaultRoles), and messenger access for every role is
  // ensured idempotently above (INSERT ... WHERE NOT EXISTS). The previous
  // unconditional UPDATE here re-ran on EVERY boot and wiped the section /
  // permission checkboxes an admin had configured in the Roles tab — making
  // edits "fall off" after each restart/redeploy. Admin-configured access must
  // persist and only change when the admin changes it.

  const messageColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'`
  );
  const messageCols = messageColsRes.rows.map(r => r.column_name);

  if (!messageCols.includes("edited_at")) {
    try { await pool.query("ALTER TABLE messages ADD COLUMN edited_at TIMESTAMPTZ"); } catch (_) {}
  }
  if (!messageCols.includes("deleted_for_all")) {
    try { await pool.query("ALTER TABLE messages ADD COLUMN deleted_for_all BOOLEAN NOT NULL DEFAULT false"); } catch (_) {}
  }
  if (!messageCols.includes("deleted_for_all_at")) {
    try { await pool.query("ALTER TABLE messages ADD COLUMN deleted_for_all_at TIMESTAMPTZ"); } catch (_) {}
  }
  if (!messageCols.includes("deleted_by")) {
    try { await pool.query("ALTER TABLE messages ADD COLUMN deleted_by INTEGER REFERENCES users(id)"); } catch (_) {}
  }

  const publicKeyColsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_public_keys'`
  );
  const publicKeyCols = publicKeyColsRes.rows.map(r => r.column_name);

  if (!publicKeyCols.includes("recovery_encrypted_private_key_jwk")) {
    try {
      await pool.query("ALTER TABLE user_public_keys ADD COLUMN recovery_encrypted_private_key_jwk TEXT NOT NULL DEFAULT ''");
    } catch (_) {}
  }
  if (!publicKeyCols.includes("recovery_key_iv")) {
    try {
      await pool.query("ALTER TABLE user_public_keys ADD COLUMN recovery_key_iv TEXT NOT NULL DEFAULT ''");
    } catch (_) {}
  }

  // One-time backfill for any legacy NULLs (the column is NOT NULL DEFAULT false now,
  // so this matches nothing on a reachable DB — behind runOnce so it isn't a per-boot scan).
  await runOnce("2026-05_messages_deleted_for_all_notnull", async (c) => {
    await c.query("UPDATE messages SET deleted_for_all = false WHERE deleted_for_all IS NULL");
  });

  // ─── Sub-project A: messenger telegram-parity ───────────────────────────────
  try { await pool.query("ALTER TABLE messages ADD COLUMN pinned_at TIMESTAMPTZ"); } catch (_) {}
  try { await pool.query("ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL"); } catch (_) {}
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_pinned_for_users (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, message_id)
      )
    `);
  } catch (_) {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_msg_chat_pinned ON messages(chat_id, pinned_at) WHERE pinned_at IS NOT NULL"); } catch (_) {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_msg_reply_to ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL"); } catch (_) {}

  // Device session tracking: одно поле jti на пару (user_id, device_id)
  try { await pool.query("ALTER TABLE messenger_devices ADD COLUMN jti TEXT"); } catch (_) {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_md_jti ON messenger_devices(jti) WHERE jti IS NOT NULL"); } catch (_) {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_mpf_user ON message_pinned_for_users(user_id)"); } catch (_) {}

  // Additive: backfill role_sections for the 'journal' section on upgrades from
  // pre-journal deployments where existing roles never had a row inserted.
  await runOnce("2026-05_role_sections_journal", async (c) => {
    await c.query(`
      INSERT INTO role_sections (role_id, section_id, can_read, can_write)
      SELECT r.id, 'journal',
        CASE WHEN r.name = 'viewer' THEN false ELSE true END,
        CASE WHEN r.name = 'viewer' THEN false ELSE true END
      FROM roles r
      WHERE NOT EXISTS (
        SELECT 1 FROM role_sections rs
        WHERE rs.role_id = r.id AND rs.section_id = 'journal'
      )
    `);
  });

  // Auto-migrate legacy journal_entries → journal_items on startup.
  // NOTE: backfillLegacyJournalEntries() writes via the shared `pool`, NOT the
  // runOnce transaction client — so its INSERTs self-commit and are NOT rolled
  // back if this runOnce later fails. Recording-once is still correct because
  // the backfill is independently idempotent (its own NOT EXISTS guard on
  // metadata.legacy_journal_entry_id); worst case on an unlucky crash is one
  // redundant detection scan next boot, never lost or duplicated data.
  await runOnce("2026-05_backfill_legacy_journal_entries", async () => {
    const { backfillLegacyJournalEntries } = require("./journalStore");
    const result = await backfillLegacyJournalEntries();
    if (result?.migrated > 0) console.log(`[journal] backfilled ${result.migrated} legacy entries`);
  });

  await runOnce("2026-06_create_wave_tables", async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS wave_checkins (
        id            SERIAL PRIMARY KEY,
        client_id     TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        checkin_date  DATE NOT NULL,
        scores        JSONB NOT NULL DEFAULT '{}'::jsonb,
        context_tags  JSONB NOT NULL DEFAULT '[]'::jsonb,
        weight        NUMERIC,
        resting_hr    INTEGER,
        note          TEXT NOT NULL DEFAULT '',
        objective     JSONB NOT NULL DEFAULT '{}'::jsonb,
        source        TEXT NOT NULL DEFAULT 'manual',
        ingested_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(client_id, checkin_date)
      );

      CREATE TABLE IF NOT EXISTS wave_reactions (
        id              SERIAL PRIMARY KEY,
        client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        author_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        pinned_date     DATE NOT NULL,
        kind            TEXT NOT NULL DEFAULT 'ack',
        text            TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wave_reactions_client ON wave_reactions(client_id, pinned_date);

      CREATE TABLE IF NOT EXISTS wave_flags (
        id          SERIAL PRIMARY KEY,
        client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        flag_date   DATE NOT NULL,
        kind        TEXT NOT NULL,
        metric      TEXT NOT NULL DEFAULT '',
        magnitude   NUMERIC NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'open',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(client_id, flag_date, kind, metric)
      );
      CREATE INDEX IF NOT EXISTS idx_wave_flags_open ON wave_flags(client_id, status);
    `);
  });

  await runOnce("2026-06_wave_role_sections", async (c) => {
    await c.query(`
      INSERT INTO role_sections (role_id, section_id, can_read, can_write)
      SELECT r.id, 'wave', true, true
      FROM roles r
      ON CONFLICT (role_id, section_id) DO UPDATE SET can_read = true, can_write = true
    `);
  });

  await runOnce("2026-06_create_integration_connections", async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS integration_connections (
        id                SERIAL PRIMARY KEY,
        client_id         TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source            TEXT NOT NULL,
        provider_user_id  TEXT,
        access_token_enc  TEXT NOT NULL,
        refresh_token_enc TEXT NOT NULL,
        token_expires_at  TIMESTAMPTZ,
        scopes            JSONB NOT NULL DEFAULT '[]'::jsonb,
        status            TEXT NOT NULL DEFAULT 'active',
        connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_sync_at      TIMESTAMPTZ,
        last_error        TEXT,
        UNIQUE(client_id, source)
      );
      CREATE INDEX IF NOT EXISTS idx_integration_provider ON integration_connections(source, provider_user_id);
    `);
  });

};

// ─── Users ──────────────────────────────────────────────────────────────────

const getUser = async (username) => {
  const r = await pool.query("SELECT * FROM users WHERE username = $1 AND active = true", [username]);
  return r.rows[0] ?? null;
};

const listUsers = async () => {
  // is_client comes from the roles table — a user with an unknown role gets
  // false (treated as staff), same as the explicit-flag default.
  const r = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.active, u.all_clients_access,
            COALESCE(ro.is_client, false) AS is_client
     FROM users u
     LEFT JOIN roles ro ON ro.name = u.role
     ORDER BY u.id`
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

const deleteClient = async (id) => {
  await pool.query("DELETE FROM clients WHERE id = $1", [id]);
};

const getClientById = async (id) => {
  const r = await pool.query("SELECT * FROM clients WHERE id = $1", [id]);
  return r.rows[0] ?? null;
};

// ─── Stages ─────────────────────────────────────────────────────────────────

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

const getRoleByName = async (name) => {
  const r = await pool.query("SELECT * FROM roles WHERE name = $1", [name]);
  return r.rows[0] ?? null;
};

const getRoleById = async (id) => {
  const r = await pool.query("SELECT * FROM roles WHERE id = $1", [id]);
  return r.rows[0] ?? null;
};

// How many users currently carry this role name (used to block unsafe role deletion).
const countUsersByRole = async (roleName) => {
  const r = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = $1", [roleName]);
  return r.rows[0]?.n || 0;
};

const insertRole = async (name, displayName, isSystem, db = pool, isClient = false) => {
  const r = await db.query(
    "INSERT INTO roles (name, display_name, is_system, is_client) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, displayName, isSystem, !!isClient]
  );
  return { id: r.rows[0].id };
};

const updateRoleDisplayName = async (displayName, id) => {
  await pool.query("UPDATE roles SET display_name = $1 WHERE id = $2", [displayName, id]);
};

const updateRoleIsClient = async (isClient, id) => {
  await pool.query("UPDATE roles SET is_client = $1 WHERE id = $2", [!!isClient, id]);
};

// Optimistic-concurrency bump for role permission edits. Returns the NEW version,
// or null when expectedVersion is given and no longer matches (another admin
// saved first) — the caller turns that into a 409. With expectedVersion null it
// bumps unconditionally. Run inside the caller's transaction so the bump and the
// section/permission writes commit (or roll back) together.
const bumpRoleVersion = async (db, roleId, expectedVersion = null) => {
  if (Number.isInteger(expectedVersion)) {
    const r = await db.query(
      "UPDATE roles SET version = version + 1 WHERE id = $1 AND version = $2 RETURNING version",
      [roleId, expectedVersion]
    );
    return r.rows.length ? r.rows[0].version : null;
  }
  const r = await db.query(
    "UPDATE roles SET version = version + 1 WHERE id = $1 RETURNING version",
    [roleId]
  );
  return r.rows[0]?.version ?? null;
};

const deleteRole = async (id) => {
  const r = await pool.query("DELETE FROM roles WHERE id = $1 AND is_system = false", [id]);
  return { rowCount: r.rowCount };
};

// ─── Role sections ──────────────────────────────────────────────────────────

const getRoleSections = async (roleId, db = pool) => {
  const r = await db.query("SELECT * FROM role_sections WHERE role_id = $1", [roleId]);
  return r.rows;
};

const upsertRoleSection = async (roleId, sectionId, canRead, canWrite, db = pool) => {
  await db.query(
    `INSERT INTO role_sections (role_id, section_id, can_read, can_write) VALUES ($1, $2, $3, $4)
     ON CONFLICT (role_id, section_id) DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write`,
    [roleId, sectionId, canRead, canWrite]
  );
};

// ─── Role permissions ───────────────────────────────────────────────────────

const getRolePermissions = async (roleId) => {
  const r = await pool.query("SELECT * FROM role_permissions WHERE role_id = $1", [roleId]);
  return r.rows;
};

const upsertRolePermission = async (roleId, permission, granted, db = pool) => {
  await db.query(
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

const normalizeAssignmentSource = (source) => (source === "doctor" ? "doctor" : "manual");
const hasAssignmentSource = (value, source) => String(value || "").split("_").includes(source);

const upsertClientAssignment = async (userId, clientId, assignedBy, source = "manual", db = pool) => {
  const assignmentSource = normalizeAssignmentSource(source);
  if (assignmentSource === "manual") {
    await db.query(
      `INSERT INTO client_assignments (user_id, client_id, assigned_by, assignment_source)
       VALUES ($1, $2, $3, 'manual')
       ON CONFLICT (user_id, client_id) DO UPDATE
         SET assigned_by = EXCLUDED.assigned_by,
             assignment_source = CASE
               WHEN client_assignments.assignment_source LIKE '%doctor%' THEN 'manual_doctor'
               ELSE 'manual'
             END`,
      [userId, clientId, assignedBy]
    );
    return;
  }
  await db.query(
    `INSERT INTO client_assignments (user_id, client_id, assigned_by, assignment_source)
     VALUES ($1, $2, $3, 'doctor')
     ON CONFLICT (user_id, client_id) DO UPDATE
       SET assignment_source = CASE
             WHEN client_assignments.assignment_source LIKE '%manual%' THEN 'manual_doctor'
             ELSE 'doctor'
           END`,
    [userId, clientId, assignedBy]
  );
};

const getClientAssignment = async (userId, clientId) => {
  const r = await pool.query(
    "SELECT user_id, client_id, assignment_source FROM client_assignments WHERE user_id = $1 AND client_id = $2 LIMIT 1",
    [userId, clientId]
  );
  return r.rows[0] || null;
};

const deleteClientAssignmentCore = async (pgClient, userId, clientId) => {
    const current = await pgClient.query(
      "SELECT assignment_source FROM client_assignments WHERE user_id = $1 AND client_id = $2 FOR UPDATE",
      [userId, clientId]
    );
    const source = current.rows[0]?.assignment_source || "";
    if (!source) return { rowCount: 0 };
    if (hasAssignmentSource(source, "doctor")) {
      const r = await pgClient.query(
        "UPDATE client_assignments SET assignment_source = 'doctor' WHERE user_id = $1 AND client_id = $2 AND assignment_source LIKE '%manual%' RETURNING user_id",
        [userId, clientId]
      );
      return { rowCount: r.rowCount };
    }
    const r = await pgClient.query(
      "DELETE FROM client_assignments WHERE user_id = $1 AND client_id = $2 AND assignment_source = 'manual' RETURNING user_id",
      [userId, clientId]
    );
    return { rowCount: r.rowCount };
};

// db: pass a transaction client to run inside a caller-owned transaction.
const deleteClientAssignment = async (userId, clientId, db = null) => {
  if (db) return deleteClientAssignmentCore(db, userId, clientId);
  return withTransaction((pgClient) => deleteClientAssignmentCore(pgClient, userId, clientId));
};

const deleteDoctorClientAssignmentsCore = async (pgClient, userId, safeName) => {
    const candidates = await pgClient.query(
      `SELECT ca.client_id, ca.assignment_source
         FROM client_assignments ca
         JOIN stages old_stage ON old_stage.client_id = ca.client_id
        WHERE ca.user_id = $1
          AND ca.assignment_source LIKE '%doctor%'
          AND NULLIF(BTRIM(old_stage.doctor), '') IS NOT NULL
          AND LOWER(BTRIM(old_stage.doctor)) = LOWER(BTRIM($2))
          AND NOT EXISTS (
            SELECT 1
              FROM stages s
              JOIN doctors d ON d.user_id = ca.user_id
             WHERE s.client_id = ca.client_id
               AND NULLIF(BTRIM(s.doctor), '') IS NOT NULL
               AND LOWER(BTRIM(s.doctor)) = LOWER(BTRIM(d.name))
               AND LOWER(BTRIM(d.name)) <> LOWER(BTRIM($2))
          )
        FOR UPDATE OF ca`,
      [userId, safeName]
    );
    const touched = [];
    for (const row of candidates.rows) {
      touched.push({ client_id: row.client_id });
      if (hasAssignmentSource(row.assignment_source, "manual")) {
        await pgClient.query(
          "UPDATE client_assignments SET assignment_source = 'manual' WHERE user_id = $1 AND client_id = $2",
          [userId, row.client_id]
        );
      } else {
        await pgClient.query(
          "DELETE FROM client_assignments WHERE user_id = $1 AND client_id = $2 AND assignment_source = 'doctor'",
          [userId, row.client_id]
        );
      }
    }
    return touched;
};

// db: pass a transaction client to run inside a caller-owned transaction.
const deleteDoctorClientAssignments = async (userId, doctorName, db = null) => {
  const safeName = String(doctorName || "").trim();
  if (!safeName) return [];
  if (db) return deleteDoctorClientAssignmentsCore(db, userId, safeName);
  return withTransaction((pgClient) => deleteDoctorClientAssignmentsCore(pgClient, userId, safeName));
};

const replaceDoctorClientAssignmentsCore = async (pgClient, safeClientId, safeUserIds, assignedBy) => {
    const touched = new Set(safeUserIds);
    const doctorRemoved = await pgClient.query(
      `UPDATE client_assignments
          SET assignment_source = 'manual'
        WHERE client_id = $1
          AND assignment_source = 'manual_doctor'
          AND NOT (user_id = ANY($2::int[]))
        RETURNING user_id`,
      [safeClientId, safeUserIds]
    );
    const deleted = await pgClient.query(
      `DELETE FROM client_assignments
        WHERE client_id = $1
          AND assignment_source = 'doctor'
          AND NOT (user_id = ANY($2::int[]))
        RETURNING user_id`,
      [safeClientId, safeUserIds]
    );
    for (const row of [...doctorRemoved.rows, ...deleted.rows]) touched.add(Number(row.user_id));
    for (const userId of safeUserIds) {
      await pgClient.query(
        `INSERT INTO client_assignments (user_id, client_id, assigned_by, assignment_source)
         VALUES ($1, $2, $3, 'doctor')
         ON CONFLICT (user_id, client_id) DO UPDATE
           SET assignment_source = CASE
                 WHEN client_assignments.assignment_source LIKE '%manual%' THEN 'manual_doctor'
                 ELSE 'doctor'
               END`,
        [userId, safeClientId, assignedBy]
      );
    }
    return Array.from(touched);
};

// db: pass a transaction client to run inside a caller-owned transaction.
const replaceDoctorClientAssignments = async (clientId, userIds, assignedBy, db = null) => {
  const safeClientId = String(clientId || "").trim();
  if (!safeClientId) return [];
  const safeUserIds = Array.from(new Set(
    (Array.isArray(userIds) ? userIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)
  ));
  if (db) return replaceDoctorClientAssignmentsCore(db, safeClientId, safeUserIds, assignedBy);
  return withTransaction((pgClient) => replaceDoctorClientAssignmentsCore(pgClient, safeClientId, safeUserIds, assignedBy));
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

const decryptMessagePreview = (encryptedText) => {
  try {
    return encryptedText ? decryptText(encryptedText) : "";
  } catch (_) {
    return "";
  }
};

// ─── Messenger: chats ────────────────────────────────────────────────────────

const createChat = async ({ clientId = null, title, icon = "", createdBy, isInternal = false }) => {
  const safeTitle = String(title || "").trim() || "Чат";
  const safeIcon = String(icon || "").trim();
  const r = await pool.query(
    `INSERT INTO chats (client_id, is_internal, title, icon, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (client_id) WHERE (client_id IS NOT NULL AND is_internal = false)
     DO UPDATE SET title = chats.title   -- no-op so RETURNING yields the existing row
     RETURNING *`,
    [clientId || null, !!isInternal, safeTitle, safeIcon, createdBy]
  );
  return r.rows[0];
};

const getChatById = async (chatId) => {
  const r = await pool.query("SELECT * FROM chats WHERE id = $1", [chatId]);
  return r.rows[0] ?? null;
};

const getChatsByUser = async (userId) => {
  // If the user hid the chat's last_message (message_hidden_for_users),
  // lm.* comes back NULL and we do a per-chat fallback below.
  const r = await pool.query(
    `SELECT c.id, c.client_id, c.title, c.icon, c.created_at, c.updated_at, c.is_internal,
            cp.role_in_chat, cp.encrypted_chat_key, cp.is_pinned,
            c.last_message_id,
            lm.id            AS visible_id,
            lm.sender_id     AS visible_sender_id,
            lm.msg_type      AS visible_type,
            lm.encrypted_text AS visible_encrypted_text,
            lm.created_at    AS visible_at
     FROM chats c
     JOIN chat_participants cp ON cp.chat_id = c.id AND cp.user_id = $1
     LEFT JOIN messages lm
       ON lm.id = c.last_message_id
      AND NOT EXISTS (
        SELECT 1 FROM message_hidden_for_users h
        WHERE h.message_id = lm.id AND h.user_id = $1
      )
     ORDER BY cp.is_pinned DESC,
              COALESCE(c.last_message_at, c.created_at) DESC`,
    [userId]
  );

  const fallbackChats = r.rows
    .filter((row) => row.last_message_id != null && row.visible_id == null)
    .map((row) => row.id);

  const fallbackMap = new Map();
  if (fallbackChats.length > 0) {
    const fb = await pool.query(
      `SELECT DISTINCT ON (m.chat_id)
              m.chat_id, m.id, m.sender_id, m.msg_type, m.encrypted_text, m.created_at
       FROM messages m
       WHERE m.chat_id = ANY($1::int[])
         AND m.msg_type <> 'system'
         AND m.deleted_for_all = false
         AND NOT EXISTS (
           SELECT 1 FROM message_hidden_for_users h
           WHERE h.message_id = m.id AND h.user_id = $2
         )
       ORDER BY m.chat_id, m.id DESC`,
      [fallbackChats, userId]
    );
    for (const row of fb.rows) fallbackMap.set(row.chat_id, row);
  }

  return r.rows.map((row) => {
    const fb = fallbackMap.get(row.id);
    const visible = fb
      ? {
          id: fb.id,
          senderId: fb.sender_id,
          type: fb.msg_type,
          text: decryptMessagePreview(fb.encrypted_text),
          createdAt: fb.created_at,
        }
      : row.visible_id
        ? {
            id: row.visible_id,
            senderId: row.visible_sender_id,
            type: row.visible_type,
            text: decryptMessagePreview(row.visible_encrypted_text),
            createdAt: row.visible_at,
          }
        : null;

    return {
      id: row.id,
      client_id: row.client_id,
      title: row.title,
      icon: row.icon,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_internal: row.is_internal,
      role_in_chat: row.role_in_chat,
      encrypted_chat_key: row.encrypted_chat_key,
      is_pinned: row.is_pinned,
      last_message: visible,
    };
  });
};

const getLastMessageForChat = async (chatId, userId) => {
  const r = await pool.query(
    `SELECT c.last_message_id, c.last_message_at, c.last_message_sender_id,
            c.last_message_type, c.last_message_encrypted_text,
            CASE WHEN $2::int IS NULL THEN FALSE ELSE EXISTS (
              SELECT 1 FROM message_hidden_for_users h
              WHERE h.message_id = c.last_message_id AND h.user_id = $2
            ) END AS hidden_for_user
     FROM chats c WHERE c.id = $1`,
    [chatId, userId]
  );
  const row = r.rows[0];
  if (!row || !row.last_message_id) return null;

  if (row.hidden_for_user) {
    const fb = await pool.query(
      `SELECT id, sender_id, msg_type, encrypted_text, created_at
       FROM messages
       WHERE chat_id = $1
         AND msg_type <> 'system'
         AND deleted_for_all = false
         AND NOT EXISTS (
           SELECT 1 FROM message_hidden_for_users h
           WHERE h.message_id = messages.id AND h.user_id = $2
         )
       ORDER BY id DESC
       LIMIT 1`,
      [chatId, userId]
    );
    const f = fb.rows[0];
    if (!f) return null;
    return {
      id: f.id,
      senderId: f.sender_id,
      type: f.msg_type,
      text: decryptMessagePreview(f.encrypted_text),
      createdAt: f.created_at,
    };
  }

  return {
    id: row.last_message_id,
    senderId: row.last_message_sender_id,
    type: row.last_message_type,
    text: decryptMessagePreview(row.last_message_encrypted_text),
    createdAt: row.last_message_at,
  };
};

const updateChatMeta = async (chatId, patch = {}) => {
  const updates = [];
  const params = [];

  if (patch.title != null) {
    params.push(String(patch.title || "").trim() || "Чат");
    updates.push(`title = $${params.length}`);
  }
  if (patch.icon != null) {
    params.push(String(patch.icon || "").trim());
    updates.push(`icon = $${params.length}`);
  }
  if (updates.length === 0) return getChatById(chatId);

  params.push(chatId);
  const r = await pool.query(
    `UPDATE chats
     SET ${updates.join(", ")}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );
  return r.rows[0] ?? null;
};

const setChatPinned = async (chatId, userId, isPinned) => {
  const r = await pool.query(
    `UPDATE chat_participants
     SET is_pinned = $1
     WHERE chat_id = $2 AND user_id = $3
     RETURNING *`,
    [!!isPinned, chatId, userId]
  );
  return r.rows[0] ?? null;
};

// ─── Messenger: participants ──────────────────────────────────────────────────

const addChatParticipant = async (chatId, userId, roleInChat, encryptedChatKey = "", isPinned = false) => {
  const r = await pool.query(
    `INSERT INTO chat_participants (chat_id, user_id, role_in_chat, encrypted_chat_key, is_pinned)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (chat_id, user_id) DO UPDATE SET
       role_in_chat = EXCLUDED.role_in_chat,
       encrypted_chat_key = CASE
         WHEN EXCLUDED.encrypted_chat_key <> '' THEN EXCLUDED.encrypted_chat_key
         ELSE chat_participants.encrypted_chat_key
       END,
       is_pinned = CASE
         WHEN EXCLUDED.is_pinned = true THEN true
         ELSE chat_participants.is_pinned
       END
     RETURNING *`,
    [chatId, userId, roleInChat, encryptedChatKey || "", !!isPinned]
  );
  return r.rows[0];
};

const removeChatParticipant = async (chatId, userId) => {
  await pool.query("DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2", [chatId, userId]);
};

const getChatParticipants = async (chatId) => {
  const r = await pool.query(
    `SELECT cp.*, u.username, u.display_name, u.role
     FROM chat_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.chat_id = $1`,
    [chatId]
  );
  return r.rows;
};

const getChatParticipantsForChats = async (chatIds) => {
  if (!Array.isArray(chatIds) || chatIds.length === 0) return new Map();
  const r = await pool.query(
    `SELECT cp.*, u.username, u.display_name, u.role
     FROM chat_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.chat_id = ANY($1::int[])
     ORDER BY cp.chat_id, cp.id`,
    [chatIds]
  );
  const byChat = new Map();
  for (const row of r.rows) {
    const list = byChat.get(row.chat_id);
    if (list) list.push(row);
    else byChat.set(row.chat_id, [row]);
  }
  return byChat;
};

const getReceiptsForChats = async (chatIds) => {
  if (!Array.isArray(chatIds) || chatIds.length === 0) return new Map();
  const r = await pool.query(
    `SELECT chat_id, user_id, last_read_message_id, read_at
     FROM message_receipts
     WHERE chat_id = ANY($1::int[])
     ORDER BY chat_id`,
    [chatIds]
  );
  const byChat = new Map();
  for (const row of r.rows) {
    const entry = {
      user_id: row.user_id,
      last_read_message_id: row.last_read_message_id,
      read_at: row.read_at,
    };
    const list = byChat.get(row.chat_id);
    if (list) list.push(entry);
    else byChat.set(row.chat_id, [entry]);
  }
  return byChat;
};

const isParticipant = async (chatId, userId) => {
  const r = await pool.query(
    "SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2",
    [chatId, userId]
  );
  return r.rows.length > 0;
};

const getParticipantRole = async (chatId, userId) => {
  const r = await pool.query(
    "SELECT role_in_chat FROM chat_participants WHERE chat_id = $1 AND user_id = $2",
    [chatId, userId]
  );
  return r.rows[0]?.role_in_chat ?? null;
};

// ─── Messenger: messages ─────────────────────────────────────────────────────

// Atomically syncs chats.last_message_* with the latest visible-to-everyone
// message (or NULL when the chat is empty). LEFT JOIN LATERAL handles both
// cases in one statement — empty subquery yields NULLs that null out the row.
// Pass `client` to participate in caller's tx.
const applyChatLastMessage = async (executor, chatId) => {
  await executor.query(
    `UPDATE chats c
     SET last_message_id          = lm.id,
         last_message_at          = lm.created_at,
         last_message_sender_id   = lm.sender_id,
         last_message_type        = lm.msg_type,
         last_message_encrypted_text = lm.encrypted_text
     FROM (SELECT 1) _
     LEFT JOIN LATERAL (
       SELECT id, created_at, sender_id, msg_type, encrypted_text
       FROM messages
       WHERE chat_id = $1
         AND msg_type <> 'system'
         AND deleted_for_all = false
       ORDER BY id DESC
       LIMIT 1
     ) lm ON true
     WHERE c.id = $1`,
    [chatId]
  );
};

const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const insertMessage = async (chatId, senderId, encryptedText, encryptedMeta, msgType, fileId, clientMessageId = "", replyToMessageId = null) => {
  const safeClientMessageId = String(clientMessageId || "");
  return withTransaction(async (client) => {
    if (safeClientMessageId) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
        [`message:${chatId}:${senderId}:${safeClientMessageId}`]
      );
      const existing = await client.query(
        `SELECT *, encrypted_text AS ciphertext, encrypted_meta AS iv
         FROM messages
         WHERE chat_id = $1 AND sender_id = $2 AND client_message_id = $3
         ORDER BY id DESC
         LIMIT 1`,
        [chatId, senderId, safeClientMessageId]
      );
      if (existing.rows[0]) return { ...existing.rows[0], __existing: true };
    }
    const inserted = await client.query(
      `INSERT INTO messages (chat_id, sender_id, encrypted_text, encrypted_meta, msg_type, file_id, client_message_id, reply_to_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
      [chatId, senderId, encryptedText, encryptedMeta, msgType, fileId || null, safeClientMessageId, replyToMessageId || null]
    );
    if (msgType !== "system") {
      await applyChatLastMessage(client, chatId);
    }
    return { ...inserted.rows[0], __existing: false };
  });
};

const getMessageById = async (chatId, messageId) => {
  const r = await pool.query(
    `SELECT m.*, m.encrypted_text AS ciphertext, m.encrypted_meta AS iv,
            u.username AS sender_username, u.display_name AS sender_display_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = $1 AND m.id = $2
     LIMIT 1`,
    [chatId, messageId]
  );
  return r.rows[0] ?? null;
};

const updateMessageContent = async (chatId, messageId, encryptedText, encryptedMeta = "") => {
  return withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE messages
       SET encrypted_text = $3, encrypted_meta = $4, edited_at = NOW()
       WHERE chat_id = $1 AND id = $2 AND deleted_for_all = false
       RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
      [chatId, messageId, encryptedText, encryptedMeta]
    );
    const row = r.rows[0] ?? null;
    if (row) {
      await client.query(
        `UPDATE chats SET last_message_encrypted_text = $2
         WHERE id = $1 AND last_message_id = $3`,
        [chatId, encryptedText, messageId]
      );
    }
    return row;
  });
};

const deleteMessageForAll = async (chatId, messageId, deletedBy) => {
  return withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE messages
       SET deleted_for_all = true,
           deleted_for_all_at = NOW(),
           deleted_by = $3
       WHERE chat_id = $1 AND id = $2 AND deleted_for_all = false
       RETURNING *`,
      [chatId, messageId, deletedBy]
    );
    const row = r.rows[0] ?? null;
    if (row) {
      await applyChatLastMessage(client, chatId);
    }
    return row;
  });
};

const hideMessageForUser = async (messageId, userId) => {
  await pool.query(
    `INSERT INTO message_hidden_for_users (message_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, userId]
  );
};

const getMessagesByIds = async (chatId, ids) => {
  if (!ids || ids.length === 0) return [];
  const r = await pool.query(
    `SELECT id, sender_id, deleted_for_all FROM messages WHERE chat_id = $1 AND id = ANY($2::int[])`,
    [chatId, ids]
  );
  return r.rows;
};

const deleteMessagesForAllBulk = async (chatId, ids, deletedBy) => {
  return withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE messages
         SET deleted_for_all = true,
             deleted_for_all_at = NOW(),
             deleted_by = $3
       WHERE chat_id = $1 AND id = ANY($2::int[]) AND deleted_for_all = false
       RETURNING id`,
      [chatId, ids, deletedBy]
    );
    const deletedIds = r.rows.map((row) => row.id);
    if (deletedIds.length > 0) {
      await applyChatLastMessage(client, chatId);
    }
    return deletedIds;
  });
};

const hideMessagesForUserBulk = async (chatId, userId, ids) => {
  if (!ids || ids.length === 0) return 0;
  const r = await pool.query(
    `INSERT INTO message_hidden_for_users (message_id, user_id)
     SELECT m.id, $2
       FROM messages m
      WHERE m.chat_id = $1 AND m.id = ANY($3::int[])
     ON CONFLICT (message_id, user_id) DO NOTHING
     RETURNING message_id`,
    [chatId, userId, ids]
  );
  return r.rows.length;
};

// ─── Sub-project A: pin helpers ──────────────────────────────────────────────

const PIN_FOR_ALL_LIMIT = 5;
const PIN_FOR_ME_LIMIT = 5;

const countPinnedForAll = async (chatId) => {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS c FROM messages WHERE chat_id = $1 AND pinned_at IS NOT NULL AND deleted_for_all = false",
    [chatId]
  );
  return r.rows[0]?.c || 0;
};

const pinMessageForAll = async (chatId, messageId) => {
  const r = await pool.query(
    `UPDATE messages
       SET pinned_at = NOW()
     WHERE chat_id = $1 AND id = $2 AND deleted_for_all = false AND pinned_at IS NULL
       AND (
         SELECT COUNT(*)::int
           FROM messages
          WHERE chat_id = $1 AND pinned_at IS NOT NULL AND deleted_for_all = false
       ) < $3
     RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
    [chatId, messageId, PIN_FOR_ALL_LIMIT]
  );
  return r.rows[0] ?? null;
};

const unpinMessageForAll = async (chatId, messageId) => {
  const r = await pool.query(
    `UPDATE messages
       SET pinned_at = NULL
     WHERE chat_id = $1 AND id = $2 AND pinned_at IS NOT NULL
     RETURNING id`,
    [chatId, messageId]
  );
  return !!r.rows[0];
};

const listPinnedForAll = async (chatId, limit = PIN_FOR_ALL_LIMIT) => {
  const r = await pool.query(
    `SELECT m.*, m.encrypted_text AS ciphertext, m.encrypted_meta AS iv,
            u.username AS sender_username, u.display_name AS sender_display_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1 AND m.pinned_at IS NOT NULL AND m.deleted_for_all = false
      ORDER BY m.pinned_at DESC
      LIMIT $2`,
    [chatId, limit]
  );
  return r.rows;
};

const countPinnedForUser = async (chatId, userId) => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM message_pinned_for_users mpu
       JOIN messages m ON m.id = mpu.message_id
      WHERE mpu.user_id = $1 AND m.chat_id = $2 AND m.deleted_for_all = false`,
    [userId, chatId]
  );
  return r.rows[0]?.c || 0;
};

const pinMessageForUser = async (userId, messageId) => {
  const r = await pool.query(
    `INSERT INTO message_pinned_for_users (user_id, message_id)
     SELECT $1, $2
      WHERE (
        SELECT COUNT(*)::int
          FROM message_pinned_for_users mpu
          JOIN messages m ON m.id = mpu.message_id
         WHERE mpu.user_id = $1 AND m.chat_id = (
           SELECT chat_id FROM messages WHERE id = $2
         ) AND m.deleted_for_all = false
      ) < $3
     ON CONFLICT (user_id, message_id) DO NOTHING
     RETURNING pinned_at`,
    [userId, messageId, PIN_FOR_ME_LIMIT]
  );
  return r.rows[0] ?? null;
};

const unpinMessageForUser = async (userId, messageId) => {
  const r = await pool.query(
    `DELETE FROM message_pinned_for_users
      WHERE user_id = $1 AND message_id = $2
      RETURNING message_id`,
    [userId, messageId]
  );
  return !!r.rows[0];
};

const listPinnedForUser = async (chatId, userId, limit = PIN_FOR_ME_LIMIT) => {
  const r = await pool.query(
    `SELECT m.*, m.encrypted_text AS ciphertext, m.encrypted_meta AS iv,
            u.username AS sender_username, u.display_name AS sender_display_name,
            mpu.pinned_at AS personal_pinned_at
       FROM message_pinned_for_users mpu
       JOIN messages m ON m.id = mpu.message_id
       JOIN users u ON u.id = m.sender_id
      WHERE mpu.user_id = $1 AND m.chat_id = $2 AND m.deleted_for_all = false
      ORDER BY mpu.pinned_at DESC
      LIMIT $3`,
    [userId, chatId, limit]
  );
  return r.rows;
};

const getMessages = async (chatId, userId, beforeId, limit) => {
  const lim = Math.min(limit || 50, 100);
  let query, params;
  if (beforeId) {
    query = `
      SELECT m.*, m.encrypted_text AS ciphertext, m.encrypted_meta AS iv,
             u.username AS sender_username, u.display_name AS sender_display_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1
        AND m.deleted_for_all = false
        AND m.id < $3
        AND NOT EXISTS (
          SELECT 1 FROM message_hidden_for_users mh
          WHERE mh.message_id = m.id AND mh.user_id = $2
        )
      ORDER BY m.id DESC
      LIMIT $4
    `;
    params = [chatId, userId, beforeId, lim];
  } else {
    query = `
      SELECT m.*, m.encrypted_text AS ciphertext, m.encrypted_meta AS iv,
             u.username AS sender_username, u.display_name AS sender_display_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1
        AND m.deleted_for_all = false
        AND NOT EXISTS (
          SELECT 1 FROM message_hidden_for_users mh
          WHERE mh.message_id = m.id AND mh.user_id = $2
        )
      ORDER BY m.id DESC
      LIMIT $3
    `;
    params = [chatId, userId, lim];
  }
  const r = await pool.query(query, params);
  return r.rows.reverse();
};

const fetchMessagesForSearchInChat = async (chatId, userId, beforeId, batchSize) => {
  const lim = Math.min(batchSize || 200, 500);
  if (beforeId) {
    const r = await pool.query(
      `SELECT m.id, m.chat_id, m.sender_id, m.encrypted_text, m.encrypted_meta, m.msg_type,
              m.created_at, u.username AS sender_username, u.display_name AS sender_display_name
         FROM messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.chat_id = $1
          AND m.deleted_for_all = false
          AND m.id < $3
          AND NOT EXISTS (SELECT 1 FROM message_hidden_for_users mh WHERE mh.message_id = m.id AND mh.user_id = $2)
        ORDER BY m.id DESC
        LIMIT $4`,
      [chatId, userId, beforeId, lim]
    );
    return r.rows;
  }
  const r = await pool.query(
    `SELECT m.id, m.chat_id, m.sender_id, m.encrypted_text, m.encrypted_meta, m.msg_type,
            m.created_at, u.username AS sender_username, u.display_name AS sender_display_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1
        AND m.deleted_for_all = false
        AND NOT EXISTS (SELECT 1 FROM message_hidden_for_users mh WHERE mh.message_id = m.id AND mh.user_id = $2)
      ORDER BY m.id DESC
      LIMIT $3`,
    [chatId, userId, lim]
  );
  return r.rows;
};

const fetchMessagesForSearchGlobal = async (userId, beforeId, batchSize) => {
  const lim = Math.min(batchSize || 300, 500);
  if (beforeId) {
    const r = await pool.query(
      `SELECT m.id, m.chat_id, m.sender_id, m.encrypted_text, m.encrypted_meta, m.msg_type,
              m.created_at, u.username AS sender_username, u.display_name AS sender_display_name,
              c.title AS chat_title
         FROM messages m
         JOIN chat_participants cp ON cp.chat_id = m.chat_id AND cp.user_id = $1
         JOIN chats c ON c.id = m.chat_id
         JOIN users u ON u.id = m.sender_id
        WHERE m.deleted_for_all = false
          AND m.id < $2
          AND NOT EXISTS (SELECT 1 FROM message_hidden_for_users mh WHERE mh.message_id = m.id AND mh.user_id = $1)
        ORDER BY m.id DESC
        LIMIT $3`,
      [userId, beforeId, lim]
    );
    return r.rows;
  }
  const r = await pool.query(
    `SELECT m.id, m.chat_id, m.sender_id, m.encrypted_text, m.encrypted_meta, m.msg_type,
            m.created_at, u.username AS sender_username, u.display_name AS sender_display_name,
            c.title AS chat_title
       FROM messages m
       JOIN chat_participants cp ON cp.chat_id = m.chat_id AND cp.user_id = $1
       JOIN chats c ON c.id = m.chat_id
       JOIN users u ON u.id = m.sender_id
      WHERE m.deleted_for_all = false
        AND NOT EXISTS (SELECT 1 FROM message_hidden_for_users mh WHERE mh.message_id = m.id AND mh.user_id = $1)
      ORDER BY m.id DESC
      LIMIT $2`,
    [userId, lim]
  );
  return r.rows;
};

// ─── Messenger: read receipts ─────────────────────────────────────────────────

const upsertReceipt = async (chatId, userId, messageId) => {
  await pool.query(
    `INSERT INTO message_receipts (chat_id, user_id, last_read_message_id, read_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (chat_id, user_id) DO UPDATE
       SET last_read_message_id = GREATEST(message_receipts.last_read_message_id, EXCLUDED.last_read_message_id),
           read_at = NOW()`,
    [chatId, userId, messageId]
  );
};

const getReceiptsByChat = async (chatId) => {
  const r = await pool.query(
    "SELECT user_id, last_read_message_id, read_at FROM message_receipts WHERE chat_id = $1",
    [chatId]
  );
  return r.rows;
};

const getReadersForMessage = async (chatId, messageId) => {
  const r = await pool.query(
    `SELECT mr.user_id        AS "userId",
            COALESCE(NULLIF(u.display_name, ''), u.username) AS name,
            NULL::text        AS avatar,
            mr.read_at        AS "readAt"
     FROM message_receipts mr
     JOIN users u ON u.id = mr.user_id
     WHERE mr.chat_id = $1
       AND mr.last_read_message_id >= $2
       AND mr.user_id <> (SELECT sender_id FROM messages WHERE id = $2)
     ORDER BY mr.read_at ASC`,
    [chatId, messageId]
  );
  return r.rows;
};

// ─── Analytics files ─────────────────────────────────────────────────────────

const insertAnalyticsFile = async (clientId, displayName, analysisDate, comment, originalName, mimeType, sizeBytes, storagePath, uploadedBy) => {
  const r = await pool.query(
    `INSERT INTO analytics_files (client_id, display_name, analysis_date, comment, original_name, mime_type, size_bytes, storage_path, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [clientId, displayName, analysisDate, comment, originalName, mimeType, sizeBytes, storagePath, uploadedBy || null]
  );
  return r.rows[0];
};

const getAnalyticsFilesByClient = async (clientId) => {
  const r = await pool.query(
    "SELECT * FROM analytics_files WHERE client_id = $1 ORDER BY created_at DESC",
    [clientId]
  );
  return r.rows;
};

const getAnalyticsFileById = async (id) => {
  const r = await pool.query("SELECT * FROM analytics_files WHERE id = $1", [id]);
  return r.rows[0] ?? null;
};

const updateAnalyticsFile = async (id, displayName, analysisDate, comment) => {
  const r = await pool.query(
    "UPDATE analytics_files SET display_name = $2, analysis_date = $3, comment = $4 WHERE id = $1 RETURNING *",
    [id, displayName, analysisDate, comment]
  );
  return r.rows[0] ?? null;
};

const deleteAnalyticsFile = async (id) => {
  const r = await pool.query("DELETE FROM analytics_files WHERE id = $1 RETURNING *", [id]);
  return r.rows[0] ?? null;
};

// ─── Messenger: files ────────────────────────────────────────────────────────

const insertChatFile = async (id, chatId, uploaderId, originalName, mimeType, sizeBytes, storagePath) => {
  const r = await pool.query(
    `INSERT INTO chat_files (id, chat_id, uploader_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, chatId, uploaderId, originalName, mimeType, sizeBytes, storagePath]
  );
  return r.rows[0];
};

const getChatFile = async (fileId) => {
  const r = await pool.query("SELECT * FROM chat_files WHERE id = $1", [fileId]);
  return r.rows[0] ?? null;
};

module.exports = {
  pool, withTransaction, ensureAppDbRole,
  initSchema,
  // users
  getUser, listUsers, createUser, hasAllClientsAccess,
  // clients
  deleteClient, getClientById,
  // stages
  listClientIdsByDoctorName,
  // doctors
  insertDoctor, listDoctors, getDoctorByName,
  // roles
  getRoleByName, getRoleById, countUsersByRole, insertRole, updateRoleDisplayName, updateRoleIsClient, bumpRoleVersion, deleteRole,
  // role sections
  getRoleSections, upsertRoleSection,
  // role permissions
  getRolePermissions, upsertRolePermission,
  // reference data
  listRefData, insertRefData, updateRefData, deleteRefData, listDistinctAnalyticsMarkers,
  // client assignments
  upsertClientAssignment, deleteClientAssignment, getClientAssignment, deleteDoctorClientAssignments, replaceDoctorClientAssignments,
  getAssignmentsByUser, getAssignmentsByClient,
  // messenger: chats
  createChat, getChatById, getChatsByUser, getLastMessageForChat, updateChatMeta, setChatPinned,
  // messenger: participants
  addChatParticipant, removeChatParticipant, getChatParticipants, getChatParticipantsForChats, isParticipant, getParticipantRole,
  // messenger: messages
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser, getMessages,
  getMessagesByIds, deleteMessagesForAllBulk, hideMessagesForUserBulk,
  PIN_FOR_ALL_LIMIT, PIN_FOR_ME_LIMIT,
  countPinnedForAll, pinMessageForAll, unpinMessageForAll, listPinnedForAll,
  countPinnedForUser, pinMessageForUser, unpinMessageForUser, listPinnedForUser,
  fetchMessagesForSearchInChat, fetchMessagesForSearchGlobal,
  // messenger: receipts
  upsertReceipt, getReceiptsByChat, getReceiptsForChats, getReadersForMessage,
  // messenger: files
  insertChatFile, getChatFile,
  // analytics files
  insertAnalyticsFile, getAnalyticsFilesByClient, getAnalyticsFileById, updateAnalyticsFile, deleteAnalyticsFile,
};
