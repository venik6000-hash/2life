# «Моя волна» (Pulse-Wave) + WHOOP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a daily momentum-curve wellbeing feature whose objective half auto-fills from each client's WHOOP band (recovery/HRV/RHR/sleep/strain/weight), whose subjective half is a 1-tap mood, and whose deterministic inflection flags prompt the client's personal doctor to react — with a full manual check-in fallback for clients without WHOOP.

**Architecture:** Two phases in one build. **Phase 1** is the WHOOP-independent base: dedicated `wave_checkins`/`wave_reactions`/`wave_flags` tables, a pure `waveMath` module (momentum + inflection, no AI), a `waveStore` service + `routes/wave.js`, a client lane in the existing journal scheduler, and a `Wave.jsx` section with a hand-rolled SVG curve. **Phase 2** layers WHOOP on top: one `integration_connections` table (AES-GCM-encrypted OAuth tokens via the existing `messengerCrypto`), a `whoopClient` (OAuth + v2 fetchers), a `whoopStore` (sync + mapping into `wave_checkins.objective`), webhook + reconcile ingestion, per-metric flags, and WHOOP UI (connect/disconnect + mood-tap + recovery hero line). Authorization reuses `canAccessClient` + `requireSectionRead/Write("wave")`.

**Tech Stack:** Node/Express, PostgreSQL (`pg`), React 18 + Vite (JSX), web-push + WebSocket (wired), Node `crypto` (aes-256-gcm via `messengerCrypto`), `node:assert` verify scripts. **No AI. No charting library** (hand-rolled SVG).

**Spec:** `docs/superpowers/specs/2026-06-16-pulse-wave-whoop-design.md`

**Decided daily subjective set:** manual clients log `energy`(Энергия), `sleep`(Сон), `mood`(Настроение), `focus`(Фокус), `calm`(Спокойствие) — all 1–5, higher-is-better. WHOOP clients log only `mood` (1 tap). Momentum (subjective) = mean of present scores.

**Decided WHOOP objective set (Phase 2):** `recovery`(%), `rhr_bpm`, `hrv_ms`, `sleep_perf`(%), `respiratory_rate`, `strain`, `weight`(kg). Hero line = `recovery`. Flags on `recovery↓`/`sleep_perf↓`/`hrv_ms↓`/`rhr_bpm↑`; `strain` = context only.

---

## Verified anchors (do not re-discover)

- Migrations: `runOnce("key", async (c)=>{...})` inside `initSchema()` in `server/services/db.js` (append after the existing `runOnce` sequence; `clients.id` is **TEXT**).
- Auth middleware: `server/middleware/auth.js` exports `requireAuth`, `requireSectionRead`, `requireSectionWrite`.
- Client authorization: `canAccessClient(user, clientId)` in `server/services/clientAccess.js` (already covers client-owns-own-record via `client_assignments`; there is **no** `users.client_id` column).
- At-rest encryption: `server/services/messengerCrypto.js` exports `encryptText(str)→base64` / `decryptText(base64)→str` (aes-256-gcm; key from `process.env.MESSENGER_ENCRYPTION_SECRET`).
- Scheduler: `startJournalNotificationScheduler()` in `server/services/journalNotifications.js` (a `setInterval` tick with a `now.getHours()===9 && now.getMinutes()<5` block).
- Notification dedup: `wasJournalNotificationDelivered({userId,kind,deliveryKey})` / `recordJournalNotificationDelivery({...})` from `server/services/journalStore.js` (table `journal_notification_deliveries`, `UNIQUE(user_id,kind,delivery_key)`).
- Delivery: `sendPushToUsers({userIds,title,body,url})` in `server/services/messengerPush.js`; `sendTo(userId,obj)` in `server/services/ws.js`.
- Express: `app.use(express.json({ limit:"50mb" }))` at `server/index.js:52`; routers mounted via `app.use("/api", xRouter)` (block around `server/index.js:62-70`).
- Frontend: `SECTIONS` array at `src/context/DashboardContext.jsx:9` (`{id,ic,lb}`); `isClientRole(userOrRole)` exported there; `useDashboard()` provides `cid`. `src/dashboard.jsx`: top-of-file `const XSection = lazy(()=>import("./sections/X"))`, `sectionRenderers` map at `src/dashboard.jsx:248`, rendered by `sectionRenderers[activeSectionId]`. Theme tokens via `useTheme()` `$` (`bgC,bgI,brd,tx,txS,txM,ac,acD,dn,wr`). `authFetch` from `useAuth()`.
- WHOOP API v2 (verified 2026-06-16): authorize `https://api.prod.whoop.com/oauth/oauth2/auth`; token `https://api.prod.whoop.com/oauth/oauth2/token`; data base `https://api.prod.whoop.com/developer` + `/v2/recovery`, `/v2/activity/sleep`, `/v2/cycle` (**confirm the `/developer` prefix on first live call**). Bearer auth. Scopes: `read:recovery read:sleep read:cycles read:workout read:body_measurement read:profile offline`. Recovery `score.{recovery_score,resting_heart_rate,hrv_rmssd_milli,spo2_percentage,skin_temp_celsius}`; Sleep `score.{sleep_performance_percentage,sleep_efficiency_percentage,respiratory_rate}`; Cycle `score.{strain,average_heart_rate,max_heart_rate}`. Webhook headers `X-WHOOP-Signature` + `X-WHOOP-Signature-Timestamp`; verify `base64(HMAC_SHA256(timestamp + rawBody, client_secret))`; payload `{user_id,id,type,trace_id}`; events `recovery.updated|sleep.updated|workout.updated` (+`.deleted`).

## File structure

| File | New/Modify | Responsibility |
|---|---|---|
| `server/services/db.js` | Modify | `runOnce` migrations: wave tables (P1) + `integration_connections` (P2) + `role_sections` seed for `wave`. |
| `server/services/waveMath.js` | Create (P1) + Modify (P2) | Pure momentum + inflection. P2 adds per-metric objective inflection. No AI. |
| `server/services/waveStore.js` | Create (P1) | wave CRUD + scheduler queries + flags/reactions. |
| `server/routes/wave.js` | Create (P1) | Client + doctor HTTP endpoints, guarded. |
| `server/services/journalNotifications.js` | Modify (P1+P2) | Client wave reminder + inflection scan (P1) + WHOOP reconcile (P2). |
| `server/index.js` | Modify (P1+P2) | Mount routers; add raw-body capture for webhook (P2). |
| `src/utils/waveCurve.js` | Create (P1) | Pure SVG-polyline + delta math. |
| `src/sections/Wave.jsx` | Create (P1) + Modify (P2) | Section UI: check-in + curve + doctor flags/reactions (P1); WHOOP connect/disconnect + mood-tap + recovery hero (P2). |
| `src/context/DashboardContext.jsx` | Modify (P1) | Register `wave` in `SECTIONS`. |
| `src/dashboard.jsx` | Modify (P1) | Lazy-import + `sectionRenderers.wave`. |
| `server/services/whoopClient.js` | Create (P2) | OAuth URLs, token exchange/refresh, v2 fetchers, payload→objective map. |
| `server/services/whoopStore.js` | Create (P2) | `integration_connections` CRUD (encrypted) + sync/backfill orchestration. |
| `server/routes/whoop.js` | Create (P2) | connect / callback / webhook / disconnect. |
| Verify/smoke scripts | Create | see each task. |
| `package.json`, `server/package.json` | Modify | wire `verify:wave-*` / `verify:whoop-*` / `smoke:*`. |

**Dev DB for smoke scripts:** `DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@localhost:5434/2life` (compose `db` service on host port 5434; `$POSTGRES_PASSWORD` from `.env`).

---

# PHASE 1 — Base «Моя волна» (WHOOP-independent, shippable)

## Task 1: Database migrations (wave tables + permissions)

**Files:**
- Modify: `server/services/db.js` (inside `initSchema()`, after the existing `runOnce(...)` sequence)

- [ ] **Step 1: Add the migrations**

Append to the `runOnce` sequence in `initSchema()`:

```javascript
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
      CREATE INDEX IF NOT EXISTS idx_wave_checkins_client ON wave_checkins(client_id, checkin_date);

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
        UNIQUE(client_id, flag_date, kind)
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
```

Rationale: clients need `can_write` on `wave` to log their own check-ins (the route additionally enforces `canAccessClient`); staff need read+write to react; `admin` bypasses permissions so needs no row. The `objective`/`source`/`ingested_at` columns are created now (harmless for manual clients) so Phase 2 needs no `ALTER`.

- [ ] **Step 2: Verify the module parses and boots**

Run: `node -e "require('./server/services/db.js'); console.log('db module loads')"`
Expected: prints `db module loads`, no syntax error.

- [ ] **Step 3: Commit**

```bash
git add server/services/db.js
git commit -m "feat(wave): wave_checkins/reactions/flags tables (+objective cols) + role_sections seed"
```

---

## Task 2: Pure momentum + inflection math (`waveMath.js`) — TDD

**Files:**
- Create: `server/services/waveMath.js`
- Test: `server/scripts/verifyWaveInflection.js`

- [ ] **Step 1: Write the failing test**

Create `server/scripts/verifyWaveInflection.js`:

```javascript
const assert = require("node:assert/strict");
const { METRIC_KEYS, computeDayMomentum, detectInflection } = require("../services/waveMath");

assert.deepEqual(METRIC_KEYS, ["energy", "sleep", "mood", "focus", "calm"]);

assert.equal(computeDayMomentum({ energy: 4, sleep: 3, mood: 5, focus: 4, calm: 4 }), 4);
assert.equal(computeDayMomentum({ energy: 2, sleep: 3 }), 2.5);
assert.equal(computeDayMomentum({ energy: 5, junk: 99 }), 5);
assert.equal(computeDayMomentum({}), null);

const rising = [
  { date: "2026-06-01", value: 2.0 }, { date: "2026-06-02", value: 2.2 },
  { date: "2026-06-03", value: 2.1 }, { date: "2026-06-04", value: 3.0 },
  { date: "2026-06-05", value: 3.4 }, { date: "2026-06-06", value: 3.6 },
];
const up = detectInflection(rising);
assert.ok(up.some((f) => f.kind === "inflection_up"), "expected inflection_up");
assert.ok(up.every((f) => f.flag_date === "2026-06-06"), "flags pinned to latest day");

const falling = rising.map((d, i) => ({ date: d.date, value: 4.5 - i * 0.5 }));
assert.ok(detectInflection(falling).some((f) => f.kind === "inflection_down"));

const low = [{ date: "2026-06-05", value: 3 }, { date: "2026-06-06", value: 1.8 }];
assert.ok(detectInflection(low).some((f) => f.kind === "severe_low"));

assert.deepEqual(detectInflection([{ date: "2026-06-06", value: 4 }]), []);

console.log("wave inflection ok");
```

