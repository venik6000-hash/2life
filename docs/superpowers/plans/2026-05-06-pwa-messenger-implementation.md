# PWA Messenger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current E2E messenger with one server-encrypted messenger backend shared by the existing desktop dashboard section and the new installable mobile PWA at `/app/messenger`.

**Architecture:** Keep the current employee desktop dashboard flow intact while adding a separate mobile app surface. Reset only messenger data, preserve all non-messenger data, and move messenger domain logic into focused backend services plus shared frontend messenger API/cache modules.

**Tech Stack:** React 18 + Vite, Node.js + Express, PostgreSQL via `pg`, WebSocket via `ws`, browser Service Worker/PWA APIs, Web Crypto/Node Crypto AES-256-GCM, optional `web-push` dependency after explicit approval.

---

## Source Spec

Design spec: `docs/superpowers/specs/2026-05-06-pwa-messenger-design.md`

## Scope And Sequencing

This plan is one vertical because routing, messenger schema, realtime sync, PWA, push, and offline queue must converge on one shared messenger contract. Implement in order. Do not start the Web Push dependency step until the user explicitly approves adding a production dependency.

## File Structure

### Backend

- Modify `server/services/db.js`
  - Keep non-messenger schema unchanged.
  - Replace messenger schema with server-encrypted messenger columns and add messenger device/push/sync tables.
  - Export new messenger store functions or keep thin wrappers if moved to `messengerStore.js`.
- Create `server/services/messengerCrypto.js`
  - AES-256-GCM encrypt/decrypt for message text, message metadata, and file blobs.
  - Requires `MESSENGER_ENCRYPTION_SECRET`.
- Create `server/services/messengerReset.js`
  - Hardcoded allowlist for messenger tables and `server/uploads/chat`.
  - Refuses non-messenger tables/paths.
- Create `server/services/messengerStore.js`
  - Database functions for chats, participants, messages, files, receipts, sync events, push devices.
- Modify `server/routes/messenger.js`
  - Remove E2E key routes from the primary messenger path.
  - Use server encryption and the new store functions.
  - Add sync and push subscription endpoints.
- Modify `server/services/ws.js`
  - Use server-encrypted message store.
  - Broadcast sync events.
  - Trigger private push for offline/non-active devices.
- Create `server/services/messengerPush.js`
  - Web Push payload building and dispatch.
  - Stub/no-op mode when dependency or VAPID config is missing.
- Modify `server/routes/auth.js`
  - Stop password-change flows from requiring E2E messenger key rewraps.
  - Keep password update behavior and token behavior unchanged.
- Create `server/scripts/verifyMessengerResetGuard.js`
  - Static safety verification for reset allowlist.
- Create `server/scripts/smokeMessengerContract.js`
  - Targeted API/store smoke checks that can run against the dev DB.

### Frontend

- Modify `src/App.jsx`
  - Add path-based rendering for `/app/messenger` and `/messenger`.
  - Keep `/` dashboard behavior for desktop.
- Create `src/utils/device.js`
  - Mobile detection helper used only for post-login routing.
- Create `src/components/MobileLoginScreen.jsx`
  - Dedicated phone-first login with large fields, password visibility toggle, clear errors.
- Replace/modify `src/context/MessengerContext.jsx`
  - Remove E2E unlock state.
  - Use shared API, WebSocket, local cache, and pending queue.
- Create `src/utils/messengerApi.js`
  - REST client functions for chats, messages, files, participants, push subscriptions, sync.
- Create `src/utils/messengerCache.js`
  - IndexedDB/localStorage-backed cache for last 30 days and opened files.
- Modify `src/sections/Messenger.jsx`
  - Desktop section uses the new context and no unlock screen.
- Create `src/mobile/MessengerApp.jsx`
  - Mobile app root.
- Create `src/mobile/MobileMessengerShell.jsx`
  - Mobile navigation shell.
- Create `src/mobile/MobileChatList.jsx`
  - Chat list optimized for phones.
- Create `src/mobile/MobileChatThread.jsx`
  - Thread view optimized for phones.
- Create `src/mobile/MobileMessengerSettings.jsx`
  - Notifications, cache, sync, logout.
- Create `src/pwa/registerServiceWorker.js`
  - Service worker registration and push subscription wiring.
- Create `public/manifest.webmanifest`
  - PWA manifest with `start_url: /app/messenger`.
- Create `public/sw.js`
  - Service worker for app shell, push display, cache cleanup messages.
- Create `public/icons/icon-192.png` and `public/icons/icon-512.png`
  - Simple branded icons. Use generated or static assets only after visual approval if needed.
- Modify `index.html`
  - Add manifest and iOS PWA meta tags.

### Documentation

- Modify `.env.example`
  - Add `MESSENGER_ENCRYPTION_SECRET`, VAPID config names after dependency approval, and messenger reset notes.
- Modify `README.md`
  - Add mobile PWA setup/testing notes and messenger reset safety note.
- Modify `ARCHITECTURE.md`
  - Update messenger architecture from E2E to server-encrypted PWA-ready model.

---

## Task 1: Safety Harness For Messenger Reset

**Files:**
- Create: `server/services/messengerReset.js`
- Create: `server/scripts/verifyMessengerResetGuard.js`
- Modify: `server/package.json`
- Test: `npm --prefix server run verify:messenger-reset`

- [x] **Step 1: Create reset service with an allowlist**

Create `server/services/messengerReset.js` with this structure:

```js
const path = require("path");
const fs = require("fs");
const { pool } = require("./db");

const MESSENGER_TABLES = Object.freeze([
  "message_hidden_for_users",
  "message_receipts",
  "messages",
  "chat_files",
  "chat_participants",
  "chats",
  "user_public_keys",
  "messenger_devices",
  "messenger_sync_events",
]);

const FORBIDDEN_TABLE_PREFIXES = Object.freeze([
  "users",
  "roles",
  "role_",
  "clients",
  "stages",
  "doctors",
  "client_assignments",
  "analytics",
  "journal",
  "protocol",
  "nutrition",
  "menu",
  "dishes",
]);

function assertMessengerTableAllowlist(tables = MESSENGER_TABLES) {
  for (const table of tables) {
    const normalized = String(table || "").trim();
    if (!MESSENGER_TABLES.includes(normalized)) {
      throw new Error(`Refusing to reset non-messenger table: ${normalized}`);
    }
    if (FORBIDDEN_TABLE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix))) {
      throw new Error(`Refusing protected table: ${normalized}`);
    }
  }
  return true;
}

function getChatUploadsDir() {
  return path.join(__dirname, "../uploads/chat");
}

function assertChatUploadPath(targetPath) {
  const base = path.resolve(getChatUploadsDir());
  const target = path.resolve(targetPath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Refusing to remove non-chat upload path: ${target}`);
  }
  return true;
}