- [ ] **Step 2: Run to verify it fails**

Run: `node server/scripts/verifyWaveInflection.js`
Expected: FAIL — `Cannot find module '../services/waveMath'`.

- [ ] **Step 3: Implement `waveMath.js`**

Create `server/services/waveMath.js`:

```javascript
// Pure, deterministic, NO AI.
const METRIC_KEYS = ["energy", "sleep", "mood", "focus", "calm"];
const round2 = (n) => Math.round(n * 100) / 100;

function computeDayMomentum(scores) {
  if (!scores || typeof scores !== "object") return null;
  const vals = [];
  for (const key of METRIC_KEYS) {
    const v = Number(scores[key]);
    if (Number.isFinite(v) && v >= 1 && v <= 5) vals.push(v);
  }
  if (!vals.length) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// series: [{date, value}] ascending. Returns flags for the LATEST day. Deterministic.
function detectInflection(series, opts = {}) {
  const { window = 3, threshold = 0.8, severeLow = 2 } = opts;
  const clean = (series || []).filter((d) => Number.isFinite(Number(d.value)));
  if (!clean.length) return [];
  const latest = clean[clean.length - 1];
  const flags = [];
  if (Number(latest.value) <= severeLow) {
    flags.push({ flag_date: latest.date, kind: "severe_low", metric: "", magnitude: round2(Number(latest.value)) });
  }
  if (clean.length >= window * 2) {
    const recent = mean(clean.slice(-window).map((d) => Number(d.value)));
    const prior = mean(clean.slice(-window * 2, -window).map((d) => Number(d.value)));
    const delta = round2(recent - prior);
    if (delta <= -threshold) flags.push({ flag_date: latest.date, kind: "inflection_down", metric: "", magnitude: delta });
    else if (delta >= threshold) flags.push({ flag_date: latest.date, kind: "inflection_up", metric: "", magnitude: delta });
  }
  return flags;
}

module.exports = { METRIC_KEYS, computeDayMomentum, detectInflection };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node server/scripts/verifyWaveInflection.js`
Expected: PASS — prints `wave inflection ok`.

- [ ] **Step 5: Commit**

```bash
git add server/services/waveMath.js server/scripts/verifyWaveInflection.js
git commit -m "feat(wave): pure momentum + inflection math with unit test"
```

---

## Task 3: `waveStore.js` service + DB-backed smoke

**Files:**
- Create: `server/services/waveStore.js`
- Test: `server/scripts/smokeWaveStore.js`

- [ ] **Step 1: Implement `waveStore.js`**

Create `server/services/waveStore.js`:

```javascript
const { pool } = require("./db");
const { METRIC_KEYS, computeDayMomentum, detectInflection } = require("./waveMath");

const isoDate = (d) => (d instanceof Date
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : String(d).slice(0, 10));

const sanitizeScores = (raw) => {
  const out = {};
  for (const key of METRIC_KEYS) {
    const v = Math.round(Number(raw?.[key]));
    if (Number.isFinite(v) && v >= 1 && v <= 5) out[key] = v;
  }
  return out;
};

function rowToCheckin(row) {
  if (!row) return null;
  return {
    date: isoDate(row.checkin_date),
    scores: row.scores || {},
    contextTags: row.context_tags || [],
    weight: row.weight == null ? null : Number(row.weight),
    restingHr: row.resting_hr == null ? null : Number(row.resting_hr),
    note: row.note || "",
    objective: row.objective || {},
    source: row.source || "manual",
    momentum: computeDayMomentum(row.scores || {}),
  };
}

async function upsertCheckin({ clientId, userId, date, scores, contextTags = [], weight = null, restingHr = null, note = "" }) {
  const cleanScores = sanitizeScores(scores);
  const tags = Array.isArray(contextTags) ? contextTags.map(String).slice(0, 12) : [];
  const w = weight == null || weight === "" ? null : Number(weight);
  const hr = restingHr == null || restingHr === "" ? null : Math.round(Number(restingHr));
  const res = await pool.query(
    `INSERT INTO wave_checkins (client_id, user_id, checkin_date, scores, context_tags, weight, resting_hr, note)
     VALUES ($1,$2,$3::date,$4::jsonb,$5::jsonb,$6,$7,$8)
     ON CONFLICT (client_id, checkin_date) DO UPDATE
       SET scores = EXCLUDED.scores, context_tags = EXCLUDED.context_tags, weight = EXCLUDED.weight,
           resting_hr = EXCLUDED.resting_hr, note = EXCLUDED.note, user_id = EXCLUDED.user_id, updated_at = now()
     RETURNING *`,
    [clientId, userId, isoDate(date), JSON.stringify(cleanScores), JSON.stringify(tags),
     Number.isFinite(w) ? w : null, Number.isFinite(hr) ? hr : null, String(note || "")]
  );
  return rowToCheckin(res.rows[0]);
}

async function getCheckin(clientId, date) {
  const res = await pool.query(
    "SELECT * FROM wave_checkins WHERE client_id = $1 AND checkin_date = $2::date LIMIT 1",
    [clientId, isoDate(date)]);
  return rowToCheckin(res.rows[0]);
}

async function getSeries(clientId, fromDate, toDate) {
  const res = await pool.query(
    `SELECT * FROM wave_checkins WHERE client_id = $1 AND checkin_date BETWEEN $2::date AND $3::date
     ORDER BY checkin_date ASC`, [clientId, isoDate(fromDate), isoDate(toDate)]);
  return res.rows.map(rowToCheckin);
}

async function listReactions(clientId) {
  const res = await pool.query(
    "SELECT id, pinned_date, kind, text FROM wave_reactions WHERE client_id = $1 ORDER BY pinned_date ASC, id ASC",
    [clientId]);
  return res.rows.map((r) => ({ id: r.id, pinnedDate: isoDate(r.pinned_date), kind: r.kind, text: r.text || "" }));
}

async function addReaction({ clientId, authorUserId, pinnedDate, kind, text = "" }) {
  const safeKind = kind === "note" ? "note" : "ack";
  const res = await pool.query(
    `INSERT INTO wave_reactions (client_id, author_user_id, pinned_date, kind, text)
     VALUES ($1,$2,$3::date,$4,$5) RETURNING *`,
    [clientId, authorUserId, isoDate(pinnedDate), safeKind, String(text || "")]);
  await pool.query(
    "UPDATE wave_flags SET status='addressed' WHERE client_id=$1 AND flag_date=$2::date AND status='open'",
    [clientId, isoDate(pinnedDate)]);
  const r = res.rows[0];
  return { id: r.id, pinnedDate: isoDate(r.pinned_date), kind: r.kind, text: r.text || "" };
}

// Client (is_client) users with 'wave' section enabled, assigned to a client, NOT checked in today.
async function listDueWaveCheckinReminders(today) {
  const res = await pool.query(
    `SELECT u.id AS user_id, ca.client_id
     FROM users u
     JOIN roles r ON r.name = u.role AND COALESCE(r.is_client, false) = true
     JOIN role_sections rs ON rs.role_id = r.id AND rs.section_id = 'wave' AND (rs.can_read OR rs.can_write)
     JOIN client_assignments ca ON ca.user_id = u.id
     LEFT JOIN wave_checkins wc ON wc.client_id = ca.client_id AND wc.checkin_date = $1::date
     WHERE u.active = true AND wc.id IS NULL`, [today]);
  return res.rows;
}

// Recompute inflection over the trailing window of the SUBJECTIVE momentum series; upsert open flags.
async function scanInflectionsForAllClients(today, lookbackDays = 14) {
  const res = await pool.query(
    `SELECT client_id, checkin_date, scores FROM wave_checkins
     WHERE checkin_date BETWEEN ($1::date - $2::int) AND $1::date ORDER BY client_id, checkin_date ASC`,
    [today, lookbackDays]);
  const byClient = new Map();
  for (const row of res.rows) {
    if (!byClient.has(row.client_id)) byClient.set(row.client_id, []);
    byClient.get(row.client_id).push({ date: isoDate(row.checkin_date), value: computeDayMomentum(row.scores || {}) });
  }
  let written = 0;
  for (const [clientId, series] of byClient) {
    for (const f of detectInflection(series)) {
      const ins = await pool.query(
        `INSERT INTO wave_flags (client_id, flag_date, kind, metric, magnitude, status)
         VALUES ($1,$2::date,$3,$4,$5,'open') ON CONFLICT (client_id, flag_date, kind) DO NOTHING RETURNING id`,
        [clientId, f.flag_date, f.kind, f.metric, f.magnitude]);
      if (ins.rowCount > 0) written += 1;
    }
  }
  return { clients: byClient.size, written };
}

function flagRow(r) {
  return { id: r.id, clientId: r.client_id, clientName: r.client_name, flagDate: isoDate(r.flag_date),
    kind: r.kind, metric: r.metric || "", magnitude: Number(r.magnitude) };
}

async function listOpenFlagsForUser(user) {
  if (!user) return [];
  if (user.role === "admin") {
    const res = await pool.query(
      `SELECT f.*, c.name AS client_name FROM wave_flags f JOIN clients c ON c.id = f.client_id
       WHERE f.status='open' ORDER BY f.flag_date DESC, f.id DESC LIMIT 200`);
    return res.rows.map(flagRow);
  }
  const res = await pool.query(
    `SELECT f.*, c.name AS client_name FROM wave_flags f JOIN clients c ON c.id = f.client_id
     JOIN users u ON u.id = $1 AND u.active = true
     LEFT JOIN client_assignments ca ON ca.client_id = f.client_id AND ca.user_id = u.id
     WHERE f.status='open' AND (u.all_clients_access = true OR ca.user_id IS NOT NULL)
     ORDER BY f.flag_date DESC, f.id DESC LIMIT 200`, [user.id]);
  return res.rows.map(flagRow);
}

async function listClientUserIdsForClient(clientId) {
  const res = await pool.query(
    `SELECT u.id FROM client_assignments ca
     JOIN users u ON u.id = ca.user_id AND u.active = true
     JOIN roles r ON r.name = u.role AND COALESCE(r.is_client, false) = true
     WHERE ca.client_id = $1`, [clientId]);
  return res.rows.map((r) => r.id);
}

module.exports = {
  upsertCheckin, getCheckin, getSeries, listReactions, addReaction,
  listDueWaveCheckinReminders, scanInflectionsForAllClients, listOpenFlagsForUser, listClientUserIdsForClient,
};
```

- [ ] **Step 2: Write the DB-backed smoke test**

Create `server/scripts/smokeWaveStore.js`:

```javascript
const assert = require("node:assert/strict");
const { pool, initSchema } = require("../services/db");
const store = require("../services/waveStore");

async function main() {
  await initSchema();
  const tables = await pool.query(`SELECT to_regclass('public.wave_checkins') c,
    to_regclass('public.wave_reactions') r, to_regclass('public.wave_flags') f`);
  assert.equal(tables.rows[0].c, "wave_checkins");
  assert.equal(tables.rows[0].r, "wave_reactions");
  assert.equal(tables.rows[0].f, "wave_flags");

  const suffix = Date.now();
  const clientId = `wave-smoke-${suffix}`;
  const userRes = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1,'x','admin') RETURNING id", [`wave-u-${suffix}`]);
  const userId = userRes.rows[0].id;
  await pool.query("INSERT INTO clients (id,name,short_name,dob,age,sex,avatar,color) VALUES ($1,'WS','WS','',0,'','','')", [clientId]);

  const day1 = await store.upsertCheckin({ clientId, userId, date: "2026-06-01", scores: { energy: 4, sleep: 3, mood: 5, focus: 4, calm: 4 }, contextTags: ["workout"], weight: 80.5, restingHr: 58, note: "ok" });
  assert.equal(day1.momentum, 4);
  assert.deepEqual(day1.contextTags, ["workout"]);

  await store.upsertCheckin({ clientId, userId, date: "2026-06-01", scores: { energy: 2, sleep: 2, mood: 2, focus: 2, calm: 2 } });
  const reread = await store.getCheckin(clientId, "2026-06-01");
  assert.equal(reread.momentum, 2);
  const cnt = await pool.query("SELECT COUNT(*)::int n FROM wave_checkins WHERE client_id=$1", [clientId]);
  assert.equal(cnt.rows[0].n, 1, "upsert must not duplicate");

  for (let i = 0; i < 6; i++) {
    const s = Math.max(1, Math.round(5 - i * 0.6));
    await store.upsertCheckin({ clientId, userId, date: `2026-06-1${i}`, scores: { energy: s, sleep: s, mood: s, focus: s, calm: s } });
  }
  const scan = await store.scanInflectionsForAllClients("2026-06-15");
  assert.ok(scan.written >= 1, "expected a flag");
  const scan2 = await store.scanInflectionsForAllClients("2026-06-15");
  assert.equal(scan2.written, 0, "scan must be idempotent");

  const flagDay = (await pool.query("SELECT flag_date FROM wave_flags WHERE client_id=$1 AND status='open' LIMIT 1", [clientId])).rows[0].flag_date;
  await store.addReaction({ clientId, authorUserId: userId, pinnedDate: flagDay, kind: "note", text: "Видел спад" });
  const openAfter = await pool.query("SELECT COUNT(*)::int n FROM wave_flags WHERE client_id=$1 AND status='open' AND flag_date=$2", [clientId, flagDay]);
  assert.equal(openAfter.rows[0].n, 0, "reaction addresses the day's flag");

  await pool.query("DELETE FROM clients WHERE id=$1", [clientId]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  console.log("wave store ok");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
```

- [ ] **Step 3: Run the smoke test**

Run: `DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@localhost:5434/2life node server/scripts/smokeWaveStore.js`
Expected: PASS — prints `wave store ok`.

- [ ] **Step 4: Commit**

```bash
git add server/services/waveStore.js server/scripts/smokeWaveStore.js
git commit -m "feat(wave): waveStore service with DB-backed smoke test"
```

---

## Task 4: HTTP routes (`routes/wave.js`) + mount

**Files:**
- Create: `server/routes/wave.js`
- Modify: `server/index.js`

- [ ] **Step 1: Implement the router**

Create `server/routes/wave.js`:

```javascript
const express = require("express");
const router = express.Router();
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const { canAccessClient } = require("../services/clientAccess");
const { METRIC_KEYS } = require("../services/waveMath");
const store = require("../services/waveStore");
const { sendPushToUsers } = require("../services/messengerPush");
const { sendTo } = require("../services/ws");

const todayIso = () => { const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };
const guard = async (req, res) => {
  if (!(await canAccessClient(req.user, req.params.clientId))) { res.status(403).json({ error: "Нет доступа к этому клиенту" }); return false; }
  return true;
};

router.get("/clients/:clientId/wave/today", requireAuth(), requireSectionRead("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const today = todayIso();
    res.json({ ok: true, date: today, metrics: METRIC_KEYS, checkin: await store.getCheckin(req.params.clientId, today) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.get("/clients/:clientId/wave/series", requireAuth(), requireSectionRead("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || "") ? req.query.to : todayIso();
    let from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "") ? req.query.from : null;
    if (!from) { const d = new Date(to); d.setDate(d.getDate() - 90); from = d.toISOString().slice(0, 10); }
    const [series, reactions] = await Promise.all([store.getSeries(req.params.clientId, from, to), store.listReactions(req.params.clientId)]);
    res.json({ ok: true, from, to, series, reactions });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.post("/clients/:clientId/wave/checkin", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const { scores, contextTags, weight, restingHr, note } = req.body || {};
    const checkin = await store.upsertCheckin({ clientId: req.params.clientId, userId: req.user.id, date: todayIso(), scores, contextTags, weight, restingHr, note });
    res.json({ ok: true, checkin });
  } catch (e) { console.error(e); res.status(400).json({ error: e.message || "Некорректный чек-ин" }); }
});

router.get("/wave/flags", requireAuth(), async (req, res) => {
  try { res.json({ ok: true, flags: await store.listOpenFlagsForUser(req.user) }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.post("/clients/:clientId/wave/reaction", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const { pinnedDate, kind, text } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pinnedDate || "")) return res.status(400).json({ error: "Некорректная дата" });
    const reaction = await store.addReaction({ clientId: req.params.clientId, authorUserId: req.user.id, pinnedDate, kind, text });
    const clientUserIds = await store.listClientUserIdsForClient(req.params.clientId);
    if (clientUserIds.length) {
      sendPushToUsers({ userIds: clientUserIds, title: "2life", body: "Ваш врач отметил вашу волну", url: `/?cid=${encodeURIComponent(req.params.clientId)}&sec=wave` }).catch(() => {});
      for (const uid of clientUserIds) sendTo(uid, { type: "wave_reaction", clientId: req.params.clientId, reaction });
    }
    res.json({ ok: true, reaction });
  } catch (e) { console.error(e); res.status(400).json({ error: e.message || "Не удалось сохранить" }); }
});

module.exports = router;
```

- [ ] **Step 2: Mount in `server/index.js`**

Add with the other router requires: `const waveRouter = require("./routes/wave");`
Add after `app.use("/api", journalRouter);`: `app.use("/api", waveRouter);`

- [ ] **Step 3: Verify the module loads**

Run: `node -e "require('./server/routes/wave.js'); console.log('wave router loads')"`
Expected: prints `wave router loads`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/wave.js server/index.js
git commit -m "feat(wave): client+doctor HTTP routes guarded by canAccessClient"
```

---

## Task 5: Scheduler lane (daily reminder + inflection scan)

**Files:**
- Modify: `server/services/journalNotifications.js`

- [ ] **Step 1: Add wave functions and wire into the 9am block**

At the top of `server/services/journalNotifications.js` add: `const waveStore = require("./waveStore");`
Ensure `wasJournalNotificationDelivered` and `recordJournalNotificationDelivery` are destructured from `require("./journalStore")` in this file (add them if absent).

Add these functions (use the file's existing `todayIso(now)` helper if present; otherwise add the same helper as in Task 4):

```javascript
async function runWaveCheckinReminders(now = new Date()) {
  const today = todayIso(now);
  const due = await waveStore.listDueWaveCheckinReminders(today);
  let sent = 0;
  for (const row of due) {
    if (await wasJournalNotificationDelivered({ userId: row.user_id, kind: "wave_checkin", deliveryKey: today })) continue;
    await sendPushToUsers({ userIds: [row.user_id], title: "2life", body: "Как ты сегодня? Отметь за 60 секунд",
      url: `/?cid=${encodeURIComponent(row.client_id)}&sec=wave` });
    await recordJournalNotificationDelivery({ userId: row.user_id, kind: "wave_checkin", deliveryKey: today });
    sent += 1;
  }
  return { due: due.length, sent };
}

async function runWaveInflectionScan(now = new Date()) {
  return waveStore.scanInflectionsForAllClients(todayIso(now));
}
```

In `startJournalNotificationScheduler()`, inside the existing `now.getHours()===9 && now.getMinutes()<5` block, add:

```javascript
      runWaveInflectionScan(now).catch((e) => console.warn("[wave] inflection scan failed", e?.message || e));
      runWaveCheckinReminders(now).catch((e) => console.warn("[wave] checkin reminder failed", e?.message || e));
```

Add `runWaveCheckinReminders` and `runWaveInflectionScan` to `module.exports`.

- [ ] **Step 2: Verify the module loads and exports**

Run: `node -e "const m=require('./server/services/journalNotifications.js'); console.log(typeof m.runWaveCheckinReminders, typeof m.runWaveInflectionScan)"`
Expected: prints `function function`.

- [ ] **Step 3: Commit**

```bash
git add server/services/journalNotifications.js
git commit -m "feat(wave): daily check-in reminder + inflection scan in scheduler 9am block"
```

---

## Task 6: Client-owns-record permission smoke

**Files:**
- Create: `server/scripts/verifyWaveCheckinPerms.js`

- [ ] **Step 1: Write the test**

Create `server/scripts/verifyWaveCheckinPerms.js`:

```javascript
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
```

- [ ] **Step 2: Run it**

Run: `DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@localhost:5434/2life node server/scripts/verifyWaveCheckinPerms.js`
Expected: PASS — prints `wave checkin perms ok`.

- [ ] **Step 3: Commit**

```bash
git add server/scripts/verifyWaveCheckinPerms.js
git commit -m "test(wave): client-owns-record guard + due-reminder query"
```

---

## Task 7: Pure frontend curve math (`waveCurve.js`) — TDD

**Files:**
- Create: `src/utils/waveCurve.js`
- Test: `scripts/verifyWaveCurve.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/verifyWaveCurve.mjs`:

```javascript
import assert from "node:assert/strict";
import { toPolylinePoints, deltaVsFirstWeek } from "../src/utils/waveCurve.js";

const series = [
  { date: "2026-06-01", value: 2, scores: { energy: 2, sleep: 2, mood: 2, focus: 2, calm: 2 } },
  { date: "2026-06-02", value: 3, scores: { energy: 3, sleep: 3, mood: 3, focus: 3, calm: 3 } },
  { date: "2026-06-03", value: 4, scores: { energy: 4, sleep: 4, mood: 4, focus: 4, calm: 4 } },
];
const pts = toPolylinePoints(series, { width: 300, height: 100, pad: 10, maxScore: 5 });
const parsed = pts.trim().split(" ").map((p) => p.split(",").map(Number));
assert.equal(parsed.length, 3);
assert.equal(parsed[0][0], 10);
assert.equal(parsed[2][0], 290);
assert.ok(parsed[2][1] < parsed[0][1], "higher value renders higher (smaller y)");