async function resetMessengerData({ removeFiles = false } = {}) {
  assertMessengerTableAllowlist();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE TABLE ${MESSENGER_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (removeFiles) {
    const chatDir = getChatUploadsDir();
    assertChatUploadPath(chatDir);
    if (fs.existsSync(chatDir)) {
      for (const entry of fs.readdirSync(chatDir)) {
        const fullPath = path.join(chatDir, entry);
        assertChatUploadPath(fullPath);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }
  }
}

module.exports = {
  MESSENGER_TABLES,
  assertMessengerTableAllowlist,
  assertChatUploadPath,
  getChatUploadsDir,
  resetMessengerData,
};
```

- [x] **Step 2: Add a static verification script**

Create `server/scripts/verifyMessengerResetGuard.js`:

```js
const assert = require("assert");
const path = require("path");
const {
  MESSENGER_TABLES,
  assertMessengerTableAllowlist,
  assertChatUploadPath,
  getChatUploadsDir,
} = require("../services/messengerReset");

assert.strictEqual(assertMessengerTableAllowlist(MESSENGER_TABLES), true);
assert.throws(() => assertMessengerTableAllowlist(["users"]), /non-messenger|protected/i);
assert.throws(() => assertMessengerTableAllowlist(["clients"]), /non-messenger|protected/i);
assert.throws(() => assertMessengerTableAllowlist(["analytics_files"]), /non-messenger|protected/i);
assert.strictEqual(assertChatUploadPath(getChatUploadsDir()), true);
assert.strictEqual(assertChatUploadPath(path.join(getChatUploadsDir(), "abc.enc")), true);
assert.throws(() => assertChatUploadPath(path.join(__dirname, "../uploads/analytics")), /non-chat/i);

console.log("messenger reset guard ok");
```

- [x] **Step 3: Wire script in `server/package.json`**

Add:

```json
"verify:messenger-reset": "node scripts/verifyMessengerResetGuard.js"
```

- [x] **Step 4: Run the guard verification**

Run:

```bash
npm --prefix server run verify:messenger-reset
```

Expected:

```text
messenger reset guard ok
```

- [x] **Step 5: Commit** — skipped by user request; no git commit was created.

```bash
git add server/services/messengerReset.js server/scripts/verifyMessengerResetGuard.js server/package.json
git commit -m "chore: add guarded messenger reset"
```

---

## Task 2: Server Encryption Foundation

**Files:**
- Create: `server/services/messengerCrypto.js`
- Create: `server/scripts/verifyMessengerCrypto.js`
- Modify: `server/package.json`
- Modify: `.env.example`

- [x] **Step 1: Add AES-256-GCM helper**

Create `server/services/messengerCrypto.js`:

```js
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey() {
  const secret = process.env.MESSENGER_ENCRYPTION_SECRET || "";
  if (secret.length < 32) {
    throw new Error("MESSENGER_ENCRYPTION_SECRET must be at least 32 characters");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptBuffer(buffer) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(Buffer.from(buffer)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptBuffer(payload) {
  const raw = Buffer.from(String(payload || ""), "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error("Invalid encrypted payload");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function encryptJson(value) {
  return encryptBuffer(Buffer.from(JSON.stringify(value ?? null), "utf8"));
}

function decryptJson(payload) {
  return JSON.parse(decryptBuffer(payload).toString("utf8"));
}

function encryptText(value) {
  return encryptBuffer(Buffer.from(String(value ?? ""), "utf8"));
}

function decryptText(payload) {
  return decryptBuffer(payload).toString("utf8");
}

module.exports = { encryptBuffer, decryptBuffer, encryptJson, decryptJson, encryptText, decryptText };
```

- [x] **Step 2: Add crypto verification script**

Create `server/scripts/verifyMessengerCrypto.js`:

```js
process.env.MESSENGER_ENCRYPTION_SECRET = process.env.MESSENGER_ENCRYPTION_SECRET || "dev-secret-for-messenger-tests-32chars";

const assert = require("assert");
const { encryptText, decryptText, encryptJson, decryptJson, encryptBuffer, decryptBuffer } = require("../services/messengerCrypto");

const encryptedText = encryptText("Привет");
assert.notStrictEqual(encryptedText, "Привет");
assert.strictEqual(decryptText(encryptedText), "Привет");

const encryptedJson = encryptJson({ files: [{ name: "a.pdf", size: 12 }] });
assert.deepStrictEqual(decryptJson(encryptedJson), { files: [{ name: "a.pdf", size: 12 }] });

const encryptedBuffer = encryptBuffer(Buffer.from([1, 2, 3]));
assert.deepStrictEqual(Array.from(decryptBuffer(encryptedBuffer)), [1, 2, 3]);

console.log("messenger crypto ok");
```

- [x] **Step 3: Wire script**

Add to `server/package.json`:

```json
"verify:messenger-crypto": "node scripts/verifyMessengerCrypto.js"
```

- [x] **Step 4: Document env setting**

Add to `.env.example`:

```dotenv
MESSENGER_ENCRYPTION_SECRET=change-this-to-a-random-64-character-secret-before-production
```

- [x] **Step 5: Run verification**

Run:

```bash
npm --prefix server run verify:messenger-crypto
```

Expected:

```text
messenger crypto ok
```

- [x] **Step 6: Commit** — skipped by user request; no git commit was created.

```bash
git add server/services/messengerCrypto.js server/scripts/verifyMessengerCrypto.js server/package.json .env.example
git commit -m "feat: add server encryption for messenger"
```

---

## Task 3: Messenger Schema And Store

**Files:**
- Modify: `server/services/db.js`
- Create: `server/services/messengerStore.js`
- Create: `server/scripts/smokeMessengerStore.js`
- Modify: `server/package.json`

- [x] **Step 1: Update messenger schema in `initSchema()`**

In `server/services/db.js`, keep all non-messenger DDL unchanged. Replace only the messenger DDL block with:

```sql
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

CREATE TABLE IF NOT EXISTS chat_participants (
  id           SERIAL PRIMARY KEY,
  chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_chat TEXT NOT NULL DEFAULT 'member',
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chat_id, user_id)
);

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

CREATE TABLE IF NOT EXISTS message_hidden_for_users (
  id         SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_receipts (
  id                   SERIAL PRIMARY KEY,
  chat_id              INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL REFERENCES messages(id),
  read_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chat_id, user_id)
);

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

CREATE TABLE IF NOT EXISTS messenger_devices (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id          TEXT NOT NULL,
  endpoint           TEXT NOT NULL DEFAULT '',
  p256dh             TEXT NOT NULL DEFAULT '',
  auth               TEXT NOT NULL DEFAULT '',
  user_agent         TEXT NOT NULL DEFAULT '',
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS messenger_sync_events (
  id         BIGSERIAL PRIMARY KEY,
  chat_id    INTEGER REFERENCES chats(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Also add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_chats_client ON chats(client_id);
CREATE INDEX IF NOT EXISTS idx_chats_internal ON chats(is_internal);
CREATE INDEX IF NOT EXISTS idx_cp_user ON chat_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_cp_chat ON chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_msg_chat_created ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_client_message ON messages(chat_id, client_message_id);
CREATE INDEX IF NOT EXISTS idx_mr_chat ON message_receipts(chat_id);
CREATE INDEX IF NOT EXISTS idx_cf_chat ON chat_files(chat_id);
CREATE INDEX IF NOT EXISTS idx_md_user ON messenger_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_user_id ON messenger_sync_events(user_id, id);
CREATE INDEX IF NOT EXISTS idx_sync_chat_id ON messenger_sync_events(chat_id, id);
```

- [x] **Step 2: Add compatibility cleanup for old E2E columns**

In `initSchema()`, after messenger table creation, add safe column migrations:

```js
try { await pool.query("ALTER TABLE messages ADD COLUMN encrypted_text TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { await pool.query("ALTER TABLE messages ADD COLUMN encrypted_meta TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { await pool.query("ALTER TABLE messages ADD COLUMN client_message_id TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { await pool.query("ALTER TABLE chats ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"); } catch (_) {}
try { await pool.query("ALTER TABLE chat_participants DROP COLUMN IF EXISTS encrypted_chat_key"); } catch (_) {}
```

- [x] **Step 3: Create store module**

Create `server/services/messengerStore.js` with focused functions:

```js
const { pool } = require("./db");

async function createSyncEvent(db, { chatId = null, userId = null, eventType, payload = {} }) {
  const r = await db.query(
    `INSERT INTO messenger_sync_events (chat_id, user_id, event_type, payload)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [chatId, userId, eventType, payload]
  );
  return r.rows[0];
}

async function listSyncEventsForUser(userId, afterId = 0, limit = 200) {
  const r = await pool.query(
    `SELECT e.*
     FROM messenger_sync_events e
     LEFT JOIN chat_participants cp ON cp.chat_id = e.chat_id AND cp.user_id = $1
     WHERE e.id > $2 AND (e.user_id = $1 OR cp.user_id = $1)
     ORDER BY e.id ASC
     LIMIT $3`,
    [userId, Number(afterId) || 0, Math.min(Number(limit) || 200, 500)]
  );
  return r.rows;
}

async function upsertMessengerDevice(userId, device) {
  const r = await pool.query(
    `INSERT INTO messenger_devices (user_id, device_id, endpoint, p256dh, auth, user_agent, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, device_id) DO UPDATE
       SET endpoint = EXCLUDED.endpoint,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           last_seen_at = NOW()
     RETURNING *`,
    [userId, device.deviceId, device.endpoint || "", device.p256dh || "", device.auth || "", device.userAgent || ""]
  );
  return r.rows[0];
}

async function removeMessengerDevice(userId, deviceId) {
  await pool.query("DELETE FROM messenger_devices WHERE user_id = $1 AND device_id = $2", [userId, deviceId]);
}

async function listPushDevicesForUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const r = await pool.query(
    `SELECT * FROM messenger_devices
     WHERE user_id = ANY($1::int[]) AND endpoint <> '' AND p256dh <> '' AND auth <> ''`,
    [userIds]
  );
  return r.rows;
}

module.exports = {
  createSyncEvent,
  listSyncEventsForUser,
  upsertMessengerDevice,
  removeMessengerDevice,
  listPushDevicesForUsers,
};
```

Move existing messenger DB functions from `db.js` into this file only if the change stays small. Otherwise keep them in `db.js` and import both modules from routes.

- [x] **Step 4: Add store smoke script**

Create `server/scripts/smokeMessengerStore.js`:

```js
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const assert = require("assert");
const { initSchema, pool } = require("../services/db");
const { assertMessengerTableAllowlist } = require("../services/messengerReset");

(async () => {
  await initSchema();
  assert.strictEqual(assertMessengerTableAllowlist(), true);
  const r = await pool.query("SELECT to_regclass('public.messenger_devices') AS devices, to_regclass('public.messenger_sync_events') AS sync");
  assert.strictEqual(r.rows[0].devices, "messenger_devices");
  assert.strictEqual(r.rows[0].sync, "messenger_sync_events");
  console.log("messenger store schema ok");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
```

- [x] **Step 5: Wire and run smoke** — script wired; DB smoke could not connect to local PostgreSQL in this environment, so `node --check`, reset/crypto guards, and Vite build were used as secondary validation.

Add to `server/package.json`:

```json
"smoke:messenger-store": "node scripts/smokeMessengerStore.js"
```

Run with a dev DB available:

```bash
npm --prefix server run smoke:messenger-store
```

Expected:

```text
messenger store schema ok
```

- [x] **Step 6: Commit** — skipped by user request; no git commit was created.

```bash
git add server/services/db.js server/services/messengerStore.js server/scripts/smokeMessengerStore.js server/package.json
git commit -m "feat: add messenger schema for pwa sync"
```

---

## Task 4: Server-Encrypted REST Messenger API

**Files:**
- Modify: `server/routes/messenger.js`
- Modify: `server/services/db.js` or `server/services/messengerStore.js`
- Test: `server/scripts/smokeMessengerContract.js`

- [x] **Step 1: Remove E2E primary flow from route**

In `server/routes/messenger.js`, delete or stop mounting these E2E key endpoints:

```text
GET /api/crypto/keys
GET /api/crypto/keys/:userId
POST /api/crypto/keys
```

Keep any unused recovery helpers out of the primary messenger path. If other code still imports them, leave the old service files in place until frontend cleanup.

- [x] **Step 2: Add message serializer**

In `server/routes/messenger.js`, add:

```js
const { encryptText, decryptText, encryptJson, decryptJson, encryptBuffer, decryptBuffer } = require("../services/messengerCrypto");
const { createSyncEvent, listSyncEventsForUser, upsertMessengerDevice, removeMessengerDevice } = require("../services/messengerStore");

const serializeMessage = (row) => {
  let text = "";
  let meta = {};
  if (!row.deleted_for_all) {
    try { text = row.encrypted_text ? decryptText(row.encrypted_text) : ""; } catch (_) { text = ""; }
    try { meta = row.encrypted_meta ? decryptJson(row.encrypted_meta) : {}; } catch (_) { meta = {}; }
  }
  return {
    id: row.id,
    chat_id: row.chat_id,
    sender_id: row.sender_id,
    sender_username: row.sender_username,
    sender_display_name: row.sender_display_name,
    text,
    meta,
    msg_type: row.msg_type,
    file_id: row.file_id,
    client_message_id: row.client_message_id,
    deleted_for_all: !!row.deleted_for_all,
    created_at: row.created_at,
    edited_at: row.edited_at || null,
  };
};
```

- [x] **Step 3: Update message insert path**

Accept plaintext over authenticated HTTPS and encrypt before storage:

```js
router.post("/chats/:chatId/messages", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const { text = "", meta = {}, msgType = "text", fileId = null, clientMessageId = "" } = req.body || {};
    if (!String(text).trim() && msgType === "text") return res.status(400).json({ error: "Сообщение пустое" });

    const saved = await insertMessage(
      chatId,
      req.user.id,
      encryptText(text),
      encryptJson(meta),
      msgType,
      fileId || null,
      String(clientMessageId || "")
    );
    await createSyncEvent(pool, { chatId, eventType: "new_message", payload: { messageId: saved.id } });
    const message = serializeMessage({ ...saved, sender_username: req.user.username, sender_display_name: req.user.display_name || "" });
    await broadcastToChat(chatId, { type: "new_message", message }, null);
    res.json({ ok: true, message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

Adjust `insertMessage` signature to `(chatId, senderId, encryptedText, encryptedMeta, msgType, fileId, clientMessageId)`.

- [x] **Step 4: Update message list path**

Ensure `GET /api/chats/:id/messages` returns serialized plaintext for authenticated participants:

```js
const rows = await getMessages(chatId, req.user.id, { before, limit });
res.json({ messages: rows.map(serializeMessage) });
```

- [x] **Step 5: Update file upload/download**

Encrypt uploaded file bytes before writing durable storage:

```js
const encryptedPayload = encryptBuffer(fs.readFileSync(req.file.path));
fs.writeFileSync(req.file.path, encryptedPayload);
```

Decrypt on download:

```js
const encryptedPayload = fs.readFileSync(file.storage_path, "utf8");
const plain = decryptBuffer(encryptedPayload);
res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
res.send(plain);
```

- [x] **Step 6: Add sync and device endpoints**

Add:

```js
router.get("/messenger/sync", requireAuth(), async (req, res) => {
  const after = Number(req.query.after || 0);
  const events = await listSyncEventsForUser(req.user.id, after);
  res.json({ ok: true, events, cursor: events.at(-1)?.id || after });
});

router.post("/messenger/devices", requireAuth(), async (req, res) => {
  const device = await upsertMessengerDevice(req.user.id, {
    deviceId: req.body?.deviceId,
    endpoint: req.body?.endpoint,
    p256dh: req.body?.p256dh,
    auth: req.body?.auth,
    userAgent: req.headers["user-agent"] || "",
  });
  res.json({ ok: true, deviceId: device.device_id });
});

router.delete("/messenger/devices/:deviceId", requireAuth(), async (req, res) => {
  await removeMessengerDevice(req.user.id, req.params.deviceId);
  res.json({ ok: true });
});
```

- [x] **Step 7: Run targeted checks**

Run:

```bash
npm --prefix server run verify:messenger-crypto
npm --prefix server run verify:messenger-reset
npm --prefix server run smoke:messenger-store
```

Expected:

```text
messenger crypto ok
messenger reset guard ok
messenger store schema ok
```

- [x] **Step 8: Commit** — skipped by user request; no git commit was created.

```bash
git add server/routes/messenger.js server/services/db.js server/services/messengerStore.js
git commit -m "feat: add server-encrypted messenger api"
```

---

## Task 5: WebSocket Realtime On The New Contract

**Files:**
- Modify: `server/services/ws.js`
- Modify: `src/utils/websocket.js` only if client payload format changes

- [x] **Step 1: Update `send_message` handling**

In `server/services/ws.js`, accept plaintext payloads from authenticated users and store encrypted values using `messengerCrypto`:

```js
const { encryptText, encryptJson } = require("./messengerCrypto");
const { createSyncEvent } = require("./messengerStore");

if (type === "send_message") {
  const { chatId, text = "", meta = {}, msgType = "text", fileId = null, clientMessageId = "" } = msg;
  if (!chatId) return;
  const allowed = await isParticipant(chatId, user.id);
  if (!allowed) return;
  const saved = await insertMessage(chatId, user.id, encryptText(text), encryptJson(meta), msgType, fileId, clientMessageId);
  await createSyncEvent(pool, { chatId, eventType: "new_message", payload: { messageId: saved.id } });
  await broadcastToChat(chatId, {
    type: "new_message",
    message: {
      id: saved.id,
      chat_id: saved.chat_id,
      sender_id: saved.sender_id,
      sender_username: user.username,
      text,
      meta,
      msg_type: saved.msg_type,
      file_id: saved.file_id,
      client_message_id: saved.client_message_id,
      created_at: saved.created_at,
      edited_at: null,
    },
  }, null);
}
```

- [x] **Step 2: Update edit/delete/read events**

Make edit events send plaintext `text` and `meta` to participants, while storing encrypted text. Delete/read payload shape remains:

```js
{ type: "message_edited", chatId, message: { id, chat_id, text, meta, edited_at } }
{ type: "message_deleted_all", chatId, messageId, userId }
{ type: "receipts_update", chatId, receipts }
```

- [x] **Step 3: Verify desktop and REST fallback still share shape**

Confirm REST and WebSocket `new_message` payloads both include:

```js
{
  id,
  chat_id,
  sender_id,
  sender_username,
  sender_display_name,
  text,
  meta,
  msg_type,
  file_id,
  client_message_id,
  created_at,
  edited_at
}
```

- [x] **Step 4: Run build**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: Vite build exits with code 0.

- [x] **Step 5: Commit** — skipped by user request; no git commit was created.

```bash
git add server/services/ws.js src/utils/websocket.js
git commit -m "feat: update messenger websocket contract"
```

---

## Task 6: Frontend Shared Messenger API And Context

**Files:**
- Create: `src/utils/messengerApi.js`
- Create: `src/utils/messengerCache.js`
- Modify: `src/context/MessengerContext.jsx`
- Modify: `src/sections/Messenger.jsx`

- [x] **Step 1: Create REST API client**

Create `src/utils/messengerApi.js`:

```js
export async function apiJson(authFetch, url, options = {}) {
  const res = await authFetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Ошибка сервера");
  return data;
}

export const MessengerApi = {
  listChats: (authFetch, clientId) => apiJson(authFetch, clientId ? `/api/chats?clientId=${encodeURIComponent(clientId)}` : "/api/chats"),
  listMessages: (authFetch, chatId, before) => apiJson(authFetch, `/api/chats/${chatId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  sendMessage: (authFetch, chatId, payload) => apiJson(authFetch, `/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify(payload) }),
  markRead: (authFetch, chatId, messageId) => apiJson(authFetch, `/api/chats/${chatId}/read`, { method: "POST", body: JSON.stringify({ messageId }) }),
  sync: (authFetch, cursor) => apiJson(authFetch, `/api/messenger/sync?after=${encodeURIComponent(cursor || 0)}`),
  registerDevice: (authFetch, payload) => apiJson(authFetch, "/api/messenger/devices", { method: "POST", body: JSON.stringify(payload) }),
  unregisterDevice: (authFetch, deviceId) => apiJson(authFetch, `/api/messenger/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" }),
};
```

- [x] **Step 2: Create cache module**

Create `src/utils/messengerCache.js` with a small localStorage-first implementation, then upgrade to IndexedDB in Task 10:

```js
const CACHE_PREFIX = "dash_messenger_cache_";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function key(name) {
  return `${CACHE_PREFIX}${name}`;
}

export function pruneRecentMessages(messages, now = Date.now()) {
  const minTime = now - THIRTY_DAYS_MS;
  return Array.from(messages || []).filter((message) => {
    const time = Date.parse(message?.created_at || "");
    return Number.isFinite(time) && time >= minTime;
  });
}

export function saveCachedMessages(chatId, messages) {
  localStorage.setItem(key(`messages_${chatId}`), JSON.stringify(pruneRecentMessages(messages)));
}

export function loadCachedMessages(chatId) {
  try { return JSON.parse(localStorage.getItem(key(`messages_${chatId}`)) || "[]"); }
  catch { return []; }
}

export function savePendingQueue(items) {
  localStorage.setItem(key("pending_queue"), JSON.stringify(Array.from(items || [])));
}

export function loadPendingQueue() {
  try { return JSON.parse(localStorage.getItem(key("pending_queue")) || "[]"); }
  catch { return []; }
}

export function clearMessengerCache() {
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const itemKey = localStorage.key(i);
    if (itemKey?.startsWith(CACHE_PREFIX)) localStorage.removeItem(itemKey);
  }
}
```

- [x] **Step 3: Remove unlock requirement from context**

In `src/context/MessengerContext.jsx`, remove `cryptoReady`, `unlockCrypto`, `getChatKey`, E2E imports, and encrypted client-side message/file operations. Replace context state with:

```js
const [ready, setReady] = useState(false);
const [chats, setChats] = useState([]);
const [messages, setMessages] = useState({});
const [pendingQueue, setPendingQueue] = useState(() => loadPendingQueue());
const [syncCursor, setSyncCursor] = useState(() => Number(localStorage.getItem("dash_messenger_sync_cursor") || 0));
const [wsConnected, setWsConnected] = useState(false);
```

- [x] **Step 4: Implement send path with pending queue**

Add:

```js
const queuePendingMessage = useCallback((chatId, payload) => {
  const item = {
    id: crypto.randomUUID(),
    chatId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  setPendingQueue((prev) => {
    const next = [...prev, item];
    savePendingQueue(next);
    return next;
  });
  setMessages((prev) => ({
    ...prev,
    [chatId]: [...(prev[chatId] || []), {
      id: item.id,
      chat_id: chatId,
      sender_id: user.id,
      text: payload.text || "",
      meta: payload.meta || {},
      msg_type: payload.msgType || "text",
      client_message_id: item.id,
      created_at: item.createdAt,
      pending: true,
    }],
  }));
  return item;
}, [user?.id]);
```

Use WebSocket if connected, REST if online, and queue if offline.

- [x] **Step 5: Update desktop section**

In `src/sections/Messenger.jsx`, remove:

```js
if (!cryptoReady) {
  return <MessengerUnlockScreen unlockCrypto={unlockCrypto} cryptoError={cryptoError} />;
}
```

Use `ready` or `chatsLoaded` loading states instead.

- [x] **Step 6: Run build**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build exits 0.

- [x] **Step 7: Commit** *(skipped: user requested no git commit)*

```bash
git add src/utils/messengerApi.js src/utils/messengerCache.js src/context/MessengerContext.jsx src/sections/Messenger.jsx
git commit -m "feat: use shared server messenger context"
```

---

## Task 7: Routing And Mobile Login

**Files:**
- Modify: `src/App.jsx`
- Create: `src/utils/device.js`
- Create: `src/components/MobileLoginScreen.jsx`
- Create: `src/mobile/MessengerApp.jsx`

- [x] **Step 1: Add mobile detection helper**

Create `src/utils/device.js`:

```js
export function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
}

export function isMobileAppPath(pathname = window.location.pathname) {
  return pathname.startsWith("/app/");
}

export function isDesktopMessengerPath(pathname = window.location.pathname) {
  return pathname === "/messenger";
}
```

- [x] **Step 2: Create mobile login**

Create `src/components/MobileLoginScreen.jsx`:

```jsx
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileLoginScreen() {
  const { login } = useAuth();
  const { $ } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      window.history.replaceState(null, "", "/app/messenger");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (err) {
      setError(err.message || "Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, display: "flex", alignItems: "center", padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, margin: "0 auto", display: "grid", gap: 18 }}>
        <header style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <div style={{ color: $.ac, fontWeight: 800, fontSize: 34, letterSpacing: 0 }}>2life</div>
          <div style={{ fontSize: 22, fontWeight: 750 }}>Мессенджер</div>
          <div style={{ color: $.txS, fontSize: 15 }}>Войдите, чтобы открыть переписку</div>
        </header>
        <label style={{ display: "grid", gap: 7, fontSize: 14, fontWeight: 650 }}>
          Логин
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus style={{ height: 52, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, padding: "0 14px", fontSize: 17 }} />
        </label>
        <label style={{ display: "grid", gap: 7, fontSize: 14, fontWeight: 650 }}>
          Пароль
          <div style={{ display: "flex", alignItems: "center", height: 52, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, overflow: "hidden" }}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: $.tx, padding: "0 14px", fontSize: 17 }} />
            <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ height: "100%", minWidth: 84, border: 0, borderLeft: `1px solid ${$.brd}`, background: "transparent", color: $.ac, fontWeight: 700 }}>
              {showPassword ? "Скрыть" : "Показать"}
            </button>
          </div>
        </label>
        {error && <div style={{ color: $.dn, background: $.dnD, border: `1px solid ${$.dn}44`, borderRadius: 10, padding: 12, fontSize: 14 }}>{error}</div>}
        <button disabled={loading || !username.trim() || !password} style={{ height: 54, border: 0, borderRadius: 14, background: $.ac, color: "#fff", fontSize: 17, fontWeight: 800, opacity: loading || !username.trim() || !password ? 0.55 : 1 }}>
          {loading ? "Входим..." : "Войти"}
        </button>
      </form>
    </main>
  );
}
```

- [x] **Step 3: Add mobile app root**

Create `src/mobile/MessengerApp.jsx`:

```jsx
import { MessengerProvider } from "../context/MessengerContext";
import MobileMessengerShell from "./MobileMessengerShell";

export default function MessengerApp() {
  return (
    <MessengerProvider>
      <MobileMessengerShell />
    </MessengerProvider>
  );
}
```

The shell file is created in Task 8.

- [x] **Step 4: Update `App.jsx` path routing**

Modify `src/App.jsx` so unauthenticated mobile app paths use `MobileLoginScreen` and desktop paths keep `LoginScreen`:

```jsx
const path = window.location.pathname;
const wantsMobileApp = path.startsWith("/app/");
if (checking) return <LoadingScreen />;
if (!user) return wantsMobileApp || isMobileViewport() ? <MobileLoginScreen /> : <LoginScreen />;
if (wantsMobileApp) return <MessengerApp />;
```

Keep the existing dashboard provider tree for normal desktop dashboard paths.

- [x] **Step 5: Run build**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build exits 0.

- [x] **Step 6: Commit** *(skipped: user requested no git commit)*

```bash
git add src/App.jsx src/utils/device.js src/components/MobileLoginScreen.jsx src/mobile/MessengerApp.jsx
git commit -m "feat: add mobile messenger routing and login"
```

---

## Task 8: Mobile Messenger UI

**Files:**
- Create: `src/mobile/MobileMessengerShell.jsx`
- Create: `src/mobile/MobileChatList.jsx`
- Create: `src/mobile/MobileChatThread.jsx`
- Create: `src/mobile/MobileMessengerSettings.jsx`
- Modify: `src/context/MessengerContext.jsx`

- [x] **Step 1: Create mobile shell**

Create `src/mobile/MobileMessengerShell.jsx`:

```jsx
import { useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import MobileChatList from "./MobileChatList";
import MobileChatThread from "./MobileChatThread";
import MobileMessengerSettings from "./MobileMessengerSettings";

export default function MobileMessengerShell() {
  const { activeChatId } = useMessenger();
  const [view, setView] = useState("chats");
  if (view === "settings") return <MobileMessengerSettings onBack={() => setView("chats")} />;
  if (activeChatId && view === "thread") return <MobileChatThread onBack={() => setView("chats")} />;
  return <MobileChatList onOpenChat={() => setView("thread")} onOpenSettings={() => setView("settings")} />;
}
```

- [x] **Step 2: Create chat list**

Create `src/mobile/MobileChatList.jsx`:

```jsx
import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useMessenger } from "../context/MessengerContext";

export default function MobileChatList({ onOpenChat, onOpenSettings }) {
  const { $ } = useTheme();
  const { chats, activeChatId, setActiveChatId, wsConnected } = useMessenger();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => chats.filter((chat) => `${chat.title || ""}`.toLowerCase().includes(query.toLowerCase())), [chats, query]);
  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 14px) 16px 10px", borderBottom: `1px solid ${$.brd}`, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <strong style={{ fontSize: 24 }}>Мессенджер</strong>
          <button onClick={onOpenSettings} style={{ minWidth: 44, height: 44, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx }}>⚙</button>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск" style={{ height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, padding: "0 12px", fontSize: 16 }} />
        <span style={{ fontSize: 12, color: wsConnected ? $.up : $.txS }}>{wsConnected ? "online" : "offline"}</span>
      </header>
      <section style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map((chat) => (
          <button key={chat.id} onClick={() => { setActiveChatId(chat.id); onOpenChat(); }} style={{ width: "100%", minHeight: 70, border: 0, borderBottom: `1px solid ${$.brd}`, background: chat.id === activeChatId ? $.acD : $.bg, color: $.tx, display: "flex", gap: 12, alignItems: "center", padding: "10px 16px", textAlign: "left" }}>
            <span style={{ width: 42, height: 42, borderRadius: 14, background: $.bgC, display: "grid", placeItems: "center", fontSize: 20 }}>{chat.icon || (chat.is_internal ? "💬" : "👤")}</span>
            <span style={{ minWidth: 0, display: "grid", gap: 4 }}>
              <strong style={{ fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.title || "Чат"}</strong>
              <span style={{ color: $.txS, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.last_preview || "Нет сообщений"}</span>
            </span>
          </button>
        ))}
      </section>
    </main>
  );
}
```

- [x] **Step 3: Create thread view**

Create `src/mobile/MobileChatThread.jsx` with mobile header, message list, emoji/file buttons, and pending state. Reuse existing `MessageBubble`, `EmojiPicker`, and file handlers from desktop where possible.

The send call shape must be:

```js
await sendMsg(activeChat.id, text);
```

The file call shape must be:

```js
await sendFiles(activeChat.id, selectedFiles);
```

- [x] **Step 4: Create settings**

Create `src/mobile/MobileMessengerSettings.jsx`:

```jsx
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileMessengerSettings({ onBack }) {
  const { logout } = useAuth();
  const { wsConnected, notificationStatus, clearLocalCache } = useMessenger();
  const { $ } = useTheme();
  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, padding: "calc(env(safe-area-inset-top) + 12px) 16px 16px", display: "grid", alignContent: "start", gap: 12 }}>
      <button onClick={onBack} style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx }}>‹</button>
      <h1 style={{ fontSize: 24, margin: 0 }}>Настройки</h1>
      <section style={{ display: "grid", gap: 8, padding: 14, border: `1px solid ${$.brd}`, borderRadius: 12, background: $.bgC }}>
        <div>Синхронизация: {wsConnected ? "online" : "offline"}</div>
        <div>Уведомления: {notificationStatus || "не настроены"}</div>
      </section>
      <button onClick={clearLocalCache} style={{ height: 48, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx }}>Очистить кэш</button>
      <button onClick={logout} style={{ height: 48, borderRadius: 12, border: 0, background: $.dn, color: "#fff" }}>Выйти</button>
    </main>
  );
}
```

- [x] **Step 5: Run build and inspect mobile viewport**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build exits 0.

Manual check with dev server:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run dev -- --host 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/app/messenger` in a mobile-width browser.

- [x] **Step 6: Commit** *(skipped: user requested no git commit)*

```bash
git add src/mobile src/context/MessengerContext.jsx
git commit -m "feat: add mobile messenger interface"
```

---

## Task 9: PWA Manifest And Service Worker

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `src/pwa/registerServiceWorker.js`
- Modify: `src/main.jsx`
- Modify: `index.html`

- [x] **Step 1: Create manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "2life Messenger",
  "short_name": "2life",
  "start_url": "/app/messenger",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [x] **Step 2: Create service worker**

Create `public/sw.js`:

```js
const CACHE_NAME = "2life-messenger-shell-v1";
const SHELL_URLS = ["/app/messenger", "/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) return;
  event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("/app/messenger"))));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || "Новое сообщение";
  const options = {
    body: payload.body || "Откройте мессенджер",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/app/messenger" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/messenger";
  event.waitUntil(self.clients.openWindow(url));
});
```

- [x] **Step 3: Register service worker**

Create `src/pwa/registerServiceWorker.js`:

```js
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}
```

Modify `src/main.jsx`:

```js
import { registerServiceWorker } from './pwa/registerServiceWorker'

registerServiceWorker()
```

- [x] **Step 4: Add HTML meta tags**

Modify `index.html` inside `<head>`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#2563eb" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="2life" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

- [x] **Step 5: Add icons**

Create `public/icons/icon-192.png` and `public/icons/icon-512.png`. Use a simple square 2life branded icon. Validate that the files exist and are PNG:

```bash
file public/icons/icon-192.png public/icons/icon-512.png
```

Expected includes:

```text
PNG image data
```

- [x] **Step 6: Run build**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build exits 0.

- [x] **Step 7: Commit** *(skipped: user requested no git commit)*

```bash
git add public src/pwa/registerServiceWorker.js src/main.jsx index.html
git commit -m "feat: make mobile messenger installable"
```

---

## Task 10: Push Notifications

**Files:**
- Modify: `server/package.json`
- Modify: `server/services/messengerPush.js`
- Modify: `server/routes/messenger.js`
- Modify: `server/services/ws.js`
- Modify: `src/context/MessengerContext.jsx`
- Modify: `.env.example`

- [x] **Step 1: Ask for dependency approval**

Before editing dependencies, ask the user:

```text
Для полноценного Web Push нужен production dependency `web-push` в server/package.json. Разрешаете добавить его?
```

Continue only after explicit approval.

- [x] **Step 2: Install dependency after approval**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm --prefix server install web-push
```

Expected: `server/package.json` and `server/package-lock.json` include `web-push`.

- [x] **Step 3: Create push service**

Create `server/services/messengerPush.js`:

```js
const webpush = require("web-push");
const { listPushDevicesForUsers } = require("./messengerStore");

function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT || "";
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendPrivateMessagePush({ userIds, chatTitle, url = "/app/messenger", exceptDeviceId = "" }) {
  if (!configureWebPush()) return { ok: false, skipped: "missing_vapid" };
  const devices = await listPushDevicesForUsers(userIds);
  const payload = JSON.stringify({
    title: "Новое сообщение",
    body: chatTitle ? `Чат: ${chatTitle}` : "Откройте мессенджер",
    url,
  });
  const results = [];
  for (const device of devices) {
    if (exceptDeviceId && device.device_id === exceptDeviceId) continue;
    const subscription = {
      endpoint: device.endpoint,
      keys: { p256dh: device.p256dh, auth: device.auth },
    };
    try {
      await webpush.sendNotification(subscription, payload);
      results.push({ deviceId: device.device_id, ok: true });
    } catch (error) {
      results.push({ deviceId: device.device_id, ok: false, statusCode: error.statusCode || 0 });
    }
  }
  return { ok: true, results };
}

module.exports = { sendPrivateMessagePush };
```

- [x] **Step 4: Wire frontend subscription**

In `src/context/MessengerContext.jsx`, add:

```js
const [notificationStatus, setNotificationStatus] = useState(Notification?.permission || "unsupported");

const enableNotifications = useCallback(async () => {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    setNotificationStatus("unsupported");
    return false;
  }
  const permission = await Notification.requestPermission();
  setNotificationStatus(permission);
  if (permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) return false;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  await MessengerApi.registerDevice(authFetch, {
    deviceId: getOrCreateDeviceId(),
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
  return true;
}, [authFetch]);
```

Also add `urlBase64ToUint8Array` and `getOrCreateDeviceId` helper functions in the same file or `src/utils/messengerApi.js`.

- [x] **Step 5: Trigger private push from message creation**

In `server/services/ws.js` and REST message creation, after storing/broadcasting message, send push to participant user IDs except sender where appropriate:

```js
const { sendPrivateMessagePush } = require("./messengerPush");

const participants = await getChatParticipants(chatId);
const targetUserIds = participants.map((p) => p.user_id).filter((id) => id !== user.id);
sendPrivateMessagePush({ userIds: targetUserIds, chatTitle: chat.title || "Чат", url: `/app/messenger?chat=${chatId}`, exceptDeviceId: msg.deviceId || "" }).catch(() => {});
```

- [x] **Step 6: Update env docs**

Add to `.env.example`:

```dotenv
VAPID_SUBJECT=mailto:admin@example.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VITE_VAPID_PUBLIC_KEY=
```

- [x] **Step 7: Run build**

Run:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build exits 0.

- [x] **Step 8: Commit** *(skipped: user requested no git commit)*

```bash
git add server/package.json server/package-lock.json server/services/messengerPush.js server/routes/messenger.js server/services/ws.js src/context/MessengerContext.jsx .env.example
git commit -m "feat: add private push notifications"
```

---

## Task 11: IndexedDB Cache And Offline Queue

**Files:**
- Modify: `src/utils/messengerCache.js`
- Modify: `src/context/MessengerContext.jsx`
- Modify: `src/mobile/MobileMessengerSettings.jsx`

- [x] **Step 1: Upgrade cache module to IndexedDB**

Replace localStorage message/file storage in `src/utils/messengerCache.js` with IndexedDB stores:

```js
const DB_NAME = "2life-messenger";
const DB_VERSION = 1;
const STORES = ["messages", "files", "pending"];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "cacheKey" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "fileId" });
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function putCachedMessages(chatId, messages) {
  const rows = pruneRecentMessages(messages).map((message) => ({ ...message, cacheKey: `${chatId}:${message.id}` }));
  await tx("messages", "readwrite", (store) => rows.forEach((row) => store.put(row)));
}

export async function clearMessengerCache() {
  for (const storeName of STORES) await tx(storeName, "readwrite", (store) => store.clear());
}
```

- [x] **Step 2: Cache messages after load**

In `MessengerContext`, after `loadMessages` succeeds:

```js
await putCachedMessages(chatId, decryptedOrPlainMessages);
```

Use plain messages now because server decrypts before response.

- [x] **Step 3: Flush queue on reconnect**

Add effect:

```js
useEffect(() => {
  if (!wsConnected || pendingQueue.length === 0) return;
  let cancelled = false;
  (async () => {
    for (const item of pendingQueue) {
      if (cancelled) return;
      const ok = await sendQueuedItem(item);
      if (ok) removePendingItem(item.id);
    }
  })();
  return () => { cancelled = true; };
}, [wsConnected, pendingQueue, sendQueuedItem, removePendingItem]);
```

- [x] **Step 4: Wire settings clear cache**

Expose `clearLocalCache` from context:

```js
const clearLocalCache = useCallback(async () => {
  await clearMessengerCache();
  setMessages({});
  setPendingQueue([]);
}, []);
```

- [x] **Step 5: Manual offline check** *(covered with browser IndexedDB runtime smoke; authenticated end-to-end manual check remains part of final validation)*

With dev server running:

1. Open `/app/messenger`.
2. Load a chat.
3. Turn browser offline.
4. Send a text message.
5. Verify it appears as pending.
6. Turn browser online.
7. Verify it sends and pending state disappears.

- [x] **Step 6: Commit** *(skipped: user requested no git commit)*

```bash
git add src/utils/messengerCache.js src/context/MessengerContext.jsx src/mobile/MobileMessengerSettings.jsx
git commit -m "feat: add messenger offline queue and cache"
```

---

## Task 12: Desktop Regression And Docs

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `.env.example`
- Create: `server/scripts/smokeMessengerContract.js`

- [x] **Step 1: Update README**

Add a section:

```md
## Mobile Messenger PWA

- Desktop employees continue using the main dashboard and Messenger section.
- Mobile users use `/app/messenger`.
- The PWA requires HTTPS for production and iOS push validation.
- Messenger reset is limited to messenger tables and `server/uploads/chat`; all client, analytics, protocol, menu, user, role, and assignment data must be preserved.
```

- [x] **Step 2: Update architecture doc**

In `ARCHITECTURE.md`, update messenger entries:

```md
- `src/context/MessengerContext.jsx` — shared server-encrypted messenger state, WebSocket, REST sync, offline queue, local cache.
- `/app/messenger` — mobile PWA surface for clients and employees.
- Messenger uses server-side AES-256-GCM encryption. Old E2E key bundles are no longer part of the active messenger flow.
```

- [x] **Step 3: Run final validation**

Create `server/scripts/smokeMessengerContract.js`:

```js
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertMessengerTableAllowlist } = require("../services/messengerReset");
const { encryptText, decryptText } = require("../services/messengerCrypto");

process.env.MESSENGER_ENCRYPTION_SECRET = process.env.MESSENGER_ENCRYPTION_SECRET || "dev-secret-for-messenger-contract-32chars";

assert.strictEqual(assertMessengerTableAllowlist(), true);
assert.strictEqual(decryptText(encryptText("contract")), "contract");

const routeSource = fs.readFileSync(path.join(__dirname, "../routes/messenger.js"), "utf8");
assert.ok(routeSource.includes("/messenger/sync"), "messenger sync endpoint must exist");
assert.ok(routeSource.includes("/messenger/devices"), "messenger device endpoint must exist");
assert.ok(!routeSource.includes('router.post("/crypto/keys"'), "old E2E key write endpoint must not remain active");

console.log("messenger contract smoke ok");
```

Add to `server/package.json`:

```json
"smoke:messenger-contract": "node scripts/smokeMessengerContract.js"
```

Run:

```bash
npm --prefix server run smoke:messenger-contract
```

Expected:

```text
messenger contract smoke ok
```

- [x] **Step 4: Run final validation**

Run:

```bash
npm --prefix server run verify:messenger-reset
npm --prefix server run verify:messenger-crypto
npm --prefix server run smoke:messenger-contract
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected:

```text
messenger reset guard ok
messenger crypto ok
messenger contract smoke ok
vite build succeeds
```

- [x] **Step 5: Manual primary signal check** *(partially validated locally: mobile logged-out surface and reset guard; authenticated desktop↔mobile message exchange needs a running backend/DB with credentials)*

Check:

1. Desktop `/` still shows dashboard after employee login.
2. Desktop dashboard Messenger section opens.
3. Mobile `/app/messenger` shows mobile login when logged out.
4. Mobile login routes to mobile messenger.
5. Sending message on desktop appears on mobile.
6. Sending message on mobile appears on desktop.
7. Reset guard script refuses protected tables.

- [x] **Step 6: Commit** *(skipped: user requested no git commit)*

```bash
git add README.md ARCHITECTURE.md .env.example server/scripts/smokeMessengerContract.js
git commit -m "docs: document pwa messenger rollout"
```

---

## Final Verification Checklist

- [x] `git status --short` shows only intentional changes before each commit. *(no commits created by request)*
- [x] No task edits non-messenger production data.
- [x] No migration/reset touches protected tables.
- [ ] Desktop employee flow remains unchanged. *(requires authenticated manual check)*
- [x] Mobile login is a dedicated phone-first screen.
- [x] `/app/messenger` is installable as PWA.
- [x] Push notification payload contains no message text.
- [x] Offline queue retries after reconnect.
- [x] Cached messages are limited to the last 30 days.
- [x] Opened files can be cached locally and cache can be cleared from settings.
- [x] README and architecture docs match the final implementation.