const deltas = deltaVsFirstWeek(series);
assert.ok(Array.isArray(deltas) && deltas.every((d) => typeof d.delta === "number" && !Number.isNaN(d.delta)));
assert.equal(toPolylinePoints([], { width: 300, height: 100 }), "");
assert.deepEqual(deltaVsFirstWeek([]), []);
console.log("wave curve ok");
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/verifyWaveCurve.mjs`
Expected: FAIL — `Cannot find module '../src/utils/waveCurve.js'`.

- [ ] **Step 3: Implement `waveCurve.js`**

Create `src/utils/waveCurve.js`:

```javascript
// Pure presentation math. No React, no DOM. `value` is the per-day momentum (subjective) OR any metric.
export const METRIC_LABELS = { energy: "Энергия", sleep: "Сон", mood: "Настроение", focus: "Фокус", calm: "Спокойствие" };
const round1 = (n) => Math.round(n * 10) / 10;

export function toPolylinePoints(series, { width = 300, height = 120, pad = 10, minScore = 1, maxScore = 5 } = {}) {
  const pts = (series || []).filter((d) => Number.isFinite(Number(d.value)));
  if (!pts.length) return "";
  const span = (maxScore - minScore) || 1;
  const innerW = width - pad * 2, innerH = height - pad * 2, n = pts.length;
  return pts.map((d, i) => {
    const x = n === 1 ? pad : pad + (innerW * i) / (n - 1);
    const norm = (Number(d.value) - minScore) / span;
    const y = pad + innerH * (1 - Math.max(0, Math.min(1, norm)));
    return `${round1(x)},${round1(y)}`;
  }).join(" ");
}

export function deltaVsFirstWeek(series) {
  const pts = (series || []).filter((d) => d && d.scores);
  if (!pts.length) return [];
  const first = pts.slice(0, 7), last = pts.slice(-7);
  const avg = (arr, key) => { const v = arr.map((d) => Number(d.scores?.[key])).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return Object.keys(METRIC_LABELS).map((key) => {
    const a = avg(first, key), b = avg(last, key);
    return { key, label: METRIC_LABELS[key], delta: a == null || b == null ? 0 : round1(b - a) };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node scripts/verifyWaveCurve.mjs`
Expected: PASS — prints `wave curve ok`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/waveCurve.js scripts/verifyWaveCurve.mjs
git commit -m "feat(wave): pure SVG-curve + delta math with unit test"
```

---

## Task 8: The `Wave.jsx` section (manual check-in + curve + doctor flags/reactions)

**Files:**
- Create: `src/sections/Wave.jsx`

- [ ] **Step 1: Implement the component**

Create `src/sections/Wave.jsx`:

```jsx
import { useState, useEffect, useCallback } from "react";
import { useDashboard, isClientRole } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { toPolylinePoints, deltaVsFirstWeek, METRIC_LABELS } from "../utils/waveCurve";

const METRICS = ["energy", "sleep", "mood", "focus", "calm"];
const CONTEXT_CHIPS = ["плохо спал", "перелёт", "тренировка", "стресс"];
const DISCLAIMER = "Это как ты себя чувствуешь, не диагноз. Срочное — в мессенджер или звонок врачу.";

export default function WaveSection() {
  const { cid } = useDashboard();
  const { user, authFetch } = useAuth();
  const { $ } = useTheme();
  const isClient = isClientRole(user);

  const [series, setSeries] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [today, setToday] = useState(null);
  const [draft, setDraft] = useState({ energy: 3, sleep: 3, mood: 3, focus: 3, calm: 3 });
  const [tags, setTags] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!cid) return;
    const [sRes, tRes] = await Promise.all([
      authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/series`).catch(() => null),
      authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/today`).catch(() => null),
    ]);
    if (sRes && sRes.ok) { const d = await sRes.json(); setSeries(d.series || []); setReactions(d.reactions || []); }
    if (tRes && tRes.ok) { const d = await tRes.json(); setToday(d);
      if (d.checkin?.scores) setDraft((p) => ({ ...p, ...d.checkin.scores }));
      if (d.checkin?.contextTags) setTags(d.checkin.contextTags); }
  }, [cid, authFetch]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setSaving(true);
    const res = await authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/checkin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: draft, contextTags: tags }) }).catch(() => null);
    setSaving(false);
    if (res && res.ok) await load();
  };
  const react = async (pinnedDate, kind, text) => {
    const res = await authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/reaction`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinnedDate, kind, text: text || "" }) }).catch(() => null);
    if (res && res.ok) await load();
  };

  const W = 640, H = 180;
  const curveSeries = series.map((d) => ({ ...d, value: d.momentum }));
  const points = toPolylinePoints(curveSeries, { width: W, height: H, pad: 16, maxScore: 5 });
  const deltas = deltaVsFirstWeek(series);
  const card = { background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: $.tx, marginBottom: 4 }}>🌊 Моя волна</div>
      <div style={{ fontSize: 12, color: $.txM, marginBottom: 14 }}>{DISCLAIMER}</div>

      {deltas.length > 0 && series.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {deltas.map((d) => (
            <div key={d.key} style={{ background: $.bgI, borderRadius: 10, padding: "8px 12px", minWidth: 86 }}>
              <div style={{ fontSize: 12, color: $.txS }}>{d.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: d.delta >= 0 ? $.ac : $.dn }}>
                {d.delta >= 0 ? "↑ +" : "↓ "}{Math.abs(d.delta).toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        {series.length === 0 ? (
          <div style={{ fontSize: 14, color: $.txM, textAlign: "center", padding: "24px 0" }}>
            Пока нет отметок. {isClient ? "Сделай первый чек-ин ниже — и твоя кривая начнёт расти." : "Клиент ещё не отмечался."}
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Кривая самочувствия">
            <polyline points={points} fill="none" stroke={$.ac} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {curveSeries.map((d, i) => {
              const n = curveSeries.length;
              const x = n === 1 ? 16 : 16 + ((W - 32) * i) / (n - 1);
              const y = 16 + (H - 32) * (1 - (Number(d.value || 1) - 1) / 4);
              const pin = reactions.find((r) => r.pinnedDate === d.date);
              return (<g key={d.date}>
                <circle cx={x} cy={y} r={pin ? 6 : 3} fill={pin ? $.ac : $.acD} stroke={$.ac} strokeWidth="1.5" />
                {pin && <title>{pin.text || "Отметка врача"}</title>}</g>);
            })}
          </svg>
        )}
      </div>

      {reactions.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: $.tx, marginBottom: 8 }}>Заметки врача</div>
          {reactions.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: `1px solid ${$.brd}` }}>
              <span style={{ fontSize: 12, color: $.txM, minWidth: 88 }}>{r.pinnedDate}</span>
              <span style={{ fontSize: 13, color: $.tx }}>{r.kind === "ack" ? "👍 отметил вашу неделю" : r.text}</span>
            </div>
          ))}
        </div>
      )}

      {isClient && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: $.tx }}>Как ты сегодня?</span>
            <span style={{ fontSize: 12, color: $.txM }}>⏱ 60 секунд{today?.checkin ? " · уже отмечено" : ""}</span>
          </div>
          {METRICS.map((key) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ flex: "0 0 96px", fontSize: 13, color: $.txS }}>{METRIC_LABELS[key]}</span>
              <input type="range" min="1" max="5" step="1" value={draft[key]}
                onChange={(e) => setDraft((p) => ({ ...p, [key]: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: $.ac, height: 28 }} aria-label={METRIC_LABELS[key]} />
              <span style={{ flex: "0 0 18px", fontSize: 14, fontWeight: 700, color: $.tx, textAlign: "right" }}>{draft[key]}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
            {CONTEXT_CHIPS.map((c) => { const on = tags.includes(c);
              return (<button key={c} onClick={() => setTags((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                style={{ fontSize: 12, color: on ? $.ac : $.txS, background: on ? $.acD : "transparent", border: `1px solid ${on ? $.ac : $.brd}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>
                {on ? "✓ " : "+ "}{c}</button>); })}
          </div>
          <button onClick={submit} disabled={saving || !cid}
            style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 700, color: "#fff", background: $.ac, border: "none", borderRadius: 10, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Сохраняю…" : today?.checkin ? "Обновить" : "Отметить"}</button>
        </div>
      )}

      {!isClient && (
        <DoctorReactionBar reactions={reactions} onReact={react} $={$} />
      )}
    </div>
  );
}

function DoctorReactionBar({ onReact, $ }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [text, setText] = useState("");
  const card = { background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 14, padding: 16, marginBottom: 14 };
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: $.tx, marginBottom: 8 }}>Отметить волну клиента</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ padding: "8px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx }} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Короткая заметка (необязательно)"
          style={{ flex: 1, minWidth: 160, padding: "8px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx }} />
        <button onClick={() => onReact(date, "ack", "")} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${$.ac}`, background: "transparent", color: $.ac, cursor: "pointer" }}>👍 Отметить неделю</button>
        <button onClick={() => { if (text.trim()) { onReact(date, "note", text.trim()); setText(""); } }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: $.ac, color: "#fff", cursor: "pointer" }}>Закрепить заметку</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds (Vite), no import/JSX errors. (Confirm `useTheme`/`useAuth` import paths match the repo — adjust if a section like `src/sections/Messenger.jsx` imports them differently.)

- [ ] **Step 3: Commit**

```bash
git add src/sections/Wave.jsx
git commit -m "feat(wave): Wave section — check-in, hand-rolled SVG curve, doctor reactions"
```

---

## Task 9: Register the section (sidebar + renderer)

**Files:**
- Modify: `src/context/DashboardContext.jsx` (the `SECTIONS` array at line ~9)
- Modify: `src/dashboard.jsx` (lazy import at top; `sectionRenderers` map at line ~248)

- [ ] **Step 1: Add to `SECTIONS`**

In `src/context/DashboardContext.jsx`, append to the `SECTIONS` array (after the `messenger` entry):

```javascript
  {id:"wave",ic:"🌊",lb:"Моя волна"},
```

- [ ] **Step 2: Lazy-import + register the renderer in `src/dashboard.jsx`**

Add near the other `lazy(...)` imports at the top:

```javascript
const WaveSection = lazy(() => import("./sections/Wave"));
```

Add an entry to the `sectionRenderers` object (match the existing entries' shape — they are keyed by section id):

```javascript
    wave: () => <WaveSection />,
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds; the «Моя волна» item appears for any role whose `wave` section is readable.

- [ ] **Step 4: Commit**

```bash
git add src/context/DashboardContext.jsx src/dashboard.jsx
git commit -m "feat(wave): register Моя волна section + lazy renderer"
```

---

## Task 10: Static surface verify + npm wiring (Phase 1)

**Files:**
- Create: `scripts/verifyWaveStatic.mjs`
- Modify: `package.json`, `server/package.json`

- [ ] **Step 1: Write the static check**

Create `scripts/verifyWaveStatic.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const ctx = read("../src/context/DashboardContext.jsx");
assert.ok(/id:"wave"/.test(ctx), "wave registered in SECTIONS");

const dash = read("../src/dashboard.jsx");
assert.ok(/import\("\.\/sections\/Wave"\)/.test(dash), "Wave lazy-imported");
assert.ok(/\bwave:/.test(dash), "wave renderer registered");

const sec = read("../src/sections/Wave.jsx");
assert.ok(/не диагноз/.test(sec), "disclaimer present");

const routes = read("../server/routes/wave.js");
assert.ok(/requireSectionWrite\("wave"\)/.test(routes), "checkin guarded by section write");
assert.ok(/canAccessClient/.test(routes), "routes call canAccessClient");

console.log("wave static ok");
```

- [ ] **Step 2: Run it**

Run: `node scripts/verifyWaveStatic.mjs`
Expected: PASS — prints `wave static ok`.

- [ ] **Step 3: Wire npm scripts**

In root `package.json` `scripts` add:
```json
    "verify:wave-curve": "node scripts/verifyWaveCurve.mjs",
    "verify:wave-static": "node scripts/verifyWaveStatic.mjs",
```
In `server/package.json` `scripts` add:
```json
    "verify:wave-inflection": "node scripts/verifyWaveInflection.js",
    "verify:wave-perms": "node scripts/verifyWaveCheckinPerms.js",
    "smoke:wave-store": "node scripts/smokeWaveStore.js",
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verifyWaveStatic.mjs package.json server/package.json
git commit -m "test(wave): static surface verify + npm script wiring"
```

**✅ Phase 1 ships here:** manual «Моя волна» works end-to-end (check-in → curve → flags → doctor reaction) with no WHOOP dependency.

---

# PHASE 2 — WHOOP integration (layered on Phase 1)

**Prereqs (one-time, owner-side, before Task 14 can be tested live):** register a WHOOP developer app → set env `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI=https://<host>/api/wave/whoop/callback`; ensure `MESSENGER_ENCRYPTION_SECRET` is set (already used by the messenger). Subscribe the app to webhooks. Requires Node 18+ (global `fetch`) — confirm; otherwise use the repo's existing HTTP client.

## Task 11: Migration — `integration_connections`

**Files:**
- Modify: `server/services/db.js` (append one `runOnce`)

- [ ] **Step 1: Add the migration**

Append after the wave migrations from Task 1:

```javascript
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
```

- [ ] **Step 2: Verify it boots**

Run: `node -e "require('./server/services/db.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add server/services/db.js
git commit -m "feat(whoop): integration_connections table (encrypted OAuth tokens, source-tagged)"
```

---

## Task 12: `whoopClient.js` — OAuth + v2 fetchers + pure helpers (TDD the pure parts)

**Files:**
- Create: `server/services/whoopClient.js`
- Test: `server/scripts/verifyWhoopClient.js`

- [ ] **Step 1: Write the failing test (pure helpers only)**

Create `server/scripts/verifyWhoopClient.js`:

```javascript
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { buildAuthorizeUrl, mapWhoopToObjective, whoopDayKey, verifyWebhookSignature } = require("../services/whoopClient");

// authorize URL
const url = buildAuthorizeUrl({ clientId: "abc", redirectUri: "https://x/cb", state: "s1", scopes: ["read:recovery", "offline"] });
assert.ok(url.startsWith("https://api.prod.whoop.com/oauth/oauth2/auth?"), "authorize base");
const q = new URL(url).searchParams;
assert.equal(q.get("client_id"), "abc");
assert.equal(q.get("response_type"), "code");
assert.equal(q.get("redirect_uri"), "https://x/cb");
assert.equal(q.get("scope"), "read:recovery offline");
assert.equal(q.get("state"), "s1");

// payload -> objective (verified v2 field names)
const obj = mapWhoopToObjective({
  recovery: { score: { recovery_score: 66, resting_heart_rate: 54, hrv_rmssd_milli: 87.3 } },
  sleep: { score: { sleep_performance_percentage: 91, respiratory_rate: 15.2 } },
  cycle: { score: { strain: 12.4 } },
});
assert.equal(obj.recovery, 66);
assert.equal(obj.rhr_bpm, 54);
assert.equal(obj.hrv_ms, 87.3);
assert.equal(obj.sleep_perf, 91);
assert.equal(obj.respiratory_rate, 15.2);
assert.equal(obj.strain, 12.4);
assert.deepEqual(mapWhoopToObjective({}), {});

// day key
assert.equal(whoopDayKey({ created_at: "2026-06-15T07:32:00.000Z" }), "2026-06-15");

// webhook signature (matches WHOOP scheme: base64(HMAC_SHA256(ts + rawBody, secret)))
const secret = "shh", ts = "1700000000000", body = '{"user_id":42,"type":"recovery.updated"}';
const good = crypto.createHmac("sha256", secret).update(Buffer.concat([Buffer.from(ts), Buffer.from(body)])).digest("base64");
assert.equal(verifyWebhookSignature({ timestamp: ts, rawBody: Buffer.from(body), signature: good, secret }), true);
assert.equal(verifyWebhookSignature({ timestamp: ts, rawBody: Buffer.from(body), signature: "wrong", secret }), false);

console.log("whoop client ok");
```

- [ ] **Step 2: Run to verify it fails**

Run: `node server/scripts/verifyWhoopClient.js`
Expected: FAIL — `Cannot find module '../services/whoopClient'`.

- [ ] **Step 3: Implement `whoopClient.js`**

Create `server/services/whoopClient.js`:

```javascript
const crypto = require("node:crypto");

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
// NOTE: confirm the "/developer" prefix on the first live call; v1 used api.prod.whoop.com/developer/v1.
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
const SCOPES = ["read:recovery", "read:sleep", "read:cycles", "read:workout", "read:body_measurement", "read:profile", "offline"];

// ---- pure helpers ----
function buildAuthorizeUrl({ clientId, redirectUri, state, scopes = SCOPES }) {
  const u = new URL(WHOOP_AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", scopes.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
const r1 = (n) => (n == null ? undefined : Math.round(n * 10) / 10);

// Map verified v2 fields. Stores raw numbers; NO interpretation (no AI, no verdict).
function mapWhoopToObjective({ recovery, sleep, cycle } = {}) {
  const o = {};
  const rs = recovery && recovery.score, ss = sleep && sleep.score, cs = cycle && cycle.score;
  if (rs) {
    if (num(rs.recovery_score) != null) o.recovery = Math.round(num(rs.recovery_score));
    if (num(rs.resting_heart_rate) != null) o.rhr_bpm = Math.round(num(rs.resting_heart_rate));
    if (num(rs.hrv_rmssd_milli) != null) o.hrv_ms = r1(num(rs.hrv_rmssd_milli)); // confirm unit on first real payload
  }
  if (ss) {
    if (num(ss.sleep_performance_percentage) != null) o.sleep_perf = Math.round(num(ss.sleep_performance_percentage));
    if (num(ss.respiratory_rate) != null) o.respiratory_rate = r1(num(ss.respiratory_rate));
  }
  if (cs && num(cs.strain) != null) o.strain = r1(num(cs.strain));
  return o;
}

// Best-effort local day for a WHOOP record. Timezone attribution to be confirmed vs real payloads.
function whoopDayKey(record) {
  return String((record && (record.created_at || record.end || record.start)) || "").slice(0, 10);
}

function verifyWebhookSignature({ timestamp, rawBody, signature, secret }) {
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const mac = crypto.createHmac("sha256", secret).update(Buffer.concat([Buffer.from(String(timestamp)), bodyBuf])).digest("base64");
  const a = Buffer.from(mac), b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- HTTP (exercised live; pure helpers above are unit-tested) ----
async function exchangeCode({ code, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
  return tokenRequest(body);
}
async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, scope: "offline" });
  return tokenRequest(body);
}
async function tokenRequest(body) {
  const res = await fetch(WHOOP_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`WHOOP token ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json(); // { access_token, refresh_token, expires_in, scope, ... }
}
async function getJson(path, accessToken, query = {}) {
  const u = new URL(WHOOP_API_BASE + path);
  for (const [k, v] of Object.entries(query)) if (v != null) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`WHOOP GET ${path} ${res.status}`);
  return res.json();
}
// Collection endpoints return { records: [...], next_token }. We page lightly (latest window).
const fetchRecovery = (token, startIso) => getJson("/v2/recovery", token, { start: startIso, limit: 25 });
const fetchSleep = (token, startIso) => getJson("/v2/activity/sleep", token, { start: startIso, limit: 25 });
const fetchCycle = (token, startIso) => getJson("/v2/cycle", token, { start: startIso, limit: 25 });

module.exports = {
  WHOOP_AUTH_URL, WHOOP_TOKEN_URL, WHOOP_API_BASE, SCOPES,
  buildAuthorizeUrl, mapWhoopToObjective, whoopDayKey, verifyWebhookSignature,
  exchangeCode, refreshAccessToken, getJson, fetchRecovery, fetchSleep, fetchCycle,
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `node server/scripts/verifyWhoopClient.js`
Expected: PASS — prints `whoop client ok`.

- [ ] **Step 5: Commit**

```bash
git add server/services/whoopClient.js server/scripts/verifyWhoopClient.js
git commit -m "feat(whoop): OAuth + v2 fetchers + pure helpers (authorize URL, mapping, webhook HMAC) with unit test"
```

---

## Task 13: Per-metric objective inflection in `waveMath.js` — TDD

**Files:**
- Modify: `server/services/waveMath.js`
- Modify: `server/scripts/verifyWaveInflection.js` (add cases)

- [ ] **Step 1: Add failing cases to the test**

Append to `server/scripts/verifyWaveInflection.js` (before the final `console.log`):

```javascript
const { detectMetricInflection, OBJECTIVE_FLAG_METRICS } = require("../services/waveMath");
assert.deepEqual(OBJECTIVE_FLAG_METRICS.map((m) => m.metric).sort(), ["hrv_ms", "recovery", "rhr_bpm", "sleep_perf"]);

// recovery falling -> concern (inflection_down, metric tagged)
const recFall = [60, 58, 61, 50, 44, 40].map((v, i) => ({ date: `2026-06-0${i + 1}`, value: v }));
const rf = detectMetricInflection(recFall, { metric: "recovery", direction: "down_bad", threshold: 6 });
assert.ok(rf.some((f) => f.kind === "inflection_down" && f.metric === "recovery"));

// resting HR rising -> concern (up is bad -> inflection_down semantics)
const rhrRise = [50, 51, 50, 55, 58, 60].map((v, i) => ({ date: `2026-06-0${i + 1}`, value: v }));
const hr = detectMetricInflection(rhrRise, { metric: "rhr_bpm", direction: "up_bad", threshold: 4 });
assert.ok(hr.some((f) => f.kind === "inflection_down" && f.metric === "rhr_bpm"), "rhr rise = concern");

// recovery rising -> positive
const recRise = recFall.map((d) => ({ date: d.date, value: 100 - d.value }));
assert.ok(detectMetricInflection(recRise, { metric: "recovery", direction: "down_bad", threshold: 6 }).some((f) => f.kind === "inflection_up"));
```

- [ ] **Step 2: Run to verify it fails**

Run: `node server/scripts/verifyWaveInflection.js`
Expected: FAIL — `detectMetricInflection is not a function`.

- [ ] **Step 3: Implement in `waveMath.js`**

Add to `server/services/waveMath.js` (and extend `module.exports`):

```javascript
// Direction semantics: 'down_bad' (recovery/sleep/hrv: a drop is the concern); 'up_bad' (rhr: a rise is the concern).
const OBJECTIVE_FLAG_METRICS = [
  { metric: "recovery", direction: "down_bad" },
  { metric: "sleep_perf", direction: "down_bad" },
  { metric: "hrv_ms", direction: "down_bad" },
  { metric: "rhr_bpm", direction: "up_bad" },
];

function detectMetricInflection(series, { metric, direction = "down_bad", window = 3, threshold = 0.8 } = {}) {
  const clean = (series || []).filter((d) => Number.isFinite(Number(d.value)));
  if (clean.length < window * 2) return [];
  const latest = clean[clean.length - 1];
  const recent = mean(clean.slice(-window).map((d) => Number(d.value)));
  const prior = mean(clean.slice(-window * 2, -window).map((d) => Number(d.value)));
  const delta = round2(recent - prior);
  const rose = delta >= threshold, fell = delta <= -threshold;
  let kind = null;
  if (direction === "down_bad") { if (fell) kind = "inflection_down"; else if (rose) kind = "inflection_up"; }
  else { if (rose) kind = "inflection_down"; else if (fell) kind = "inflection_up"; } // up_bad
  return kind ? [{ flag_date: latest.date, kind, metric, magnitude: delta }] : [];
}

module.exports = { METRIC_KEYS, computeDayMomentum, detectInflection, OBJECTIVE_FLAG_METRICS, detectMetricInflection };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node server/scripts/verifyWaveInflection.js`
Expected: PASS — prints `wave inflection ok`.

- [ ] **Step 5: Commit**

```bash
git add server/services/waveMath.js server/scripts/verifyWaveInflection.js
git commit -m "feat(whoop): per-metric objective inflection (recovery/sleep/hrv down, rhr up) with tests"
```

---

## Task 14: `whoopStore.js` — encrypted connections + sync + objective scan + smoke

**Files:**
- Create: `server/services/whoopStore.js`
- Test: `server/scripts/smokeWhoopStore.js`

- [ ] **Step 1: Implement `whoopStore.js`**

Create `server/services/whoopStore.js`:

```javascript
const { pool } = require("./db");
const { encryptText, decryptText } = require("./messengerCrypto");
const whoop = require("./whoopClient");
const { detectMetricInflection, OBJECTIVE_FLAG_METRICS } = require("./waveMath");

const isoDate = (d) => String(d).slice(0, 10);

async function upsertConnection({ clientId, userId, source = "whoop", providerUserId, accessToken, refreshToken, expiresIn, scopes = [] }) {
  const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString() : null;
  await pool.query(
    `INSERT INTO integration_connections (client_id,user_id,source,provider_user_id,access_token_enc,refresh_token_enc,token_expires_at,scopes,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'active')
     ON CONFLICT (client_id, source) DO UPDATE SET user_id=EXCLUDED.user_id, provider_user_id=EXCLUDED.provider_user_id,
       access_token_enc=EXCLUDED.access_token_enc, refresh_token_enc=EXCLUDED.refresh_token_enc,
       token_expires_at=EXCLUDED.token_expires_at, scopes=EXCLUDED.scopes, status='active', last_error=NULL`,
    [clientId, userId, source, providerUserId || null, encryptText(accessToken), encryptText(refreshToken), expiresAt, JSON.stringify(scopes)]);
}

function rowToConn(r) {
  if (!r) return null;
  return { id: r.id, clientId: r.client_id, userId: r.user_id, source: r.source, providerUserId: r.provider_user_id,
    accessToken: r.access_token_enc ? decryptText(r.access_token_enc) : null,
    refreshToken: r.refresh_token_enc ? decryptText(r.refresh_token_enc) : null,
    expiresAt: r.token_expires_at, lastSyncAt: r.last_sync_at, status: r.status, scopes: r.scopes || [] };
}
async function getConnectionByClient(clientId, source = "whoop") {
  const res = await pool.query("SELECT * FROM integration_connections WHERE client_id=$1 AND source=$2 LIMIT 1", [clientId, source]);
  return rowToConn(res.rows[0]);
}
async function getConnectionByProviderUserId(providerUserId, source = "whoop") {
  const res = await pool.query("SELECT * FROM integration_connections WHERE provider_user_id=$1 AND source=$2 AND status='active' LIMIT 1", [String(providerUserId), source]);
  return rowToConn(res.rows[0]);
}
async function setStatus(clientId, status, lastError = null, source = "whoop") {
  await pool.query("UPDATE integration_connections SET status=$2, last_error=$3 WHERE client_id=$1 AND source=$4", [clientId, status, lastError, source]);
}
async function deleteConnection(clientId, source = "whoop") {
  await pool.query("DELETE FROM integration_connections WHERE client_id=$1 AND source=$2", [clientId, source]);
}
async function purgeObjective(clientId) {
  await pool.query("UPDATE wave_checkins SET objective='{}'::jsonb, source='manual', ingested_at=NULL WHERE client_id=$1 AND source='whoop'", [clientId]);
}

// Write the WHOOP objective block for a day WITHOUT touching subjective `scores`.
async function upsertObjective({ clientId, userId, date, objective }) {
  await pool.query(
    `INSERT INTO wave_checkins (client_id,user_id,checkin_date,objective,source,ingested_at)
     VALUES ($1,$2,$3::date,$4::jsonb,'whoop',now())
     ON CONFLICT (client_id, checkin_date) DO UPDATE SET objective=EXCLUDED.objective, source='whoop', ingested_at=now(), updated_at=now()`,
    [clientId, userId, isoDate(date), JSON.stringify(objective || {})]);
}

// Pull recent WHOOP data and write per-day objective. `client` is injectable for tests.
async function syncConnection(conn, { days = 14, client = whoop } = {}) {
  if (!conn) return { days: 0 };
  const startIso = new Date(Date.now() - days * 86400000).toISOString();
  const [rec, slp, cyc] = await Promise.all([
    client.fetchRecovery(conn.accessToken, startIso),
    client.fetchSleep(conn.accessToken, startIso),
    client.fetchCycle(conn.accessToken, startIso),
  ]);
  const byDay = new Map(); // date -> { recovery, sleep, cycle }
  const put = (rows, key) => { for (const r of rows || []) { const d = client.whoopDayKey(r); if (!d) continue; if (!byDay.has(d)) byDay.set(d, {}); byDay.get(d)[key] = r; } };
  put(rec.records, "recovery"); put(slp.records, "sleep"); put(cyc.records, "cycle");
  let written = 0;
  for (const [date, parts] of byDay) {
    const objective = client.mapWhoopToObjective(parts);
    if (Object.keys(objective).length) { await upsertObjective({ clientId: conn.clientId, userId: conn.userId, date, objective }); written += 1; }
  }
  await pool.query("UPDATE integration_connections SET last_sync_at=now(), last_error=NULL WHERE id=$1", [conn.id]);
  return { days: written };
}

// Build per-metric series from objective JSONB and upsert flags.
async function scanObjectiveInflections(clientId, today, lookbackDays = 14) {
  const res = await pool.query(
    `SELECT checkin_date, objective FROM wave_checkins
     WHERE client_id=$1 AND checkin_date BETWEEN ($2::date - $3::int) AND $2::date AND objective <> '{}'::jsonb
     ORDER BY checkin_date ASC`, [clientId, today, lookbackDays]);
  let written = 0;
  for (const cfg of OBJECTIVE_FLAG_METRICS) {
    const series = res.rows
      .map((r) => ({ date: isoDate(r.checkin_date), value: r.objective?.[cfg.metric] }))
      .filter((d) => Number.isFinite(Number(d.value)));
    const thr = cfg.metric === "recovery" || cfg.metric === "sleep_perf" ? 6 : cfg.metric === "rhr_bpm" ? 3 : 5;
    for (const f of detectMetricInflection(series, { ...cfg, threshold: thr })) {
      const ins = await pool.query(
        `INSERT INTO wave_flags (client_id,flag_date,kind,metric,magnitude,status)
         VALUES ($1,$2::date,$3,$4,$5,'open') ON CONFLICT (client_id,flag_date,kind) DO NOTHING RETURNING id`,
        [clientId, f.flag_date, f.kind, f.metric, f.magnitude]);
      if (ins.rowCount > 0) written += 1;
    }
  }
  return { written };
}

async function listActiveConnections() {
  const res = await pool.query("SELECT * FROM integration_connections WHERE status='active'");
  return res.rows.map(rowToConn);
}

module.exports = {
  upsertConnection, getConnectionByClient, getConnectionByProviderUserId, setStatus, deleteConnection,
  purgeObjective, upsertObjective, syncConnection, scanObjectiveInflections, listActiveConnections,
};
```

- [ ] **Step 2: Write the DB-backed smoke (fake WHOOP client — no real creds)**

Create `server/scripts/smokeWhoopStore.js`:

```javascript
const assert = require("node:assert/strict");
process.env.MESSENGER_ENCRYPTION_SECRET = process.env.MESSENGER_ENCRYPTION_SECRET || "smoke-secret-at-least-32-chars-long!!";
const { pool, initSchema } = require("../services/db");
const store = require("../services/whoopStore");
const real = require("../services/whoopClient");

// Fake client: real pure helpers, fixture HTTP.
const fakeClient = {
  whoopDayKey: real.whoopDayKey, mapWhoopToObjective: real.mapWhoopToObjective,
  fetchRecovery: async () => ({ records: [
    { created_at: "2026-06-10T07:00:00Z", score: { recovery_score: 70, resting_heart_rate: 50, hrv_rmssd_milli: 90 } },
    { created_at: "2026-06-14T07:00:00Z", score: { recovery_score: 42, resting_heart_rate: 60, hrv_rmssd_milli: 55 } },
  ] }),
  fetchSleep: async () => ({ records: [{ created_at: "2026-06-14T07:00:00Z", score: { sleep_performance_percentage: 80, respiratory_rate: 15 } }] }),
  fetchCycle: async () => ({ records: [{ created_at: "2026-06-14T07:00:00Z", score: { strain: 11.1 } }] }),
};

async function main() {
  await initSchema();
  const s = Date.now(), clientId = `whoop-smoke-${s}`;
  const u = await pool.query("INSERT INTO users (username,password_hash,role) VALUES ($1,'x','admin') RETURNING id", [`whoop-u-${s}`]);
  const userId = u.rows[0].id;
  await pool.query("INSERT INTO clients (id,name,short_name,dob,age,sex,avatar,color) VALUES ($1,'W','W','',0,'','','')", [clientId]);

  // encrypted connection round-trip
  await store.upsertConnection({ clientId, userId, providerUserId: `puid-${s}`, accessToken: "AT-secret", refreshToken: "RT-secret", expiresIn: 3600, scopes: ["read:recovery", "offline"] });
  const conn = await store.getConnectionByClient(clientId);
  assert.equal(conn.accessToken, "AT-secret", "token decrypts back");
  const raw = await pool.query("SELECT access_token_enc FROM integration_connections WHERE client_id=$1", [clientId]);
  assert.ok(!raw.rows[0].access_token_enc.includes("AT-secret"), "token stored encrypted, not plaintext");
  assert.equal((await store.getConnectionByProviderUserId(`puid-${s}`)).clientId, clientId);

  // sync writes objective without clobbering an existing manual mood
  const waveStore = require("../services/waveStore");
  await waveStore.upsertCheckin({ clientId, userId, date: "2026-06-14", scores: { mood: 4 } });
  const sync = await store.syncConnection(conn, { days: 30, client: fakeClient });
  assert.ok(sync.days >= 2, "synced multiple days");
  const row = await waveStore.getCheckin(clientId, "2026-06-14");
  assert.equal(row.objective.recovery, 42, "objective written");
  assert.equal(row.objective.rhr_bpm, 60);
  assert.equal(row.scores.mood, 4, "manual mood preserved");
  assert.equal(row.source, "whoop");

  // objective scan: recovery dropped 70->42, rhr rose 50->60 over the window -> concern flags
  await store.scanObjectiveInflections(clientId, "2026-06-14");
  const flags = await pool.query("SELECT metric, kind FROM wave_flags WHERE client_id=$1", [clientId]);
  assert.ok(flags.rows.some((f) => f.metric === "recovery" && f.kind === "inflection_down"), "recovery drop flagged");

  // purge clears objective, keeps mood
  await store.purgeObjective(clientId);
  const after = await waveStore.getCheckin(clientId, "2026-06-14");
  assert.deepEqual(after.objective, {}, "objective purged");
  assert.equal(after.scores.mood, 4, "mood survives purge");

  await pool.query("DELETE FROM clients WHERE id=$1", [clientId]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  console.log("whoop store ok");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
```

- [ ] **Step 3: Run the smoke**

Run: `DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@localhost:5434/2life node server/scripts/smokeWhoopStore.js`
Expected: PASS — prints `whoop store ok`.

- [ ] **Step 4: Commit**

```bash
git add server/services/whoopStore.js server/scripts/smokeWhoopStore.js
git commit -m "feat(whoop): whoopStore — encrypted connections, sync into objective, objective inflection scan + smoke"
```

---

## Task 15: WHOOP routes (connect / callback / webhook / disconnect / status) + raw-body capture

**Files:**
- Create: `server/routes/whoop.js`
- Modify: `server/index.js` (raw-body capture on `express.json`; mount router)

- [ ] **Step 1: Capture the raw body for webhook signature verification**

In `server/index.js`, change the body parser at line ~52 to stash the raw buffer:

```javascript
app.use(express.json({ limit: "50mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
```

- [ ] **Step 2: Implement the router**

Create `server/routes/whoop.js`:

```javascript
const express = require("express");
const router = express.Router();
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const { canAccessClient } = require("../services/clientAccess");
const { encryptText, decryptText } = require("../services/messengerCrypto");
const whoop = require("../services/whoopClient");
const store = require("../services/whoopStore");
const { sendPushToUsers } = require("../services/messengerPush");
const { sendTo } = require("../services/ws");
const { wasJournalNotificationDelivered, recordJournalNotificationDelivery } = require("../services/journalStore");

const CLIENT_ID = process.env.WHOOP_CLIENT_ID || "";
const CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.WHOOP_REDIRECT_URI || "";
const todayIso = () => new Date().toISOString().slice(0, 10);

// state = encrypted {clientId,userId,ts}; integrity-protected by AES-GCM, expires in 10 min.
const makeState = (clientId, userId) => encryptText(JSON.stringify({ clientId, userId, ts: Date.now() }));
const readState = (state) => { try { const s = JSON.parse(decryptText(state)); return Date.now() - s.ts < 600000 ? s : null; } catch { return null; } };

router.get("/wave/whoop/status", requireAuth(), requireSectionRead("wave"), async (req, res) => {
  try {
    const clientId = String(req.query.cid || "");
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа" });
    const conn = await store.getConnectionByClient(clientId);
    res.json({ ok: true, connected: !!(conn && conn.status === "active") });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.get("/wave/whoop/connect", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try {
    const clientId = String(req.query.cid || "");
    if (!CLIENT_ID || !REDIRECT_URI) return res.status(500).json({ error: "WHOOP не сконфигурирован" });
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа" });
    res.redirect(whoop.buildAuthorizeUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: makeState(clientId, req.user.id) }));
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.get("/wave/whoop/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const st = readState(String(state || ""));
    if (!code || !st) return res.status(400).send("Ссылка устарела. Попробуйте подключить WHOOP заново.");
    const tok = await whoop.exchangeCode({ code: String(code), redirectUri: REDIRECT_URI, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    let providerUserId = null;
    try { const prof = await whoop.getJson("/v2/user/profile/basic", tok.access_token); providerUserId = String(prof.user_id ?? prof.id ?? ""); } catch { /* profile path may differ; provider_user_id also learned from webhook */ }
    await store.upsertConnection({ clientId: st.clientId, userId: st.userId, providerUserId,
      accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresIn: tok.expires_in, scopes: String(tok.scope || "").split(" ").filter(Boolean) });
    const conn = await store.getConnectionByClient(st.clientId);
    store.syncConnection(conn, { days: 30 }).then(() => store.scanObjectiveInflections(st.clientId, todayIso())).catch((e) => console.warn("[whoop] backfill failed", e?.message || e));
    res.redirect(`/?cid=${encodeURIComponent(st.clientId)}&sec=wave&whoop=connected`);
  } catch (e) { console.error(e); res.status(500).send("Не удалось подключить WHOOP."); }
});

// Public endpoint — authenticated by signature, NOT by session.
router.post("/wave/whoop/webhook", async (req, res) => {
  try {
    const ok = whoop.verifyWebhookSignature({ timestamp: req.get("X-WHOOP-Signature-Timestamp"), rawBody: req.rawBody, signature: req.get("X-WHOOP-Signature"), secret: CLIENT_SECRET });
    if (!ok) return res.status(401).end();
    res.status(200).end(); // ack fast; process async
    const evt = req.body || {};
    if (!/^(recovery|sleep|workout)\./.test(String(evt.type || ""))) return;
    const conn = await store.getConnectionByProviderUserId(evt.user_id);
    if (!conn) return;
    await store.syncConnection(conn, { days: 3 });
    await store.scanObjectiveInflections(conn.clientId, todayIso());
    const key = todayIso();
    if (!(await wasJournalNotificationDelivered({ userId: conn.userId, kind: "wave_whoop_update", deliveryKey: key }))) {
      await sendPushToUsers({ userIds: [conn.userId], title: "2life", body: "🌊 Твоя волна обновилась", url: `/?cid=${encodeURIComponent(conn.clientId)}&sec=wave` });
      await recordJournalNotificationDelivery({ userId: conn.userId, kind: "wave_whoop_update", deliveryKey: key });
    }
    sendTo(conn.userId, { type: "wave_updated", clientId: conn.clientId });
  } catch (e) { console.error("[whoop] webhook", e?.message || e); }
});

router.post("/wave/whoop/disconnect", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try {
    const clientId = String(req.body?.cid || "");
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа" });
    await store.deleteConnection(clientId);
    if (req.body?.purge) await store.purgeObjective(clientId);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

module.exports = router;
```

> NOTE: the basic-profile path `/v2/user/profile/basic` and its id field are unverified — confirm on first live connect; `provider_user_id` is also captured from the first webhook, so a wrong profile path is non-fatal.

- [ ] **Step 3: Mount the router**

In `server/index.js` add `const whoopRouter = require("./routes/whoop");` and, after `app.use("/api", waveRouter);`, add `app.use("/api", whoopRouter);`.

- [ ] **Step 4: Verify modules load**

Run: `node -e "require('./server/routes/whoop.js'); console.log('whoop router loads')"`
Expected: prints `whoop router loads`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/whoop.js server/index.js
git commit -m "feat(whoop): OAuth connect/callback + signed webhook + disconnect/status routes"
```

---

## Task 16: WHOOP reconcile in the scheduler

**Files:**
- Modify: `server/services/journalNotifications.js`

- [ ] **Step 1: Add the reconcile pass**

Add near the wave functions: ensure `const whoopStore = require("./whoopStore");` is imported, then:

```javascript
async function runWhoopReconcile(now = new Date()) {
  const today = todayIso(now);
  const conns = await whoopStore.listActiveConnections();
  let synced = 0;
  for (const conn of conns) {
    const stale = !conn.lastSyncAt || (now - new Date(conn.lastSyncAt)) > 20 * 3600 * 1000;
    if (!stale) continue;
    try { await whoopStore.syncConnection(conn, { days: 3 }); await whoopStore.scanObjectiveInflections(conn.clientId, today); synced += 1; }
    catch (e) { await whoopStore.setStatus(conn.clientId, "error", String(e?.message || e)).catch(() => {}); }
  }
  return { connections: conns.length, synced };
}
```

> NOTE: this relies on `conn.lastSyncAt` (already exposed by `rowToConn` in Task 14).

In the 9am block of `startJournalNotificationScheduler()` add:
```javascript
      runWhoopReconcile(now).catch((e) => console.warn("[whoop] reconcile failed", e?.message || e));
```
Add `runWhoopReconcile` to `module.exports`.

- [ ] **Step 2: Verify it loads and exports**

Run: `node -e "const m=require('./server/services/journalNotifications.js'); console.log(typeof m.runWhoopReconcile)"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add server/services/journalNotifications.js server/services/whoopStore.js
git commit -m "feat(whoop): daily reconcile sweep for connections with missed webhooks"
```

---

## Task 17: WHOOP UI — connect/disconnect + mood-tap + recovery hero line

**Files:**
- Modify: `src/sections/Wave.jsx`

This extends the Phase 1 component: (a) fetch WHOOP status; (b) for a connected client, replace the 5-slider check-in with a 1-tap mood row; (c) when objective data exists, render the recovery hero line; (d) connect/disconnect controls.

- [ ] **Step 1: Add WHOOP state + status fetch**

In `WaveSection`, add state and extend `load()`:

```jsx
  const [whoopConnected, setWhoopConnected] = useState(false);
  // inside load(), after the series/today fetches:
  if (isClient) {
    const wRes = await authFetch(`/api/wave/whoop/status?cid=${encodeURIComponent(cid)}`).catch(() => null);
    if (wRes && wRes.ok) setWhoopConnected(!!(await wRes.json()).connected);
  }
```

- [ ] **Step 2: Render an auto-scaled, metric-selectable objective curve**

Add a per-metric scale config + selected-metric state near the other `useState`s:

```jsx
  const OBJ_LINES = [
    { key: "recovery", label: "Восстановление", min: 0, max: 100 },
    { key: "sleep_perf", label: "Сон %", min: 0, max: 100 },
    { key: "rhr_bpm", label: "Пульс покоя", min: 40, max: 90 },
    { key: "hrv_ms", label: "ВСР", min: 0, max: 150 },
    { key: "strain", label: "Нагрузка", min: 0, max: 21 },
  ];
  const [metric, setMetric] = useState("recovery");
```

Replace the Phase-1 `curveSeries`/`points` block with this metric-aware version (uses the `minScore` param added to `toPolylinePoints` in Task 7):

```jsx
  const hasObjective = series.some((d) => d.objective && Object.keys(d.objective).length);
  const activeLine = hasObjective
    ? (OBJ_LINES.find((l) => l.key === metric) || OBJ_LINES[0])
    : { key: "momentum", label: "Самочувствие", min: 1, max: 5 };
  const curveSeries = (hasObjective
    ? series.map((d) => ({ date: d.date, value: d.objective?.[activeLine.key], mood: d.scores?.mood }))
    : series.map((d) => ({ date: d.date, value: d.momentum, mood: d.scores?.mood }))
  ).filter((d) => Number.isFinite(Number(d.value)));
  const points = toPolylinePoints(curveSeries, { width: W, height: H, pad: 16, minScore: activeLine.min, maxScore: activeLine.max });
  const normY = (v) => 16 + (H - 32) * (1 - Math.max(0, Math.min(1, (Number(v) - activeLine.min) / ((activeLine.max - activeLine.min) || 1))));
```

Update the curve card: (a) the hero label becomes `{activeLine.label}{hasObjective ? " (WHOOP)" : ""}`; (b) add a metric chooser shown when `hasObjective`; (c) each point's circle uses `cy={normY(d.value)}` (replacing the Phase-1 fixed `y` formula); (d) add a mood dot per day.

```jsx
      {hasObjective && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {OBJ_LINES.map((l) => (
            <button key={l.key} onClick={() => setMetric(l.key)}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                color: metric === l.key ? "#fff" : $.txS, background: metric === l.key ? $.ac : "transparent",
                border: `1px solid ${metric === l.key ? $.ac : $.brd}` }}>{l.label}</button>
          ))}
        </div>
      )}
```

In the per-point `<g>` map inside the SVG, set the main circle to `cy={normY(d.value)}` and add a mood overlay dot (color encodes the day's mood):

```jsx
                {Number.isFinite(Number(d.mood)) && (
                  <circle cx={x} cy={normY(d.value)} r="2.5" fill={d.mood >= 4 ? $.ac : d.mood <= 2 ? $.dn : $.txM} />
                )}
```

(The delta chips from Phase 1 stay only in the subjective/manual mode; under `hasObjective` they may be hidden since the objective curve carries the trend.)

- [ ] **Step 3: Consent disclosure + connect / disconnect (client only)**

Above the curve card, client-only. The connect card carries the spec-required plain-language consent (what we pull, who sees it, that it is revocable) **before** the redirect to WHOOP:

```jsx
      {isClient && !whoopConnected && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: $.tx, marginBottom: 6 }}>Подключи WHOOP — волна заполнится сама</div>
          <div style={{ fontSize: 12, color: $.txM, lineHeight: 1.5, marginBottom: 12 }}>
            Мы будем получать из твоего WHOOP: сон, пульс покоя, ВСР, восстановление, нагрузку и вес (если он есть).
            Эти данные видит только твой врач. Отключить WHOOP и удалить собранные данные можно в любой момент — кнопкой ниже после подключения.
          </div>
          <a href={`/api/wave/whoop/connect?cid=${encodeURIComponent(cid)}`}
            style={{ display: "inline-block", padding: "10px 16px", background: $.ac, color: "#fff", borderRadius: 10, textDecoration: "none", fontWeight: 700 }}>Подключить WHOOP</a>
        </div>
      )}
      {isClient && whoopConnected && (
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: $.ac }}>✓ WHOOP подключён</span>
          <button onClick={async () => { if (!confirm("Отключить WHOOP?")) return;
            const purge = confirm("Также удалить уже собранные данные WHOOP? OK — удалить, Отмена — оставить.");
            await authFetch(`/api/wave/whoop/disconnect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid, purge }) }).catch(() => null);
            await load(); }}
            style={{ padding: "8px 12px", background: "transparent", color: $.txM, border: `1px solid ${$.brd}`, borderRadius: 8, cursor: "pointer" }}>Отключить</button>
        </div>
      )}
```

- [ ] **Step 4: 1-tap mood for connected clients (replaces the 5-slider card)**

Wrap the existing 5-slider check-in card in `{isClient && !whoopConnected && (...)}`, and add this connected-client card:

```jsx
      {isClient && whoopConnected && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: $.tx, marginBottom: 10 }}>Как настроение сегодня?</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
            {[{ e: "😣", v: 1 }, { e: "😕", v: 2 }, { e: "😐", v: 3 }, { e: "🙂", v: 4 }, { e: "😀", v: 5 }].map((m) => (
              <button key={m.v} onClick={async () => { setSaving(true);
                  const res = await authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/checkin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scores: { mood: m.v } }) }).catch(() => null);
                  setSaving(false); if (res && res.ok) await load(); }}
                disabled={saving}
                style={{ flex: 1, fontSize: 28, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                  border: `2px solid ${today?.checkin?.scores?.mood === m.v ? $.ac : $.brd}`,
                  background: today?.checkin?.scores?.mood === m.v ? $.acD : "transparent" }}>{m.e}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: $.txM, marginTop: 8 }}>Тело подтянулось из WHOOP автоматически.</div>
        </div>
      )}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds. Manual review: non-WHOOP client still sees sliders; connected client sees emoji row + recovery hero line.

- [ ] **Step 6: Commit**

```bash
git add src/sections/Wave.jsx
git commit -m "feat(whoop): Wave UI — connect/disconnect, 1-tap mood, recovery hero line"
```

---

## Task 18: WHOOP static verify + npm wiring + env docs

**Files:**
- Create: `scripts/verifyWhoopStatic.mjs`
- Modify: `package.json`, `server/package.json`
- Modify: `.env.example` (if present; else note in README)

- [ ] **Step 1: Static check**

Create `scripts/verifyWhoopStatic.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const routes = read("../server/routes/whoop.js");
assert.ok(/verifyWebhookSignature/.test(routes), "webhook verifies signature");
assert.ok(/requireSectionWrite\("wave"\)/.test(routes) && /canAccessClient/.test(routes), "connect/disconnect guarded");

const index = read("../server/index.js");
assert.ok(/req\.rawBody\s*=\s*buf/.test(index), "raw body captured for webhook HMAC");
assert.ok(/whoopRouter/.test(index), "whoop router mounted");

const sec = read("../src/sections/Wave.jsx");
assert.ok(/whoop\/connect/.test(sec), "connect entrypoint in UI");
assert.ok(/Отключить/.test(sec), "disconnect control in UI");

console.log("whoop static ok");
```

- [ ] **Step 2: Run it**

Run: `node scripts/verifyWhoopStatic.mjs`
Expected: PASS — prints `whoop static ok`.

- [ ] **Step 3: Wire npm scripts + env**

Root `package.json` `scripts`: add `"verify:whoop-static": "node scripts/verifyWhoopStatic.mjs",`
`server/package.json` `scripts`: add `"verify:whoop-client": "node scripts/verifyWhoopClient.js",` and `"smoke:whoop-store": "node scripts/smokeWhoopStore.js",`
Add to `.env.example` (create if missing): `WHOOP_CLIENT_ID=`, `WHOOP_CLIENT_SECRET=`, `WHOOP_REDIRECT_URI=`.

- [ ] **Step 4: Run the full wave+whoop verify sweep**

Run (server dir): `npm run verify:wave-inflection && npm run verify:whoop-client`
Run (root): `node scripts/verifyWaveCurve.mjs && node scripts/verifyWaveStatic.mjs && node scripts/verifyWhoopStatic.mjs`
Run (DB-backed): the two smokes from Tasks 3 and 14.
Expected: all print their `... ok` lines.

- [ ] **Step 5: Commit**

```bash
git add scripts/verifyWhoopStatic.mjs package.json server/package.json .env.example
git commit -m "test(whoop): static verify + npm wiring + env example"
```

**✅ Phase 2 ships here:** WHOOP clients connect in 2 taps, objective data auto-fills the curve, the recovery hero line + 1-tap mood render, objective inflections flag for the doctor, and disconnect/purge works.

---

## Post-implementation (manual, owner-side)
- Live OAuth round-trip with the real WHOOP app (connect a test account, confirm callback + first sync).
- Confirm the unverified specifics against the first real payloads: `/developer` API prefix, `hrv_rmssd_milli` unit, basic-profile path/id field, body-measurement path (weight line).
- Register the production webhook URL in the WHOOP dashboard; confirm a real `recovery.updated` passes signature verification and triggers the "волна обновилась" push.
- Confirm the WHOOP dev-app user cap covers the active client count.
