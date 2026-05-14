# Messenger Telegram-parity Implementation Plan (Sub-project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 Telegram-parity features to the existing messenger (mobile context menu, multi-select, reply-to, pin for-all/for-me, push pre-prompt + iOS install banner, settings tab redesign, in-chat + global search, @-mentions) without breaking the DB schema, push notifications, or existing mobile/desktop UX.

**Architecture:** Additive DB migrations (`try { ALTER TABLE ... } catch (_) {}` pattern already used in `initSchema()`), new REST endpoints layered on existing patterns in `server/routes/messenger.js`, two new WS events (`message_pinned`/`message_unpinned`) that old clients can safely ignore, opt-in body fields (`replyToMessageId`, `mentionedUserIds`) on existing `POST /messages`. Shared UI components (`MessengerPinBar`, `MessengerMentionPicker`) used by both `MessengerChatWindow.jsx` (desktop) and `MobileChatThread.jsx` (mobile). Soft pre-prompt + iOS banner gate the existing `enableNotifications()` flow without touching `messengerPush.js`/`sw.js`.

**Tech Stack:** PostgreSQL (raw SQL via `pg.Pool`), Express, WebSocket (`ws` library), React 18, Vite, AES-256-GCM encryption via `services/messengerCrypto.js`, IndexedDB cache via `src/utils/messengerCache.js`.

**Reference spec:** [docs/superpowers/specs/2026-05-14-messenger-telegram-parity-design.md](../specs/2026-05-14-messenger-telegram-parity-design.md)

**Codebase conventions to follow:**
- Server: CommonJS (`require`/`module.exports`). Route handlers use `requireAuth()` + `requireParticipant(req, res, chatId)`. Error responses: `res.status(N).json({ error: "..." })`. Russian error text.
- DB helpers: live in `server/services/db.js`, exported at bottom. Use parameterized `$1, $2, ...` queries. Always return `r.rows[0] ?? null` for single-row or `r.rows` for lists.
- Frontend: ESM, React function components with hooks. Theme via `useTheme()` → `$` object (`$.bg`, `$.tx`, `$.brd`, `$.bgC`, `$.ac`, `$.dn`, `$.txS`). State via `useState`/`useCallback`/`useMemo`. WebSocket events flow through `MessengerContext`.
- Verify scripts: `scripts/verifyMessenger*.mjs`, use `node:assert/strict`, print final `console.log("... ok")` on success.
- Commits: lowercase imperative, `feat:`/`fix:`/`docs:`/`refactor:` prefixes (see git log).

**Run dev:** `npm run dev` (root) starts both Vite and the Express server via `dev.sh`. Server lives in `server/`, runs on port 3001.

---

## Wave 0 — Branch Setup

### Task 0.1: Create feature branch

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feat/messenger-telegram-parity-a main
git status
```

Expected: `On branch feat/messenger-telegram-parity-a` + clean tree.

- [ ] **Step 2: Verify dev environment runs**

```bash
npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3001/api/auth/me -H "Authorization: Bearer test" | head -c 100
```

Expected: error response (because token is invalid), but server is alive. Stop dev with Ctrl+C in the dev terminal before continuing.

---

## Wave 1 — Database Migrations

All migrations are appended to the existing `initSchema()` function in [server/services/db.js](server/services/db.js) using the established idempotent `try { ... } catch (_) {}` pattern. They are aggressively backward-compatible: every new column is nullable / has a default, every new table uses `CREATE TABLE IF NOT EXISTS`, every new index uses `CREATE INDEX IF NOT EXISTS`.

### Task 1.1: Add migration block for new message columns

**Files:**
- Modify: `server/services/db.js` — locate the end of the `initSchema()` function body (search for the last `try { await pool.query(...) } catch (_) {}` line, around line 555-580), and append the new migrations there.

- [ ] **Step 1: Locate the migration block tail**

Run:

```bash
grep -n "ALTER TABLE messages ADD COLUMN deleted_by" server/services/db.js
```

Expected: one line number around 541. The block of additive `ALTER TABLE` calls ends a few lines below that. The new migrations go after the last existing migration in `initSchema()`, before the function returns.

- [ ] **Step 2: Append migrations**

In `server/services/db.js`, inside `initSchema()`, after the existing `ALTER TABLE` block, add:

```js
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
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_mpf_user ON message_pinned_for_users(user_id)"); } catch (_) {}
```

- [ ] **Step 3: Restart server and verify migrations applied**

```bash
npm run dev:server
```

In another terminal:

```bash
psql "$DATABASE_URL" -c "\d messages" | grep -E "pinned_at|reply_to_message_id"
psql "$DATABASE_URL" -c "\d message_pinned_for_users"
psql "$DATABASE_URL" -c "\di idx_msg_chat_pinned idx_msg_reply_to idx_mpf_user"
```

Expected:
- `pinned_at` and `reply_to_message_id` columns visible in `messages`.
- `message_pinned_for_users` table exists with composite PK.
- All three indexes exist.

Stop server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server/services/db.js
git commit -m "feat: add messenger pin + reply DB migrations (sub-project A)"
```

### Task 1.2: Add DB helper functions for pin operations

**Files:**
- Modify: `server/services/db.js` — add 6 new helpers in the messenger section (around line 1220, near `hideMessageForUser`), and export them at the bottom of the file.

- [ ] **Step 1: Add helper functions**

In `server/services/db.js`, in the messenger messages section (after `hideMessageForUser`), add:

```js
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
     RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
    [chatId, messageId]
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
     VALUES ($1, $2)
     ON CONFLICT (user_id, message_id) DO NOTHING
     RETURNING pinned_at`,
    [userId, messageId]
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
```

- [ ] **Step 2: Export the new helpers**

Find the `module.exports = { ... }` block at the bottom of `server/services/db.js` and add the new function names. The existing line near 1374 reads:

```
insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser, getMessages,
```

Add after it (still inside the module.exports object):

```js
  PIN_FOR_ALL_LIMIT, PIN_FOR_ME_LIMIT,
  countPinnedForAll, pinMessageForAll, unpinMessageForAll, listPinnedForAll,
  countPinnedForUser, pinMessageForUser, unpinMessageForUser, listPinnedForUser,
```

- [ ] **Step 3: Smoke test the helpers**

Create temporary file `scripts/smokePinDb.mjs`:

```js
import { pool, pinMessageForAll, unpinMessageForAll, listPinnedForAll, countPinnedForAll,
         pinMessageForUser, unpinMessageForUser, listPinnedForUser, countPinnedForUser } from "../server/services/db.js";

// Run against a known dev chat with at least one message.
// Replace CHAT_ID and MESSAGE_ID with real IDs from your dev DB.
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID || 0);
const MESSAGE_ID = Number(process.env.SMOKE_MESSAGE_ID || 0);
const USER_ID = Number(process.env.SMOKE_USER_ID || 0);

if (!CHAT_ID || !MESSAGE_ID || !USER_ID) {
  console.log("set SMOKE_CHAT_ID, SMOKE_MESSAGE_ID, SMOKE_USER_ID env vars to a real chat/message/user");
  process.exit(0);
}

const pinned = await pinMessageForAll(CHAT_ID, MESSAGE_ID);
console.log("pinned for all:", !!pinned, "count:", await countPinnedForAll(CHAT_ID));
const personal = await pinMessageForUser(USER_ID, MESSAGE_ID);
console.log("pinned for user:", !!personal, "count:", await countPinnedForUser(CHAT_ID, USER_ID));
await unpinMessageForAll(CHAT_ID, MESSAGE_ID);
await unpinMessageForUser(USER_ID, MESSAGE_ID);
console.log("unpinned: ok, after counts:", await countPinnedForAll(CHAT_ID), await countPinnedForUser(CHAT_ID, USER_ID));
await pool.end();
```

**Note:** `server/services/db.js` is CommonJS; the smoke script above uses `import` from ESM. Since the file is in `scripts/` (root `package.json` has `"type": "module"`), you'll need to use dynamic `require` via `createRequire`. Replace the import line with:

```js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { pool, pinMessageForAll, unpinMessageForAll, listPinnedForAll, countPinnedForAll,
        pinMessageForUser, unpinMessageForUser, listPinnedForUser, countPinnedForUser
      } = require("../server/services/db.js");
```

Run:

```bash
SMOKE_CHAT_ID=1 SMOKE_MESSAGE_ID=1 SMOKE_USER_ID=1 node scripts/smokePinDb.mjs
```

Adjust IDs to real ones from your dev DB. Expected: prints "pinned for all: true, count: 1", "pinned for user: true, count: 1", "unpinned: ok, after counts: 0 0".

- [ ] **Step 4: Delete smoke script and commit helpers**

```bash
rm scripts/smokePinDb.mjs
git add server/services/db.js
git commit -m "feat: add pin DB helpers (sub-project A)"
```

### Task 1.3: Extend `insertMessage` to accept `replyToMessageId`

**Files:**
- Modify: `server/services/db.js` — `insertMessage` function around line 1128.

- [ ] **Step 1: Add optional parameter and column to INSERT**

Replace the signature and INSERT statements. New signature:

```js
const insertMessage = async (
  chatId, senderId, encryptedText, encryptedMeta, msgType, fileId,
  clientMessageId = "", replyToMessageId = null
) => {
```

Inside the function, both INSERT statements (one inside the transaction for client_message_id idempotency, one without) currently look like:

```js
`INSERT INTO messages (chat_id, sender_id, encrypted_text, encrypted_meta, msg_type, file_id, client_message_id)
 VALUES ($1, $2, $3, $4, $5, $6, $7)
 RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`
```

Change both to:

```js
`INSERT INTO messages (chat_id, sender_id, encrypted_text, encrypted_meta, msg_type, file_id, client_message_id, reply_to_message_id)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
 RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`
```

And both `pool.query(...)`/`client.query(...)` invocations append the parameter:

```js
[chatId, senderId, encryptedText, encryptedMeta, msgType, fileId || null, safeClientMessageId, replyToMessageId || null]
```

- [ ] **Step 2: Verify existing callers still work**

`insertMessage` is currently called from:
- `server/routes/messenger.js` (POST /messages and POST /files routes)
- `server/services/ws.js` (handleMessage)

Both pass 7 positional args. The 8th is optional with `= null` default, so old callers continue to work unchanged.

Run:

```bash
grep -n "insertMessage(" server/routes/messenger.js server/services/ws.js
```

Verify there are 7-arg invocations and the function call sites need no change (they'll be updated in Wave 3).

- [ ] **Step 3: Commit**

```bash
git add server/services/db.js
git commit -m "feat: extend insertMessage with replyToMessageId param"
```

---

## Wave 2 — Server Pin Endpoints + WS Events

All pin endpoints live in [server/routes/messenger.js](server/routes/messenger.js). They follow the existing pattern: `requireAuth()` → `requireParticipant(req, res, chatId)` → DB call → `createSyncEvent` + `broadcastToChat` + `sendTo(self)` for WS fanout.

### Task 2.1: Add `POST /api/chats/:chatId/messages/:messageId/pin`

**Files:**
- Modify: `server/routes/messenger.js` — import the new helpers (top of file) and add the route after the existing DELETE message route (around line 510).

- [ ] **Step 1: Extend the db imports**

In `server/routes/messenger.js`, locate the existing import block (line 9-17):

```js
const { pool, hasAllClientsAccess, getAssignmentsByUser,
  createChat, getChatById, getChatsByUser, updateChatMeta, setChatPinned,
  addChatParticipant, removeChatParticipant, getChatParticipants, getChatParticipantsForChats,
  isParticipant, getParticipantRole,
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser, getMessages,
  upsertReceipt, getReceiptsByChat, getReceiptsForChats,
  insertChatFile, getChatFile,
  listUsers,
} = require("../services/db");
```

Add the new exports:

```js
const { pool, hasAllClientsAccess, getAssignmentsByUser,
  createChat, getChatById, getChatsByUser, updateChatMeta, setChatPinned,
  addChatParticipant, removeChatParticipant, getChatParticipants, getChatParticipantsForChats,
  isParticipant, getParticipantRole,
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser, getMessages,
  upsertReceipt, getReceiptsByChat, getReceiptsForChats,
  insertChatFile, getChatFile,
  listUsers,
  PIN_FOR_ALL_LIMIT, PIN_FOR_ME_LIMIT,
  countPinnedForAll, pinMessageForAll, unpinMessageForAll, listPinnedForAll,
  countPinnedForUser, pinMessageForUser, unpinMessageForUser, listPinnedForUser,
} = require("../services/db");
```

- [ ] **Step 2: Add the pin-for-all POST route**

After the existing `router.delete("/chats/:chatId/messages/:messageId", ...)` handler (the one we read earlier, ending around line 510), add:

```js
// POST /api/chats/:chatId/messages/:messageId/pin — pin for all in chat
router.post("/chats/:chatId/messages/:messageId/pin", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const existing = await getMessageById(chatId, messageId);
    if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });
    if (existing.deleted_for_all) return res.status(400).json({ error: "Сообщение удалено" });
    if (existing.pinned_at) return res.json({ ok: true, alreadyPinned: true });

    const count = await countPinnedForAll(chatId);
    if (count >= PIN_FOR_ALL_LIMIT) {
      return res.status(409).json({ error: "PIN_LIMIT_REACHED", limit: PIN_FOR_ALL_LIMIT });
    }

    const pinned = await pinMessageForAll(chatId, messageId);
    if (!pinned) return res.status(404).json({ error: "Не удалось закрепить" });

    const payload = { type: "message_pinned", chatId, messageId, pinnedAt: pinned.pinned_at };
    await createSyncEvent(pool, { chatId, eventType: "message_pinned", payload: { messageId } });
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    res.json({ ok: true, messageId, pinnedAt: pinned.pinned_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 3: Manual smoke test**

Start server (`npm run dev:server`), log in via the UI to get a token from `localStorage.dash_token` (DevTools), then:

```bash
TOKEN="<paste your dash_token>"
CHAT_ID=1
MSG_ID=1  # use a real message id from this chat
curl -s -X POST "http://localhost:3001/api/chats/$CHAT_ID/messages/$MSG_ID/pin" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"
```

Expected: `{"ok":true,"messageId":1,"pinnedAt":"..."}`. A second call to the same endpoint returns `{"ok":true,"alreadyPinned":true}`.

Verify in DB:

```bash
psql "$DATABASE_URL" -c "SELECT id, pinned_at FROM messages WHERE id = 1"
```

Expected: `pinned_at` is non-null.

- [ ] **Step 4: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add POST /chats/:id/messages/:messageId/pin endpoint"
```

### Task 2.2: Add `DELETE /api/chats/:chatId/messages/:messageId/pin`

**Files:**
- Modify: `server/routes/messenger.js` — append after the previous task's route.

- [ ] **Step 1: Add the unpin route**

```js
// DELETE /api/chats/:chatId/messages/:messageId/pin — unpin for all
router.delete("/chats/:chatId/messages/:messageId/pin", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const ok = await unpinMessageForAll(chatId, messageId);
    if (!ok) return res.json({ ok: true, wasPinned: false });

    const payload = { type: "message_unpinned", chatId, messageId };
    await createSyncEvent(pool, { chatId, eventType: "message_unpinned", payload: { messageId } });
    await broadcastToChat(chatId, payload, null);
    sendTo(req.user.id, payload);

    res.json({ ok: true, wasPinned: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Smoke test**

```bash
curl -s -X DELETE "http://localhost:3001/api/chats/$CHAT_ID/messages/$MSG_ID/pin" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `{"ok":true,"wasPinned":true}`. A second call returns `{"ok":true,"wasPinned":false}`.

- [ ] **Step 3: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add DELETE /chats/:id/messages/:messageId/pin endpoint"
```

### Task 2.3: Add `POST /api/chats/:chatId/messages/:messageId/pin-for-me`

**Files:**
- Modify: `server/routes/messenger.js`.

- [ ] **Step 1: Add personal pin route**

```js
// POST /api/chats/:chatId/messages/:messageId/pin-for-me — personal pin
router.post("/chats/:chatId/messages/:messageId/pin-for-me", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const existing = await getMessageById(chatId, messageId);
    if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });
    if (existing.deleted_for_all) return res.status(400).json({ error: "Сообщение удалено" });

    const count = await countPinnedForUser(chatId, req.user.id);
    if (count >= PIN_FOR_ME_LIMIT) {
      return res.status(409).json({ error: "PERSONAL_PIN_LIMIT_REACHED", limit: PIN_FOR_ME_LIMIT });
    }

    const pinned = await pinMessageForUser(req.user.id, messageId);
    await createSyncEvent(pool, {
      chatId, userId: req.user.id,
      eventType: "personal_pin_added",
      payload: { messageId, userId: req.user.id }
    });
    sendTo(req.user.id, { type: "personal_pin_added", chatId, messageId });
    res.json({ ok: true, messageId, pinnedAt: pinned?.pinned_at ?? null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Smoke test** — same shape as 2.1 but to `/pin-for-me`. Verify with `psql -c "SELECT * FROM message_pinned_for_users WHERE user_id = <your id>"`.

- [ ] **Step 3: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add POST /chats/:id/messages/:messageId/pin-for-me endpoint"
```

### Task 2.4: Add `DELETE /api/chats/:chatId/messages/:messageId/pin-for-me`

- [ ] **Step 1: Add route**

```js
// DELETE /api/chats/:chatId/messages/:messageId/pin-for-me
router.delete("/chats/:chatId/messages/:messageId/pin-for-me", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const ok = await unpinMessageForUser(req.user.id, messageId);
    await createSyncEvent(pool, {
      chatId, userId: req.user.id,
      eventType: "personal_pin_removed",
      payload: { messageId, userId: req.user.id }
    });
    sendTo(req.user.id, { type: "personal_pin_removed", chatId, messageId });
    res.json({ ok: true, wasPinned: ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Smoke test and commit**

```bash
curl -s -X DELETE "http://localhost:3001/api/chats/$CHAT_ID/messages/$MSG_ID/pin-for-me" -H "Authorization: Bearer $TOKEN"

git add server/routes/messenger.js
git commit -m "feat: add DELETE /chats/:id/messages/:messageId/pin-for-me endpoint"
```

### Task 2.5: Add `GET /api/chats/:chatId/pinned` and `GET /api/chats/:chatId/pinned-for-me`

- [ ] **Step 1: Add both GET routes**

```js
// GET /api/chats/:chatId/pinned — top-5 for-all pins (newest first)
router.get("/chats/:chatId/pinned", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;
    const rows = await listPinnedForAll(chatId, PIN_FOR_ALL_LIMIT);
    res.json({ messages: rows.map(serializeMessage) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chats/:chatId/pinned-for-me — personal pins for this user
router.get("/chats/:chatId/pinned-for-me", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;
    const rows = await listPinnedForUser(chatId, req.user.id, PIN_FOR_ME_LIMIT);
    res.json({ messages: rows.map(serializeMessage) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Smoke test**

```bash
curl -s "http://localhost:3001/api/chats/$CHAT_ID/pinned" -H "Authorization: Bearer $TOKEN" | head -c 400
curl -s "http://localhost:3001/api/chats/$CHAT_ID/pinned-for-me" -H "Authorization: Bearer $TOKEN" | head -c 400
```

Expected: `{"messages":[{...}]}` arrays.

- [ ] **Step 3: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add GET /chats/:id/pinned and /pinned-for-me endpoints"
```

---

## Wave 3 — Reply & Mentions Server Changes

These extend the existing `POST /api/chats/:chatId/messages` endpoint (around line 390) to accept two new optional body fields: `replyToMessageId` and `mentionedUserIds`. Both are validated against the chat (reply target must belong to the same chat, mentioned users must be participants). `replyToMessageId` flows into the new `messages.reply_to_message_id` column. `mentionedUserIds` is packed into the existing `encrypted_meta` JSON under key `mentionedUserIds: number[]`.

### Task 3.1: Validate and persist `replyToMessageId` on send

**Files:**
- Modify: `server/routes/messenger.js` — `POST /chats/:chatId/messages` route around line 390.

- [ ] **Step 1: Extend body destructuring and validate**

Find the line in the POST messages handler:

```js
const { text = "", meta = {}, msgType = "text", fileId = null, clientMessageId = "", deviceId = "" } = req.body || {};
```

Replace with:

```js
const {
  text = "",
  meta = {},
  msgType = "text",
  fileId = null,
  clientMessageId = "",
  deviceId = "",
  replyToMessageId = null,
  mentionedUserIds = [],
} = req.body || {};

let replyParentId = null;
if (replyToMessageId != null) {
  const replyId = Number(replyToMessageId);
  if (!Number.isInteger(replyId) || replyId <= 0) {
    return res.status(400).json({ error: "Некорректный replyToMessageId" });
  }
  const parent = await getMessageById(chatId, replyId);
  if (!parent) return res.status(400).json({ error: "Сообщение-оригинал не найдено в этом чате" });
  replyParentId = replyId;
}
```

- [ ] **Step 2: Validate mentions**

Below the reply validation, add:

```js
const safeMentions = Array.isArray(mentionedUserIds)
  ? Array.from(new Set(mentionedUserIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
  : [];
if (safeMentions.length > 0) {
  const participants = await getChatParticipants(chatId);
  const participantIds = new Set(participants.map((p) => Number(p.user_id)));
  for (const id of safeMentions) {
    if (!participantIds.has(id)) {
      return res.status(400).json({ error: "Упоминаемый пользователь не участник чата", userId: id });
    }
  }
}
const mergedMeta = { ...(meta && typeof meta === "object" ? meta : {}) };
if (safeMentions.length > 0) mergedMeta.mentionedUserIds = safeMentions;
```

- [ ] **Step 3: Pass `replyParentId` to insertMessage**

Find the `insertMessage(...)` call (around line 398-406) and replace with:

```js
const saved = await insertMessage(
  chatId,
  req.user.id,
  encryptText(text),
  encryptJson(mergedMeta),
  msgType,
  fileId || null,
  String(clientMessageId || ""),
  replyParentId,
);
```

- [ ] **Step 4: Smoke test reply**

```bash
TOKEN="<your token>"
curl -s -X POST "http://localhost:3001/api/chats/1/messages" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"reply test","replyToMessageId":1,"clientMessageId":"reply-test-1"}'
psql "$DATABASE_URL" -c "SELECT id, reply_to_message_id FROM messages WHERE client_message_id = 'reply-test-1'"
```

Expected: reply row has `reply_to_message_id = 1`. Bad reply id returns 400.

- [ ] **Step 5: Smoke test mentions**

```bash
curl -s -X POST "http://localhost:3001/api/chats/1/messages" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"hi @doc","mentionedUserIds":[2],"clientMessageId":"mention-test-1"}'
```

Verify the server returns a serialized message whose `meta` contains `mentionedUserIds: [2]`.

A bad user (not a participant) returns 400.

- [ ] **Step 6: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: accept replyToMessageId and mentionedUserIds in POST /messages"
```

### Task 3.2: Surface `reply_to_message_id` in `serializeMessage`

**Files:**
- Modify: `server/routes/messenger.js` — `serializeMessage` function around line 74.

- [ ] **Step 1: Add field to serialized output**

Find:

```js
return {
  id: row.id,
  chat_id: row.chat_id,
  sender_id: row.sender_id,
  ...
  edited_at: row.edited_at || null,
};
```

Add a new line above `edited_at`:

```js
  reply_to_message_id: row.reply_to_message_id || null,
  pinned_at: row.pinned_at || null,
```

So the full return becomes:

```js
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
  reply_to_message_id: row.reply_to_message_id || null,
  pinned_at: row.pinned_at || null,
  created_at: row.created_at,
  edited_at: row.edited_at || null,
};
```

- [ ] **Step 2: Smoke test**

```bash
curl -s "http://localhost:3001/api/chats/1/messages?limit=10" -H "Authorization: Bearer $TOKEN" | head -c 800
```

Expected: each message has `reply_to_message_id` and `pinned_at` keys (null for most).

- [ ] **Step 3: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: include reply_to_message_id and pinned_at in serializeMessage"
```

### Task 3.3: Mirror the changes in WebSocket message handler

**Files:**
- Modify: `server/services/ws.js` — `handleMessage` function around line 100.

- [ ] **Step 1: Inspect the WS send handler**

Read `server/services/ws.js` lines 100-180. The WS path `"send_message"` performs the same insertMessage flow as the REST endpoint. It must accept `replyToMessageId` and `mentionedUserIds` too, or the WS-preferred client path will silently drop these fields.

- [ ] **Step 2: Extract the same validation into a helper**

In `server/services/ws.js`, near the top below the imports, add:

```js
const { getMessageById, getChatParticipants, insertMessage } = require("./db");

const validateReplyAndMentions = async (chatId, replyToMessageId, mentionedUserIds, meta) => {
  let replyParentId = null;
  if (replyToMessageId != null) {
    const replyId = Number(replyToMessageId);
    if (!Number.isInteger(replyId) || replyId <= 0) {
      throw new Error("Некорректный replyToMessageId");
    }
    const parent = await getMessageById(chatId, replyId);
    if (!parent) throw new Error("Сообщение-оригинал не найдено в этом чате");
    replyParentId = replyId;
  }
  const safeMentions = Array.isArray(mentionedUserIds)
    ? Array.from(new Set(mentionedUserIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
  if (safeMentions.length > 0) {
    const participants = await getChatParticipants(chatId);
    const participantIds = new Set(participants.map((p) => Number(p.user_id)));
    for (const id of safeMentions) {
      if (!participantIds.has(id)) throw new Error("Упоминаемый пользователь не участник чата");
    }
  }
  const mergedMeta = { ...(meta && typeof meta === "object" ? meta : {}) };
  if (safeMentions.length > 0) mergedMeta.mentionedUserIds = safeMentions;
  return { replyParentId, mergedMeta };
};
```

If `getMessageById` and friends are already required in this file, skip the duplicate `require`.

- [ ] **Step 3: Wire it into the WS send_message handler**

Locate the `send_message` case in `handleMessage` (around line 100-160). It currently destructures the message payload and calls `insertMessage`. Insert validation:

```js
// Inside the send_message case, before the insertMessage call:
const { replyParentId, mergedMeta } = await validateReplyAndMentions(
  chatId,
  payload.replyToMessageId,
  payload.mentionedUserIds,
  payload.meta,
);

const saved = await insertMessage(
  chatId,
  user.id,
  encryptText(payload.text || ""),
  encryptJson(mergedMeta),
  payload.msgType || "text",
  payload.fileId || null,
  String(payload.clientMessageId || ""),
  replyParentId,
);
```

If validation throws, send the WS client an error event:

```js
try { /* the block above */ } catch (e) {
  ws.send(JSON.stringify({ type: "send_error", error: e.message, clientMessageId: payload.clientMessageId }));
  return;
}
```

- [ ] **Step 4: Smoke test via WebSocket**

Easiest: log into the web app, open DevTools console, then run:

```js
// Get the active WS via the existing MsgSocket; or send via the regular UI with a quoted reply
// once the client side is built. For now, restart the server and confirm no regression in
// regular message sending via the UI.
```

Manual: send a regular message from the UI. Verify it still arrives. (Full reply/mention WS testing happens after client work in Wave 6.)

- [ ] **Step 5: Commit**

```bash
git add server/services/ws.js
git commit -m "feat: accept replyToMessageId and mentions in WS send_message"
```

### Task 3.4: Backfill reply_to in `getMessages` and `getMessageById` selects

The DB helpers already do `SELECT m.*, ...` so `reply_to_message_id` and `pinned_at` are returned automatically. No change needed. Verify by reading lines 1175-1280 of `server/services/db.js` — confirm `SELECT m.*`, then proceed without edits. Mark this task complete with no commit.

- [ ] **Step 1: Read and verify**

```bash
sed -n '1175,1186p' server/services/db.js
sed -n '1221,1260p' server/services/db.js
```

Confirm `SELECT m.*` is used. If yes, no commit. Move on.

---

## Wave 4 — Bulk Endpoints

### Task 4.1: Add atomic bulk-delete helper to db.js

**Files:**
- Modify: `server/services/db.js` — add a helper that performs the atomic check + delete.

- [ ] **Step 1: Add helper near the existing delete helpers**

In the messenger messages section (after `hideMessageForUser`), add:

```js
const getMessagesByIds = async (chatId, ids) => {
  if (!ids || ids.length === 0) return [];
  const r = await pool.query(
    `SELECT id, sender_id, deleted_for_all FROM messages WHERE chat_id = $1 AND id = ANY($2::int[])`,
    [chatId, ids]
  );
  return r.rows;
};

const deleteMessagesForAllBulk = async (chatId, ids, deletedBy) => {
  const r = await pool.query(
    `UPDATE messages
       SET deleted_for_all = true,
           deleted_for_all_at = NOW(),
           deleted_by = $3
     WHERE chat_id = $1 AND id = ANY($2::int[]) AND deleted_for_all = false
     RETURNING id`,
    [chatId, ids, deletedBy]
  );
  return r.rows.map((row) => row.id);
};

const hideMessagesForUserBulk = async (userId, ids) => {
  if (!ids || ids.length === 0) return 0;
  const r = await pool.query(
    `INSERT INTO message_hidden_for_users (message_id, user_id)
     SELECT id, $1 FROM unnest($2::int[]) AS id
     ON CONFLICT (message_id, user_id) DO NOTHING
     RETURNING message_id`,
    [userId, ids]
  );
  return r.rows.length;
};
```

- [ ] **Step 2: Export them**

In the `module.exports` block, add:

```js
  getMessagesByIds, deleteMessagesForAllBulk, hideMessagesForUserBulk,
```

- [ ] **Step 3: Commit**

```bash
git add server/services/db.js
git commit -m "feat: add bulk delete/hide helpers for messages"
```

### Task 4.2: Add `POST /api/chats/:chatId/messages/bulk-delete` endpoint

**Files:**
- Modify: `server/routes/messenger.js` — add route after pin routes; also extend the db import.

- [ ] **Step 1: Extend db import**

Add `getMessagesByIds, deleteMessagesForAllBulk, hideMessagesForUserBulk` to the `require("../services/db")` destructuring at the top.

- [ ] **Step 2: Add the route**

After the `/pin-for-me` DELETE route, add:

```js
// POST /api/chats/:chatId/messages/bulk-delete
// body: { ids: number[], scope: "self" | "all" }
router.post("/chats/:chatId/messages/bulk-delete", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    const scope = String(req.body?.scope || "all");
    if (ids.length === 0) return res.status(400).json({ error: "Передайте ids" });
    if (ids.length > 100) return res.status(400).json({ error: "Слишком много сообщений (max 100)" });

    if (scope === "self") {
      const hidden = await hideMessagesForUserBulk(req.user.id, ids);
      sendTo(req.user.id, { type: "messages_deleted_self_bulk", chatId, messageIds: ids });
      return res.json({ ok: true, scope: "self", hidden });
    }

    if (scope === "all") {
      const rows = await getMessagesByIds(chatId, ids);
      if (rows.length !== ids.length) {
        return res.status(404).json({ error: "Некоторые сообщения не найдены", missingIds: ids.filter((id) => !rows.find((r) => r.id === id)) });
      }
      const denied = rows.filter((r) => r.sender_id !== req.user.id && req.user.role !== "admin").map((r) => r.id);
      if (denied.length > 0 && req.user.role !== "admin") {
        return res.status(403).json({ error: "BULK_DELETE_FORBIDDEN", deniedIds: denied });
      }
      const deletedIds = await deleteMessagesForAllBulk(chatId, ids, req.user.id);
      for (const id of deletedIds) {
        const payload = { type: "message_deleted_all", chatId, messageId: id, userId: req.user.id };
        await createSyncEvent(pool, { chatId, eventType: "message_deleted_all", payload: { messageId: id, userId: req.user.id } });
        await broadcastToChat(chatId, payload, null);
        sendTo(req.user.id, payload);
      }
      return res.json({ ok: true, scope: "all", deletedIds });
    }

    return res.status(400).json({ error: "Недопустимый scope" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 3: Smoke tests**

```bash
# Self-scope (always succeeds)
curl -s -X POST "http://localhost:3001/api/chats/1/messages/bulk-delete" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ids":[1,2,3],"scope":"self"}'

# All-scope with mixed ownership (expect 403 with deniedIds list when caller is not admin and selection includes other people's messages)
curl -s -X POST "http://localhost:3001/api/chats/1/messages/bulk-delete" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ids":[1,2,3],"scope":"all"}'
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add POST /chats/:id/messages/bulk-delete (atomic)"
```

### Task 4.3: Add `POST /api/chats/:chatId/messages/bulk-forward` endpoint

- [ ] **Step 1: Add the route**

```js
// POST /api/chats/:chatId/messages/bulk-forward
// body: { ids: number[], targetChatId: number }
router.post("/chats/:chatId/messages/bulk-forward", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const targetChatId = Number(req.body?.targetChatId);
    if (!(await requireParticipant(req, res, chatId))) return;
    if (!Number.isInteger(targetChatId) || targetChatId <= 0) {
      return res.status(400).json({ error: "Некорректный targetChatId" });
    }
    const targetParticipant = await isParticipant(targetChatId, req.user.id);
    if (!targetParticipant) return res.status(403).json({ error: "Нет доступа к целевому чату" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) return res.status(400).json({ error: "Передайте ids" });
    if (ids.length > 50) return res.status(400).json({ error: "Слишком много (max 50)" });

    const rows = await getMessagesByIds(chatId, ids);
    if (rows.length === 0) return res.status(404).json({ error: "Сообщения не найдены" });

    const forwarded = [];
    // Re-fetch full message rows (with sender info) for serialization
    for (const id of ids) {
      const full = await getMessageById(chatId, id);
      if (!full || full.deleted_for_all) continue;
      const serializedSource = serializeMessage({
        ...full,
        sender_username: full.sender_username,
        sender_display_name: full.sender_display_name,
      });
      // Prefix forwarded text with attribution (Telegram-style)
      const forwardedText = `[Переслано от ${serializedSource.sender_display_name || serializedSource.sender_username}]\n${serializedSource.text || ""}`;
      const saved = await insertMessage(
        targetChatId,
        req.user.id,
        encryptText(forwardedText),
        encryptJson({ forwardedFrom: { chatId, messageId: id, senderId: full.sender_id } }),
        "text",
        null,
        `fwd-${chatId}-${id}-${Date.now()}`,
        null,
      );
      const message = serializeMessage({
        ...saved,
        sender_username: req.user.username,
        sender_display_name: req.user.display_name || "",
      });
      const payload = { type: "new_message", message };
      await createSyncEvent(pool, { chatId: targetChatId, eventType: "new_message", payload: { messageId: saved.id } });
      await broadcastToChat(targetChatId, payload, null);
      forwarded.push(message.id);
    }

    res.json({ ok: true, forwarded: forwarded.length, ids: forwarded });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Smoke test**

```bash
curl -s -X POST "http://localhost:3001/api/chats/1/messages/bulk-forward" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ids":[1,2],"targetChatId":2}'
```

Expected: `{"ok":true,"forwarded":2,"ids":[...]}`. Verify two new messages appeared in chat 2 prefixed with "[Переслано от ...]".

- [ ] **Step 3: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add POST /chats/:id/messages/bulk-forward endpoint"
```

---

## Wave 5 — Search Endpoints

Search decrypts in memory because `messages.encrypted_text` is AES-256-GCM encrypted. For typical clinic chats (a few thousand messages) this is fast enough. We do not introduce full-text search infrastructure.

### Task 5.1: Add `searchMessagesInChat` and `searchMessagesGlobal` DB helpers

**Files:**
- Modify: `server/services/db.js`.

- [ ] **Step 1: Add helpers**

Append after the other message helpers:

```js
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
```

- [ ] **Step 2: Export**

Add to `module.exports`:

```js
  fetchMessagesForSearchInChat, fetchMessagesForSearchGlobal,
```

- [ ] **Step 3: Commit**

```bash
git add server/services/db.js
git commit -m "feat: add search fetch helpers for messenger"
```

### Task 5.2: Add search snippet utility

**Files:**
- Create: `server/services/messengerSearch.js`.

- [ ] **Step 1: Write the helper**

```js
const SNIPPET_RADIUS = 40;

const normalize = (value) => String(value || "").toLowerCase();

const matchAndSnippet = (text, query) => {
  const haystack = normalize(text);
  const needle = normalize(query);
  if (!needle || !haystack) return null;
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + needle.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return {
    snippet: `${prefix}${text.slice(start, end)}${suffix}`,
    matchStart: idx - start + prefix.length,
    matchLength: needle.length,
  };
};

module.exports = { matchAndSnippet };
```

- [ ] **Step 2: Smoke test inline**

```bash
node -e 'const {matchAndSnippet} = require("./server/services/messengerSearch"); console.log(matchAndSnippet("Привет, как дела сегодня?", "как"))'
```

Expected: `{ snippet: '…Привет, как дела сегодня?', matchStart: ..., matchLength: 3 }` (or similar).

- [ ] **Step 3: Commit**

```bash
git add server/services/messengerSearch.js
git commit -m "feat: add snippet utility for messenger search"
```

### Task 5.3: Add `GET /api/chats/:chatId/messages/search`

**Files:**
- Modify: `server/routes/messenger.js`.

- [ ] **Step 1: Import the helpers**

At the top of `server/routes/messenger.js`, add:

```js
const { matchAndSnippet } = require("../services/messengerSearch");
```

And extend the db destructure:

```js
  fetchMessagesForSearchInChat, fetchMessagesForSearchGlobal,
```

- [ ] **Step 2: Add the in-chat search route**

```js
// GET /api/chats/:chatId/messages/search?q=...&limit=50&before=...
router.get("/chats/:chatId/messages/search", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    if (!(await requireParticipant(req, res, chatId))) return;
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before ? Number(req.query.before) : null;
    if (q.length < 2) return res.json({ matches: [], done: true });

    const matches = [];
    let nextBefore = before;
    const HARD_CAP_BATCHES = 10;
    for (let batch = 0; batch < HARD_CAP_BATCHES; batch++) {
      const rows = await fetchMessagesForSearchInChat(chatId, req.user.id, nextBefore, 200);
      if (rows.length === 0) {
        return res.json({ matches, done: true });
      }
      for (const row of rows) {
        let text = "";
        try { text = row.encrypted_text ? decryptText(row.encrypted_text) : ""; } catch (_) { text = ""; }
        const snip = matchAndSnippet(text, q);
        if (snip) {
          matches.push({
            messageId: row.id,
            chatId: row.chat_id,
            senderId: row.sender_id,
            senderDisplayName: row.sender_display_name || row.sender_username,
            createdAt: row.created_at,
            ...snip,
          });
          if (matches.length >= limit) {
            return res.json({ matches, done: false, nextBefore: row.id });
          }
        }
        nextBefore = row.id;
      }
    }
    res.json({ matches, done: false, nextBefore });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 3: Smoke test**

```bash
curl -s "http://localhost:3001/api/chats/1/messages/search?q=привет&limit=5" -H "Authorization: Bearer $TOKEN" | head -c 500
```

Expected: `{"matches":[{...}], "done":...}` with snippets containing the query word.

- [ ] **Step 4: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add GET /chats/:id/messages/search (in-chat)"
```

### Task 5.4: Add `GET /api/messenger/search`

- [ ] **Step 1: Add the global search route**

```js
// GET /api/messenger/search?q=...&limit=50&before=...
router.get("/messenger/search", requireAuth(), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before ? Number(req.query.before) : null;
    if (q.length < 2) return res.json({ groups: [], done: true });

    const groupsMap = new Map(); // chatId -> { chatId, chatTitle, matches: [] }
    let nextBefore = before;
    let totalMatches = 0;
    const HARD_CAP_BATCHES = 10;

    for (let batch = 0; batch < HARD_CAP_BATCHES; batch++) {
      const rows = await fetchMessagesForSearchGlobal(req.user.id, nextBefore, 300);
      if (rows.length === 0) {
        return res.json({ groups: Array.from(groupsMap.values()), done: true });
      }
      for (const row of rows) {
        let text = "";
        try { text = row.encrypted_text ? decryptText(row.encrypted_text) : ""; } catch (_) { text = ""; }
        const snip = matchAndSnippet(text, q);
        if (snip) {
          if (!groupsMap.has(row.chat_id)) {
            groupsMap.set(row.chat_id, { chatId: row.chat_id, chatTitle: row.chat_title || "Чат", matches: [] });
          }
          groupsMap.get(row.chat_id).matches.push({
            messageId: row.id,
            senderId: row.sender_id,
            senderDisplayName: row.sender_display_name || row.sender_username,
            createdAt: row.created_at,
            ...snip,
          });
          totalMatches++;
          if (totalMatches >= limit) {
            return res.json({ groups: Array.from(groupsMap.values()), done: false, nextBefore: row.id });
          }
        }
        nextBefore = row.id;
      }
    }
    res.json({ groups: Array.from(groupsMap.values()), done: false, nextBefore });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Smoke test**

```bash
curl -s "http://localhost:3001/api/messenger/search?q=привет" -H "Authorization: Bearer $TOKEN" | head -c 500
```

Expected: `{"groups":[{"chatId":1,"chatTitle":"...","matches":[...]}]}`.

- [ ] **Step 3: Commit**

```bash
git add server/routes/messenger.js
git commit -m "feat: add GET /messenger/search (global)"
```

---

## Wave 6 — Settings, Devices, Auth `PATCH /me`

### Task 6.1: Add `PATCH /api/auth/me` for self-updating display_name

**Files:**
- Modify: `server/routes/auth.js`.

- [ ] **Step 1: Locate the file**

```bash
grep -n "router\." server/routes/auth.js | head -10
```

Identify a good insertion point (after the existing GET `/me` handler).

- [ ] **Step 2: Add the route**

```js
// PATCH /api/auth/me — self-update display_name (only)
router.patch("/me", requireAuth(), async (req, res) => {
  try {
    const raw = req.body?.displayName;
    if (typeof raw !== "string") return res.status(400).json({ error: "displayName обязателен" });
    const next = raw.trim().slice(0, 80);
    await pool.query("UPDATE users SET display_name = $1 WHERE id = $2", [next, req.user.id]);
    res.json({ ok: true, displayName: next });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

If `pool` is not already imported in `auth.js`, add `const { pool } = require("../services/db");` at the top of the file.

- [ ] **Step 3: Smoke test**

```bash
curl -s -X PATCH "http://localhost:3001/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"displayName":"Тест Тестов"}'
psql "$DATABASE_URL" -c "SELECT id, username, display_name FROM users WHERE id = <your id>"
```

Expected: `display_name` updated.

- [ ] **Step 4: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: add PATCH /api/auth/me for self display_name update"
```

### Task 6.2: Add `GET /api/messenger/devices`

**Files:**
- Modify: `server/services/messengerStore.js` — add a list helper.
- Modify: `server/routes/messenger.js` — add the route.

- [ ] **Step 1: Add list helper**

In `server/services/messengerStore.js`, locate `upsertMessengerDevice`/`removeMessengerDevice` and add:

```js
const listMessengerDevicesForUser = async (pool, userId) => {
  const r = await pool.query(
    `SELECT id, device_id, user_agent, last_seen_at, created_at
       FROM messenger_devices
      WHERE user_id = $1
      ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );
  return r.rows;
};
```

Add to the exports:

```js
module.exports = {
  // ...existing exports...
  listMessengerDevicesForUser,
};
```

(Adjust column names if the existing schema uses different ones; check `\d messenger_devices`.)

- [ ] **Step 2: Add the route**

In `server/routes/messenger.js`, import the new helper:

```js
const { createSyncEvent, listSyncEventsForUser, upsertMessengerDevice, removeMessengerDevice,
        listMessengerDevicesForUser } = require("../services/messengerStore");
```

Add the route:

```js
// GET /api/messenger/devices — list my push-enabled devices
router.get("/messenger/devices", requireAuth(), async (req, res) => {
  try {
    const devices = await listMessengerDevicesForUser(pool, req.user.id);
    res.json({ devices });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 3: Smoke test**

```bash
curl -s "http://localhost:3001/api/messenger/devices" -H "Authorization: Bearer $TOKEN"
```

Expected: `{"devices":[...]}` with current device entries.

- [ ] **Step 4: Commit**

```bash
git add server/services/messengerStore.js server/routes/messenger.js
git commit -m "feat: add GET /api/messenger/devices"
```

---

## Wave 7 — Client API Wrapper

### Task 7.1: Extend `src/utils/messengerApi.js` with the new endpoints

**Files:**
- Modify: `src/utils/messengerApi.js`.

- [ ] **Step 1: Add methods**

At the end of the `MessengerApi` object literal (before the closing `};`), insert:

```js
  pinForAll: (authFetch, chatId, messageId) => apiJson(
    authFetch, `/api/chats/${chatId}/messages/${messageId}/pin`,
    { method: "POST" }
  ),
  unpinForAll: (authFetch, chatId, messageId) => apiJson(
    authFetch, `/api/chats/${chatId}/messages/${messageId}/pin`,
    { method: "DELETE" }
  ),
  pinForMe: (authFetch, chatId, messageId) => apiJson(
    authFetch, `/api/chats/${chatId}/messages/${messageId}/pin-for-me`,
    { method: "POST" }
  ),
  unpinForMe: (authFetch, chatId, messageId) => apiJson(
    authFetch, `/api/chats/${chatId}/messages/${messageId}/pin-for-me`,
    { method: "DELETE" }
  ),
  listPinnedForAll: (authFetch, chatId) => apiJson(
    authFetch, `/api/chats/${chatId}/pinned`
  ),
  listPinnedForMe: (authFetch, chatId) => apiJson(
    authFetch, `/api/chats/${chatId}/pinned-for-me`
  ),
  bulkDelete: (authFetch, chatId, ids, scope) => apiJson(
    authFetch, `/api/chats/${chatId}/messages/bulk-delete`,
    { method: "POST", body: JSON.stringify({ ids, scope }) }
  ),
  bulkForward: (authFetch, chatId, ids, targetChatId) => apiJson(
    authFetch, `/api/chats/${chatId}/messages/bulk-forward`,
    { method: "POST", body: JSON.stringify({ ids, targetChatId }) }
  ),
  searchInChat: (authFetch, chatId, q, before) => apiJson(
    authFetch,
    `/api/chats/${chatId}/messages/search?q=${encodeURIComponent(q)}${before ? `&before=${before}` : ""}`
  ),
  searchGlobal: (authFetch, q, before) => apiJson(
    authFetch,
    `/api/messenger/search?q=${encodeURIComponent(q)}${before ? `&before=${before}` : ""}`
  ),
  updateDisplayName: (authFetch, displayName) => apiJson(
    authFetch, `/api/auth/me`,
    { method: "PATCH", body: JSON.stringify({ displayName }) }
  ),
  listDevices: (authFetch) => apiJson(authFetch, `/api/messenger/devices`),
```

Also extend `sendMessage` to pass reply/mentions:

Locate:

```js
sendMessage: (authFetch, chatId, payload) => apiJson(authFetch, `/api/chats/${chatId}/messages`, {
  method: "POST",
  body: JSON.stringify(payload),
}),
```

This already passes whatever the caller puts in `payload`. So `payload.replyToMessageId` and `payload.mentionedUserIds` will flow through unchanged. No modification needed — just document the supported fields with a leading comment:

```js
// sendMessage payload: { text, meta?, msgType?, fileId?, clientMessageId?, deviceId?, replyToMessageId?, mentionedUserIds? }
sendMessage: (authFetch, chatId, payload) => apiJson(authFetch, `/api/chats/${chatId}/messages`, {
  method: "POST",
  body: JSON.stringify(payload),
}),
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/messengerApi.js
git commit -m "feat: extend MessengerApi with pin/reply/bulk/search/settings methods"
```

---

## Wave 8 — MessengerContext: Pin + Reply + Selection + Search + Mentions State

This is the largest file change of the project (`src/context/MessengerContext.jsx` grows by ~250 lines). We add: state for pinned-for-all, pinned-for-me, reply target, multi-select, mention popover, font size, theme; methods for each action; WebSocket handlers for the two new events; cache integration.

### Task 8.1: Add new state slots

**Files:**
- Modify: `src/context/MessengerContext.jsx`.

- [ ] **Step 1: Add useState declarations**

Inside `MessengerProvider`, after the existing `useState` declarations (around line 102 where `notificationStatus` is set), add:

```jsx
  const [pinnedForAll, setPinnedForAll] = useState({}); // { [chatId]: Message[] }
  const [pinnedForMe, setPinnedForMe] = useState({});   // { [chatId]: Message[] }
  const [replyTargets, setReplyTargets] = useState({}); // { [chatId]: Message | null }
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);    // message ids (current active chat)
  const [fontSize, setFontSizeState] = useState(() => localStorage.getItem("messenger_font_size") || "M");
```

- [ ] **Step 2: Commit**

```bash
git add src/context/MessengerContext.jsx
git commit -m "feat: add pin/reply/selection state to MessengerContext"
```

### Task 8.2: Add pin methods + WS handlers

**Files:**
- Modify: `src/context/MessengerContext.jsx`.

- [ ] **Step 1: Add pin actions**

After existing methods (around the section where `markRead`, `sendMsg`, etc. are defined), add:

```jsx
  const loadPinnedForAll = useCallback(async (chatId) => {
    try {
      const { messages: pinned } = await MessengerApi.listPinnedForAll(authFetch, chatId);
      setPinnedForAll((prev) => ({ ...prev, [chatId]: pinned.map((m) => normalizeMessage(m, chatId)) }));
    } catch {}
  }, [authFetch]);

  const loadPinnedForMe = useCallback(async (chatId) => {
    try {
      const { messages: pinned } = await MessengerApi.listPinnedForMe(authFetch, chatId);
      setPinnedForMe((prev) => ({ ...prev, [chatId]: pinned.map((m) => normalizeMessage(m, chatId)) }));
    } catch {}
  }, [authFetch]);

  const pinForAll = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.pinForAll(authFetch, chatId, messageId);
      await loadPinnedForAll(chatId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [authFetch, loadPinnedForAll]);

  const unpinForAll = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.unpinForAll(authFetch, chatId, messageId);
      await loadPinnedForAll(chatId);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch, loadPinnedForAll]);

  const pinForMe = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.pinForMe(authFetch, chatId, messageId);
      await loadPinnedForMe(chatId);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch, loadPinnedForMe]);

  const unpinForMe = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.unpinForMe(authFetch, chatId, messageId);
      await loadPinnedForMe(chatId);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch, loadPinnedForMe]);
```

- [ ] **Step 2: Handle WS `message_pinned`/`message_unpinned`/`personal_pin_*`**

Locate the existing WS message handler — search for `"new_message"` in the file (the switch/if-chain that dispatches WS events). After the existing branches, add:

```jsx
        if (event.type === "message_pinned" || event.type === "message_unpinned") {
          // Reload pin-bar for that chat
          loadPinnedForAll(event.chatId).catch(() => {});
          return;
        }
        if (event.type === "personal_pin_added" || event.type === "personal_pin_removed") {
          loadPinnedForMe(event.chatId).catch(() => {});
          return;
        }
```

- [ ] **Step 3: Load pins when entering a chat**

Find the place where `activeChatId` changes trigger `loadMessages`. Add a parallel pin load:

```jsx
  useEffect(() => {
    if (!activeChatId) return;
    loadPinnedForAll(activeChatId);
    loadPinnedForMe(activeChatId);
  }, [activeChatId, loadPinnedForAll, loadPinnedForMe]);
```

- [ ] **Step 4: Commit**

```bash
git add src/context/MessengerContext.jsx
git commit -m "feat: add pin methods and WS handlers to MessengerContext"
```

### Task 8.3: Add reply target + sendMsg with reply/mentions

**Files:**
- Modify: `src/context/MessengerContext.jsx`.

- [ ] **Step 1: Add reply target helpers**

```jsx
  const setReplyTarget = useCallback((chatId, message) => {
    setReplyTargets((prev) => ({ ...prev, [chatId]: message || null }));
  }, []);

  const clearReplyTarget = useCallback((chatId) => {
    setReplyTargets((prev) => ({ ...prev, [chatId]: null }));
  }, []);
```

- [ ] **Step 2: Extend `sendMsg` signature**

Locate the existing `sendMsg` function. Currently it takes `(chatId, text)`. Extend:

```jsx
  const sendMsg = useCallback(async (chatId, text, options = {}) => {
    // options: { replyToMessageId?, mentionedUserIds?, msgType?, fileId? }
    // ...existing payload assembly...
    const payload = {
      text,
      meta: {},
      msgType: options.msgType || "text",
      fileId: options.fileId || null,
      clientMessageId: makeId(),
      deviceId: getOrCreateDeviceId(),
    };
    if (options.replyToMessageId) payload.replyToMessageId = options.replyToMessageId;
    if (options.mentionedUserIds?.length) payload.mentionedUserIds = options.mentionedUserIds;
    // ...rest of sendMsg as-is, but use `payload` instead of inline literal...
  }, [/* existing deps */]);
```

**Note:** the existing `sendMsg` already constructs a payload internally — your job is to thread `options.replyToMessageId` and `options.mentionedUserIds` into that payload. Read the existing implementation (search for `MessengerApi.sendMessage(` in `src/context/MessengerContext.jsx`) and add the two fields to whatever payload object is passed.

- [ ] **Step 3: Auto-clear reply target after successful send**

After `MessengerApi.sendMessage` resolves successfully in `sendMsg`, add:

```jsx
  if (options.replyToMessageId) clearReplyTarget(chatId);
```

- [ ] **Step 4: Commit**

```bash
git add src/context/MessengerContext.jsx
git commit -m "feat: add reply target state + extend sendMsg with options"
```

### Task 8.4: Add multi-select methods

**Files:**
- Modify: `src/context/MessengerContext.jsx`.

- [ ] **Step 1: Add selection methods**

```jsx
  const enterSelectionMode = useCallback((initialId = null) => {
    setSelectionMode(true);
    setSelectedIds(initialId ? [initialId] : []);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const toggleSelection = useCallback((messageId) => {
    setSelectedIds((prev) => (
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    ));
  }, []);

  const bulkDelete = useCallback(async (chatId, ids, scope) => {
    try {
      const result = await MessengerApi.bulkDelete(authFetch, chatId, ids, scope);
      exitSelectionMode();
      return { ok: true, ...result };
    } catch (e) {
      // Server may have returned 403 BULK_DELETE_FORBIDDEN — surface as a structured error
      return { ok: false, error: e.message };
    }
  }, [authFetch, exitSelectionMode]);

  const bulkForward = useCallback(async (chatId, ids, targetChatId) => {
    try {
      const result = await MessengerApi.bulkForward(authFetch, chatId, ids, targetChatId);
      exitSelectionMode();
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [authFetch, exitSelectionMode]);
```

- [ ] **Step 2: Commit**

```bash
git add src/context/MessengerContext.jsx
git commit -m "feat: add multi-select + bulk operations to MessengerContext"
```

### Task 8.5: Add search methods and settings methods

**Files:**
- Modify: `src/context/MessengerContext.jsx`.

- [ ] **Step 1: Add search**

```jsx
  const searchInChat = useCallback(async (chatId, q, before = null) => {
    try { return await MessengerApi.searchInChat(authFetch, chatId, q, before); }
    catch (e) { return { matches: [], done: true, error: e.message }; }
  }, [authFetch]);

  const searchGlobal = useCallback(async (q, before = null) => {
    try { return await MessengerApi.searchGlobal(authFetch, q, before); }
    catch (e) { return { groups: [], done: true, error: e.message }; }
  }, [authFetch]);
```

- [ ] **Step 2: Add settings methods**

```jsx
  const updateDisplayName = useCallback(async (displayName) => {
    try {
      const result = await MessengerApi.updateDisplayName(authFetch, displayName);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [authFetch]);

  const setFontSize = useCallback((size) => {
    const safe = ["S", "M", "L"].includes(size) ? size : "M";
    setFontSizeState(safe);
    localStorage.setItem("messenger_font_size", safe);
  }, []);

  const listDevices = useCallback(async () => {
    try { return (await MessengerApi.listDevices(authFetch))?.devices || []; }
    catch { return []; }
  }, [authFetch]);

  const revokeDevice = useCallback(async (deviceId) => {
    try { return await MessengerApi.removeDevice(authFetch, deviceId); }
    catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch]);
```

If `MessengerApi.removeDevice` does not exist in `src/utils/messengerApi.js`, add it now:

```js
  removeDevice: (authFetch, deviceId) => apiJson(
    authFetch, `/api/messenger/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" }
  ),
```

(Reference existing DELETE patterns in the file.)

- [ ] **Step 3: Commit**

```bash
git add src/context/MessengerContext.jsx src/utils/messengerApi.js
git commit -m "feat: add search + settings methods to MessengerContext"
```

### Task 8.6: Expose new state and methods via context value

**Files:**
- Modify: `src/context/MessengerContext.jsx`.

- [ ] **Step 1: Extend the context value memo**

Locate the final `const value = useMemo(() => ({ ... }), [...])` block. Add all new fields and methods:

```jsx
    pinnedForAll,
    pinnedForMe,
    replyTargets,
    selectionMode,
    selectedIds,
    fontSize,
    pinForAll, unpinForAll, pinForMe, unpinForMe,
    loadPinnedForAll, loadPinnedForMe,
    setReplyTarget, clearReplyTarget,
    enterSelectionMode, exitSelectionMode, toggleSelection,
    bulkDelete, bulkForward,
    searchInChat, searchGlobal,
    updateDisplayName, setFontSize,
    listDevices, revokeDevice,
```

And extend the deps array of `useMemo` to include all the new state/methods.

- [ ] **Step 2: Commit**

```bash
git add src/context/MessengerContext.jsx
git commit -m "feat: expose new MessengerContext methods via value memo"
```

---

## Wave 9 — Shared UI Components

These components are used by both desktop (`MessengerChatWindow`) and mobile (`MobileChatThread`).

### Task 9.1: Create `MessengerPinBar`

**Files:**
- Create: `src/components/MessengerPinBar.jsx`.

- [ ] **Step 1: Write the component**

```jsx
import { useTheme } from "../context/ThemeContext";

export default function MessengerPinBar({ pinnedMessages, currentIndex = 0, onClickNext, onUnpin, canUnpin = true }) {
  const { $ } = useTheme();
  if (!pinnedMessages || pinnedMessages.length === 0) return null;
  const safeIndex = Math.min(currentIndex, pinnedMessages.length - 1);
  const current = pinnedMessages[safeIndex];
  const total = pinnedMessages.length;

  const preview = (() => {
    if (current.deleted_for_all) return "Сообщение удалено";
    if (current.msg_type === "file" || current.msg_type === "file_bundle") return `📎 ${current.meta?.fileName || "Файл"}`;
    if (current.msg_type === "image" || current.msg_type === "image_bundle") return "🖼️ Фото";
    return (current.text || "").slice(0, 120);
  })();

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px",
      borderBottom: `1px solid ${$.brd}`,
      background: $.bgC,
      minHeight: 44,
      cursor: "pointer",
    }} onClick={onClickNext} role="button" aria-label="Закреплённые сообщения">
      <span style={{ fontSize: 14, color: $.ac, flexShrink: 0 }}>📌</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 600 }}>
          {total > 1 ? `Закреплено ${safeIndex + 1}/${total}` : "Закреплено"}
        </div>
        <div style={{ fontSize: 13, color: $.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {preview}
        </div>
      </div>
      {canUnpin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUnpin?.(current.id); }}
          style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", color: $.txS, cursor: "pointer", fontSize: 16 }}
          aria-label="Открепить"
        >×</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MessengerPinBar.jsx
git commit -m "feat: add MessengerPinBar shared component"
```

### Task 9.2: Create `MessengerMentionPicker`

**Files:**
- Create: `src/components/MessengerMentionPicker.jsx`.

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function MessengerMentionPicker({ participants, query, onPick, currentUserId }) {
  const { $ } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const q = String(query || "").toLowerCase().trim();
    return (participants || [])
      .filter((p) => p.user_id !== currentUserId)
      .filter((p) => {
        if (!q) return true;
        return (
          String(p.display_name || "").toLowerCase().includes(q) ||
          String(p.username || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [participants, query, currentUserId]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    const onKey = (e) => {
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % filtered.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length); }
      else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onPick?.(filtered[activeIndex]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeIndex, onPick]);

  if (filtered.length === 0) return null;

  return (
    <div ref={listRef} style={{
      position: "absolute", bottom: "calc(100% + 4px)", left: 0,
      background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10,
      boxShadow: $.sh, padding: 4, minWidth: 200, maxHeight: 260, overflowY: "auto", zIndex: 50,
    }}>
      {filtered.map((p, idx) => (
        <button
          key={p.user_id}
          type="button"
          onMouseEnter={() => setActiveIndex(idx)}
          onClick={() => onPick?.(p)}
          style={{
            width: "100%", textAlign: "left", padding: "8px 10px",
            background: idx === activeIndex ? $.bgI : "transparent",
            color: $.tx, border: "none", borderRadius: 6, cursor: "pointer",
            fontSize: 13, fontFamily: "inherit",
          }}
        >
          {p.display_name || p.username}
          {p.display_name && <span style={{ color: $.txS, marginLeft: 6 }}>@{p.username}</span>}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MessengerMentionPicker.jsx
git commit -m "feat: add MessengerMentionPicker shared component"
```

### Task 9.3: Create `MessengerPushPrompt`

**Files:**
- Create: `src/components/MessengerPushPrompt.jsx`.

- [ ] **Step 1: Write the component**

```jsx
import { useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

const STORAGE_KEY = "messenger_push_prompt_seen";

export function shouldShowPushPrompt() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (Notification.permission !== "default") return false;
  if (localStorage.getItem(STORAGE_KEY) === "true") return false;
  // Skip on iOS Safari outside PWA — banner handles that case
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (isIos && !isStandalone) return false;
  return true;
}

export default function MessengerPushPrompt({ onClose }) {
  const { $ } = useTheme();
  const { enableNotifications } = useMessenger();
  const [busy, setBusy] = useState(false);

  const handleEnable = async () => {
    setBusy(true);
    try { await enableNotifications(); } catch {}
    localStorage.setItem(STORAGE_KEY, "true");
    setBusy(false);
    onClose?.();
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose?.();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "grid", placeItems: "center", zIndex: 9998, padding: 20,
    }} onClick={handleDismiss}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: $.bg, color: $.tx, border: `1px solid ${$.brd}`,
        borderRadius: 16, padding: 24, maxWidth: 360, width: "100%",
        boxShadow: $.sh, textAlign: "center",
      }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔔</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>Включить уведомления?</h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: $.txS, lineHeight: 1.5 }}>
          Чтобы не пропускать сообщения от врача — разрешите уведомления.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleDismiss} disabled={busy} style={{
            flex: 1, height: 44, borderRadius: 10, border: `1px solid ${$.brd}`,
            background: $.bgC, color: $.tx, cursor: "pointer", fontSize: 14,
          }}>Не сейчас</button>
          <button type="button" onClick={handleEnable} disabled={busy} style={{
            flex: 1, height: 44, borderRadius: 10, border: "none",
            background: $.ac, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}>{busy ? "Включаю..." : "Включить"}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MessengerPushPrompt.jsx
git commit -m "feat: add MessengerPushPrompt soft-prompt modal"
```

### Task 9.4: Create `MessengerIosInstallBanner`

**Files:**
- Create: `src/components/MessengerIosInstallBanner.jsx`.

- [ ] **Step 1: Write the component**

```jsx
import { useTheme } from "../context/ThemeContext";

const STORAGE_KEY = "messenger_ios_install_banner_dismissed";

export function shouldShowIosInstallBanner() {
  if (typeof window === "undefined") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (!isIos) return false;
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone) return false;
  if (localStorage.getItem(STORAGE_KEY) === "true") return false;
  return true;
}

export default function MessengerIosInstallBanner({ onClose }) {
  const { $ } = useTheme();
  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose?.();
  };
  return (
    <div style={{
      position: "fixed", left: 12, right: 12,
      bottom: "calc(env(safe-area-inset-bottom) + 12px)",
      background: $.bgC, color: $.tx, border: `1px solid ${$.brd}`, borderRadius: 14,
      padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", zIndex: 9997,
      boxShadow: $.sh, fontSize: 13,
    }}>
      <div style={{ fontSize: 22 }}>📱</div>
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        Добавьте приложение на главный экран для уведомлений.
        <br />Нажмите <strong>⬆</strong> (Поделиться) → <em>«На экран Домой»</em>
      </div>
      <button type="button" onClick={handleDismiss} aria-label="Закрыть" style={{
        width: 28, height: 28, borderRadius: 8, border: "none",
        background: "transparent", color: $.txS, fontSize: 18, cursor: "pointer",
      }}>×</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MessengerIosInstallBanner.jsx
git commit -m "feat: add MessengerIosInstallBanner"
```

### Task 9.5: Extend `MessengerContextMenu`

**Files:**
- Modify: `src/components/MessengerContextMenu.jsx`.

- [ ] **Step 1: Replace the file**

The current file is small (25 lines). Replace its content entirely:

```jsx
import { useTheme } from "../context/ThemeContext";

export default function MessengerContextMenu({
  x, y,
  canEdit, canDeleteForAll, isPinnedForAll, isPinnedForMe,
  canPinForAll, canPinForMe,
  msgType,
  onReply, onForward, onEdit, onCopy,
  onPinForAll, onUnpinForAll,
  onPinForMe, onUnpinForMe,
  onDeleteSelf, onDeleteAll,
  onEnterSelection,
}) {
  const { $ } = useTheme();
  const top = Math.min(y, window.innerHeight - 360);
  const left = Math.min(x, window.innerWidth - 230);

  const itemStyle = { width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "inherit" };
  const isText = msgType === "text";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top, left, width: 220,
        background: $.bgC, border: `1px solid ${$.brd}`,
        borderRadius: 10, boxShadow: $.sh, zIndex: 9999, padding: 6,
      }}
    >
      <button onClick={onReply} style={{ ...itemStyle, color: $.tx }}>Ответить</button>
      <button onClick={onForward} style={{ ...itemStyle, color: $.tx }}>Переслать</button>
      {isPinnedForAll
        ? <button onClick={onUnpinForAll} style={{ ...itemStyle, color: $.tx }}>Открепить</button>
        : canPinForAll && <button onClick={onPinForAll} style={{ ...itemStyle, color: $.tx }}>Закрепить для всех</button>}
      {isPinnedForMe
        ? <button onClick={onUnpinForMe} style={{ ...itemStyle, color: $.tx }}>Убрать из своих закладок</button>
        : canPinForMe && <button onClick={onPinForMe} style={{ ...itemStyle, color: $.tx }}>Закрепить для себя</button>}
      {isText && <button onClick={onCopy} style={{ ...itemStyle, color: $.tx }}>Копировать</button>}
      {canEdit && <button onClick={onEdit} style={{ ...itemStyle, color: $.tx }}>Редактировать</button>}
      <button onClick={onEnterSelection} style={{ ...itemStyle, color: $.tx }}>Выбрать</button>
      <button onClick={onDeleteSelf} style={{ ...itemStyle, color: $.tx }}>Удалить у себя</button>
      {canDeleteForAll && <button onClick={onDeleteAll} style={{ ...itemStyle, color: $.dn }}>Удалить у всех</button>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MessengerContextMenu.jsx
git commit -m "feat: extend MessengerContextMenu with reply/pin/copy/select"
```

---

## Wave 10 — Message Bubble & Reply Citation

### Task 10.1: Extend `MessageBubble` with reply citation, mention highlight, selection checkbox

**Files:**
- Modify: `src/components/MessageBubble.jsx`.

- [ ] **Step 1: Read existing component**

```bash
wc -l src/components/MessageBubble.jsx
sed -n '1,60p' src/components/MessageBubble.jsx
```

Take note of: prop signature, theme usage, how `msg` is rendered.

- [ ] **Step 2: Add three new props and three new render concerns**

Modify the existing component to accept new props: `replyToMessage`, `isSelected`, `selectionMode`, `mentionedUserIds`, `participants`, `onJumpToMessage`, `onToggleSelection`.

Add at the top of the bubble's rendered JSX (above the existing text/file area):

```jsx
{props.replyToMessage && !props.replyToMessage.deleted_for_all && (
  <button
    type="button"
    onClick={() => props.onJumpToMessage?.(props.replyToMessage.id)}
    style={{
      display: "block", width: "100%", textAlign: "left",
      borderLeft: `3px solid ${$.ac}`, paddingLeft: 8, paddingRight: 4, marginBottom: 6,
      background: "transparent", border: "none", cursor: "pointer",
    }}
  >
    <div style={{ fontSize: 11, fontWeight: 700, color: $.ac }}>
      {props.replyToMessage.sender_display_name || props.replyToMessage.sender_username}
    </div>
    <div style={{ fontSize: 12, color: $.txS, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
      {props.replyToMessage.msg_type === "image" || props.replyToMessage.msg_type === "image_bundle" ? "🖼️ Фото" :
       props.replyToMessage.msg_type === "file" || props.replyToMessage.msg_type === "file_bundle" ? `📎 ${props.replyToMessage.meta?.fileName || "Файл"}` :
       props.replyToMessage.text}
    </div>
  </button>
)}
{props.replyToMessage?.deleted_for_all && (
  <div style={{ borderLeft: `3px solid ${$.brd}`, paddingLeft: 8, marginBottom: 6, fontSize: 12, color: $.txS, fontStyle: "italic" }}>
    Сообщение удалено
  </div>
)}
```

Selection checkbox — wrap the bubble in a flex container when `props.selectionMode` is true:

```jsx
{props.selectionMode && (
  <div onClick={() => props.onToggleSelection?.(props.msg.id)}
       style={{
         width: 22, height: 22, borderRadius: "50%", border: `2px solid ${props.isSelected ? $.ac : $.brd}`,
         display: "grid", placeItems: "center", marginRight: 8, marginTop: 8, flexShrink: 0,
         background: props.isSelected ? $.ac : "transparent", color: "#fff",
         cursor: "pointer",
       }}>
    {props.isSelected ? "✓" : ""}
  </div>
)}
```

For mention highlighting, add a helper above the component:

```jsx
function renderTextWithMentions(text, mentionedUserIds, participants, accentColor) {
  if (!mentionedUserIds || mentionedUserIds.length === 0 || !participants) return text;
  // Build list of "@DisplayName" strings to highlight
  const mentions = mentionedUserIds
    .map((id) => participants.find((p) => p.user_id === id))
    .filter(Boolean)
    .map((p) => `@${p.display_name || p.username}`);
  if (mentions.length === 0) return text;
  // Build a regex matching any of the mention strings (escaped)
  const escaped = mentions.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = String(text || "").split(re);
  return parts.map((part, idx) =>
    mentions.includes(part)
      ? <span key={idx} style={{ color: accentColor, fontWeight: 600 }}>{part}</span>
      : part
  );
}
```

Use it when rendering text:

```jsx
{renderTextWithMentions(msg.text, msg.meta?.mentionedUserIds, props.participants, $.ac)}
```

- [ ] **Step 3: Manual visual check**

Run `npm run dev`. Send a reply via the existing code (use a temp `replyToMessageId` from DB) and verify the citation renders. (Full UI flow tested in Wave 11.)

- [ ] **Step 4: Commit**

```bash
git add src/components/MessageBubble.jsx
git commit -m "feat: extend MessageBubble with reply citation, mentions, selection"
```

---

---

## Wave 11 — Desktop UI Integration (`MessengerChatWindow`, `MessengerChatList`, `MessengerShell`)

### Task 11.1: Integrate pin-bar, reply-preview, mention picker, and selection mode in `MessengerChatWindow`

**Files:**
- Modify: `src/components/MessengerChatWindow.jsx`.

- [ ] **Step 1: Read existing component**

```bash
wc -l src/components/MessengerChatWindow.jsx
sed -n '1,80p' src/components/MessengerChatWindow.jsx
```

Identify: the existing context menu wiring, the input area, the header, the message list rendering.

- [ ] **Step 2: Add imports**

At the top of the file, add:

```jsx
import MessengerPinBar from "./MessengerPinBar";
import MessengerMentionPicker from "./MessengerMentionPicker";
```

- [ ] **Step 3: Pull new state and methods from context**

In the component body, extend the `useMessenger()` destructure:

```jsx
const {
  // existing fields...
  pinnedForAll, replyTargets, selectionMode, selectedIds,
  pinForAll, unpinForAll, pinForMe, unpinForMe,
  setReplyTarget, clearReplyTarget,
  enterSelectionMode, exitSelectionMode, toggleSelection,
  bulkDelete, bulkForward,
  searchInChat,
} = useMessenger();
```

- [ ] **Step 4: Track pin-bar cycle index**

```jsx
const [pinCycleIndex, setPinCycleIndex] = useState(0);
const chatPins = pinnedForAll[activeChat?.id] || [];

const handlePinBarClick = () => {
  if (chatPins.length === 0) return;
  const target = chatPins[pinCycleIndex];
  if (target) onJumpToMessage?.(target.id);
  setPinCycleIndex((i) => (i + 1) % chatPins.length);
};
```

(Add `onJumpToMessage` as a local function — see Step 7.)

- [ ] **Step 5: Render pin-bar below header**

Between the header and the messages list, render:

```jsx
{chatPins.length > 0 && (
  <MessengerPinBar
    pinnedMessages={chatPins}
    currentIndex={pinCycleIndex}
    onClickNext={handlePinBarClick}
    onUnpin={(id) => unpinForAll(activeChat.id, id)}
    canUnpin={true}
  />
)}
```

- [ ] **Step 6: Render reply preview above input**

The current input area in `MessengerChatWindow` lives near the bottom of the JSX. Find it and add just above the `<textarea>`:

```jsx
{replyTargets[activeChat.id] && (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderTop: `1px solid ${$.brd}`, background: $.bgI,
  }}>
    <div style={{ width: 3, height: 32, background: $.ac, borderRadius: 2 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: $.ac }}>Ответ на:</div>
      <div style={{ fontSize: 12, color: $.txS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {replyTargets[activeChat.id].text?.slice(0, 80) || "[файл]"}
      </div>
    </div>
    <button type="button" onClick={() => clearReplyTarget(activeChat.id)}
            style={{ border: "none", background: "transparent", color: $.txS, fontSize: 18, cursor: "pointer" }}
            aria-label="Отменить ответ">×</button>
  </div>
)}
```

- [ ] **Step 7: Add jump-to-message scroll helper**

Add a ref map and a function:

```jsx
const messageRefs = useRef(new Map());

const onJumpToMessage = useCallback((messageId) => {
  const el = messageRefs.current.get(messageId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("messenger-highlight");
  setTimeout(() => el.classList.remove("messenger-highlight"), 1200);
}, []);
```

And in the global stylesheet (`src/styles/global.css` or wherever app styles live — check `src/styles/`), add once:

```css
.messenger-highlight {
  animation: messenger-highlight-flash 1200ms ease-out;
}
@keyframes messenger-highlight-flash {
  0%   { background: rgba(255, 220, 100, 0.45); }
  100% { background: transparent; }
}
```

When rendering each bubble, attach the ref:

```jsx
<div ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}>
  <MessageBubble ... />
</div>
```

- [ ] **Step 8: Wire up context menu with new pin/reply handlers**

Find where `MessengerContextMenu` is rendered. Extend the handler set:

```jsx
<MessengerContextMenu
  x={ctx.x} y={ctx.y}
  msgType={ctx.msg.msg_type}
  canEdit={ctx.msg.sender_id === user.id && !ctx.msg.deleted_for_all && ctx.msg.msg_type === "text"}
  canDeleteForAll={ctx.msg.sender_id === user.id || user.role === "admin"}
  isPinnedForAll={!!ctx.msg.pinned_at}
  isPinnedForMe={(pinnedForMe[activeChat.id] || []).some((m) => m.id === ctx.msg.id)}
  canPinForAll={chatPins.length < 5}
  canPinForMe={(pinnedForMe[activeChat.id] || []).length < 5}
  onReply={() => { setReplyTarget(activeChat.id, ctx.msg); closeCtx(); }}
  onForward={() => { /* existing forward modal */ closeCtx(); }}
  onEdit={() => { /* existing edit handler */ closeCtx(); }}
  onCopy={() => { navigator.clipboard?.writeText(ctx.msg.text || ""); closeCtx(); }}
  onPinForAll={() => { pinForAll(activeChat.id, ctx.msg.id); closeCtx(); }}
  onUnpinForAll={() => { unpinForAll(activeChat.id, ctx.msg.id); closeCtx(); }}
  onPinForMe={() => { pinForMe(activeChat.id, ctx.msg.id); closeCtx(); }}
  onUnpinForMe={() => { unpinForMe(activeChat.id, ctx.msg.id); closeCtx(); }}
  onDeleteSelf={() => { /* existing handler */ closeCtx(); }}
  onDeleteAll={() => { /* existing handler */ closeCtx(); }}
  onEnterSelection={() => { enterSelectionMode(ctx.msg.id); closeCtx(); }}
/>
```

(`ctx` is whatever the existing local state name is for the open context menu; keep the original convention. `closeCtx()` is whatever close handler is already used.)

- [ ] **Step 9: Render action-bar in selection mode**

At the top of the chat window (when `selectionMode` is true), replace the header with:

```jsx
{selectionMode ? (
  <div style={{
    display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
    borderBottom: `1px solid ${$.brd}`, background: $.bgC,
  }}>
    <button type="button" onClick={exitSelectionMode}
            style={{ border: "none", background: "transparent", color: $.tx, fontSize: 20, cursor: "pointer" }}>←</button>
    <div style={{ flex: 1, fontWeight: 600 }}>Выбрано: {selectedIds.length}</div>
    <button type="button"
      onClick={async () => {
        if (selectedIds.length === 0) return;
        const choice = window.confirm(`Удалить ${selectedIds.length} сообщ. у всех? (Отмена = у себя)`);
        const scope = choice ? "all" : "self";
        const result = await bulkDelete(activeChat.id, selectedIds, scope);
        if (!result.ok && result.error?.includes?.("BULK_DELETE_FORBIDDEN")) {
          alert("Нельзя удалить чужие сообщения у всех. Снимите выделение с чужих или удалите у себя.");
        }
      }}
      style={{ height: 36, padding: "0 12px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, cursor: "pointer" }}>
      Удалить
    </button>
    <button type="button"
      onClick={() => { /* open existing MessengerForwardModal with selectedIds */ }}
      style={{ height: 36, padding: "0 12px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, cursor: "pointer" }}>
      Переслать
    </button>
  </div>
) : (
  /* existing header */
)}
```

- [ ] **Step 10: Toggle selection on click when in selection mode**

In the bubble rendering area, intercept clicks:

```jsx
<div
  onClick={(e) => {
    if (selectionMode) { toggleSelection(msg.id); e.preventDefault(); }
  }}
  ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
>
  <MessageBubble
    msg={msg}
    selectionMode={selectionMode}
    isSelected={selectedIds.includes(msg.id)}
    onToggleSelection={toggleSelection}
    replyToMessage={msg.reply_to_message_id ? findMessageById(msg.reply_to_message_id) : null}
    onJumpToMessage={onJumpToMessage}
    participants={activeChat.participants}
    /* ...other existing props... */
  />
</div>
```

Where `findMessageById(id)` is a helper:

```jsx
const findMessageById = useCallback((id) => {
  const list = messages[activeChat?.id] || [];
  return list.find((m) => m.id === id) || null;
}, [messages, activeChat?.id]);
```

- [ ] **Step 11: Mention picker integration**

Inside the input form area, add a relative-positioned wrapper around the textarea:

```jsx
const [mentionQuery, setMentionQuery] = useState(null); // string | null

const handleInputChange = (e) => {
  const value = e.target.value;
  setText(value);
  // detect @-token at cursor
  const cursor = e.target.selectionStart;
  const before = value.slice(0, cursor);
  const match = before.match(/(?:^|\s)@(\S*)$/);
  setMentionQuery(match ? match[1] : null);
};

const pickMention = (participant) => {
  const cursor = textareaRef.current?.selectionStart ?? text.length;
  const before = text.slice(0, cursor).replace(/@\S*$/, "");
  const after = text.slice(cursor);
  const insertion = `@${participant.display_name || participant.username} `;
  setText(before + insertion + after);
  setMentionQuery(null);
};
```

And in JSX:

```jsx
<div style={{ position: "relative", flex: 1 }}>
  {mentionQuery !== null && (
    <MessengerMentionPicker
      participants={activeChat.participants}
      query={mentionQuery}
      onPick={pickMention}
      currentUserId={user.id}
    />
  )}
  <textarea
    ref={textareaRef}
    value={text}
    onChange={handleInputChange}
    /* ...rest of existing textarea props... */
  />
</div>
```

When sending, parse the text for mentions and pass them through:

```jsx
const parseMentions = (textValue, participants) => {
  const ids = [];
  for (const p of participants || []) {
    const name = p.display_name || p.username;
    if (!name) continue;
    const re = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$|[^\\w-])`);
    if (re.test(textValue)) ids.push(p.user_id);
  }
  return ids;
};

const handleSend = async () => {
  const trimmed = text.trim();
  if (!trimmed) return;
  const mentioned = parseMentions(trimmed, activeChat.participants);
  const options = {};
  if (replyTargets[activeChat.id]) options.replyToMessageId = replyTargets[activeChat.id].id;
  if (mentioned.length > 0) options.mentionedUserIds = mentioned;
  const ok = await sendMsg(activeChat.id, trimmed, options);
  if (ok) { setText(""); /* reply auto-clears in context */ }
};
```

- [ ] **Step 12: Commit**

```bash
git add src/components/MessengerChatWindow.jsx src/styles/global.css
git commit -m "feat: integrate pin-bar/reply/mention/selection in MessengerChatWindow"
```

### Task 11.2: In-chat search overlay (desktop)

**Files:**
- Modify: `src/components/MessengerChatWindow.jsx`.

- [ ] **Step 1: Add search state**

```jsx
const [searchOpen, setSearchOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState("");
const [searchResults, setSearchResults] = useState([]);
const [searchIndex, setSearchIndex] = useState(0);

useEffect(() => {
  if (!searchOpen) { setSearchResults([]); return; }
  const t = setTimeout(async () => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const result = await searchInChat(activeChat.id, searchQuery.trim());
    setSearchResults(result.matches || []);
    setSearchIndex(0);
  }, 300);
  return () => clearTimeout(t);
}, [searchOpen, searchQuery, activeChat?.id, searchInChat]);
```

- [ ] **Step 2: Add search overlay in header**

In the header rendering, replace the title bar when `searchOpen` with an input + nav buttons:

```jsx
{searchOpen ? (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderBottom: `1px solid ${$.brd}` }}>
    <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
           placeholder="Поиск в чате..." style={{ flex: 1, height: 36, padding: "0 12px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }} />
    <div style={{ fontSize: 12, color: $.txS, minWidth: 60 }}>
      {searchResults.length > 0 ? `${searchIndex + 1}/${searchResults.length}` : "—"}
    </div>
    <button type="button" disabled={searchResults.length === 0}
            onClick={() => { const next = (searchIndex - 1 + searchResults.length) % searchResults.length; setSearchIndex(next); onJumpToMessage(searchResults[next].messageId); }}>↑</button>
    <button type="button" disabled={searchResults.length === 0}
            onClick={() => { const next = (searchIndex + 1) % searchResults.length; setSearchIndex(next); onJumpToMessage(searchResults[next].messageId); }}>↓</button>
    <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>×</button>
  </div>
) : (
  /* existing header with new search icon: */
  <div style={{ /* ... */ }}>
    {/* existing chat title etc. */}
    <button type="button" onClick={() => setSearchOpen(true)} aria-label="Поиск" style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", color: $.tx, cursor: "pointer", fontSize: 18 }}>🔍</button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MessengerChatWindow.jsx
git commit -m "feat: add in-chat search overlay to MessengerChatWindow"
```

### Task 11.3: Chat list global search + mention badge

**Files:**
- Modify: `src/components/MessengerChatList.jsx`.

- [ ] **Step 1: Add global search input toggle**

```jsx
const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
const [globalQuery, setGlobalQuery] = useState("");
const [globalGroups, setGlobalGroups] = useState([]);
const { searchGlobal, setActiveChatId } = useMessenger();

useEffect(() => {
  if (!globalSearchOpen) { setGlobalGroups([]); return; }
  const t = setTimeout(async () => {
    if (globalQuery.trim().length < 2) { setGlobalGroups([]); return; }
    const result = await searchGlobal(globalQuery.trim());
    setGlobalGroups(result.groups || []);
  }, 300);
  return () => clearTimeout(t);
}, [globalQuery, globalSearchOpen, searchGlobal]);
```

- [ ] **Step 2: Render search panel above chat list**

```jsx
<div style={{ padding: 10, borderBottom: `1px solid ${$.brd}` }}>
  {globalSearchOpen ? (
    <div style={{ display: "flex", gap: 8 }}>
      <input autoFocus value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)}
             placeholder="Поиск по всем чатам..." style={{ flex: 1, height: 34, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }} />
      <button type="button" onClick={() => { setGlobalSearchOpen(false); setGlobalQuery(""); setGlobalGroups([]); }}>×</button>
    </div>
  ) : (
    <button type="button" onClick={() => setGlobalSearchOpen(true)}
            style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.txS, textAlign: "left", padding: "0 10px", cursor: "pointer" }}>
      🔍 Поиск по сообщениям
    </button>
  )}
</div>

{globalSearchOpen && globalGroups.length > 0 && (
  <div style={{ borderBottom: `1px solid ${$.brd}`, padding: "4px 0", maxHeight: 360, overflowY: "auto" }}>
    {globalGroups.map((g) => (
      <div key={g.chatId} style={{ padding: "6px 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: $.txS, marginBottom: 4 }}>{g.chatTitle}</div>
        {g.matches.map((m) => (
          <button key={m.messageId} type="button"
            onClick={() => { setActiveChatId(g.chatId); setGlobalSearchOpen(false); /* downstream jump handled by chat opening */ }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", border: "none", background: "transparent", color: $.tx, cursor: "pointer", borderRadius: 6, fontSize: 12 }}>
            {m.snippet}
          </button>
        ))}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Add mention badge to chat row**

In the existing chat row JSX, near the unread counter, add:

```jsx
const hasUnreadMention = useMemo(() => {
  const list = (messages[chat.id] || []);
  const lastRead = (chat.receipts || []).find((r) => r.user_id === user.id)?.last_read_message_id || 0;
  return list.some((m) => m.id > lastRead && m.sender_id !== user.id && Array.isArray(m.meta?.mentionedUserIds) && m.meta.mentionedUserIds.includes(user.id));
}, [messages, chat, user.id]);
```

And in render:

```jsx
{hasUnreadMention && (
  <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: $.ac, color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px" }}>@</span>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/MessengerChatList.jsx
git commit -m "feat: global search panel + mention badge in MessengerChatList"
```

### Task 11.4: Settings panel in `MessengerShell` (desktop)

**Files:**
- Create: `src/components/MessengerSettingsPanel.jsx`.
- Modify: `src/components/MessengerShell.jsx`.

- [ ] **Step 1: Create the settings panel (shared by desktop, mobile reuses the sections)**

```jsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MessengerSettingsPanel({ onClose }) {
  const { user, logout, authFetch } = useAuth();
  const { $, mode, setMode } = useTheme();
  const {
    wsConnected, notificationStatus, enableNotifications,
    fontSize, setFontSize, updateDisplayName,
    listDevices, revokeDevice, clearLocalCache,
  } = useMessenger();
  const [displayName, setDisplayName] = useState(user?.display_name || user?.username || "");
  const [devices, setDevices] = useState([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [cacheStatus, setCacheStatus] = useState("");

  useEffect(() => { listDevices().then(setDevices); }, [listDevices]);

  const handleNameBlur = async () => {
    if (displayName.trim() === (user?.display_name || "")) return;
    const result = await updateDisplayName(displayName.trim());
    if (!result.ok) setDisplayName(user?.display_name || "");
  };

  const handlePwSubmit = async () => {
    if (pwNew !== pwConfirm) { setPwMsg("Новый пароль не совпадает"); return; }
    if (pwNew.length < 6) { setPwMsg("Минимум 6 символов"); return; }
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setPwMsg(data?.error || "Ошибка"); return; }
      setPwMsg("Пароль изменён"); setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setPwOpen(false); setPwMsg(""); }, 1200);
    } catch (e) { setPwMsg(e.message); }
  };

  return (
    <div style={{ display: "grid", gap: 12, padding: 14, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Настройки</h2>

      {/* Profile */}
      <section style={{ display: "grid", gap: 6, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>ПРОФИЛЬ</div>
        <label style={{ fontSize: 12 }}>Отображаемое имя</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} onBlur={handleNameBlur}
               style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }} />
      </section>

      {/* Notifications */}
      <section style={{ display: "grid", gap: 6, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>УВЕДОМЛЕНИЯ</div>
        <div style={{ fontSize: 12 }}>Статус: {notificationStatus}</div>
        <button type="button" onClick={enableNotifications} style={{ height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}>Включить уведомления</button>
      </section>

      {/* Appearance */}
      <section style={{ display: "grid", gap: 8, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>ВНЕШНИЙ ВИД</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["system", "light", "dark"].map((m) => (
            <button key={m} type="button" onClick={() => setMode?.(m)}
              style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${$.brd}`, background: mode === m ? $.ac : $.bg, color: mode === m ? "#fff" : $.tx, cursor: "pointer", fontSize: 12 }}>
              {m === "system" ? "Системная" : m === "light" ? "Светлая" : "Тёмная"}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: $.txS, marginTop: 4 }}>Размер шрифта</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["S", "M", "L"].map((s) => (
            <button key={s} type="button" onClick={() => setFontSize(s)}
              style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${$.brd}`, background: fontSize === s ? $.ac : $.bg, color: fontSize === s ? "#fff" : $.tx, cursor: "pointer", fontSize: 12 }}>
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Security */}
      <section style={{ display: "grid", gap: 8, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>БЕЗОПАСНОСТЬ</div>
        {!pwOpen ? (
          <button type="button" onClick={() => setPwOpen(true)} style={{ height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}>Сменить пароль</button>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} placeholder="Текущий пароль" style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }} />
            <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="Новый пароль" style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }} />
            <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} placeholder="Повторите новый" style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }} />
            {pwMsg && <div style={{ fontSize: 12, color: pwMsg === "Пароль изменён" ? $.ac : $.dn }}>{pwMsg}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={handlePwSubmit} style={{ flex: 1, height: 36, borderRadius: 8, border: "none", background: $.ac, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Сохранить</button>
              <button type="button" onClick={() => { setPwOpen(false); setPwMsg(""); }} style={{ flex: 1, height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}>Отмена</button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: $.txS, marginTop: 4 }}>Активные устройства</div>
        {devices.length === 0 && <div style={{ fontSize: 12, color: $.txS }}>Нет зарегистрированных устройств</div>}
        {devices.map((d) => (
          <div key={d.device_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.user_agent || "Устройство"}</div>
              <div style={{ fontSize: 10, color: $.txS }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</div>
            </div>
            <button type="button" onClick={async () => { await revokeDevice(d.device_id); setDevices((prev) => prev.filter((x) => x.device_id !== d.device_id)); }}
                    style={{ height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.dn, cursor: "pointer", fontSize: 12 }}>Отозвать</button>
          </div>
        ))}
      </section>

      {/* Data */}
      <section style={{ display: "grid", gap: 6, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>ДАННЫЕ</div>
        <button type="button" onClick={async () => { await clearLocalCache(); setCacheStatus("Кэш очищен"); setTimeout(() => setCacheStatus(""), 2000); }} style={{ height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}>
          {cacheStatus || "Очистить кэш"}
        </button>
        <button type="button" onClick={logout} style={{ height: 36, borderRadius: 8, border: "none", background: $.dn, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Выйти</button>
      </section>

      {onClose && (
        <button type="button" onClick={onClose} style={{ height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}>Закрыть</button>
      )}
    </div>
  );
}
```

**Note:** `setMode` and `mode` come from `useTheme()`. If `ThemeContext` does not currently export them, extend it (search `src/context/ThemeContext.jsx` for `useState` of theme and expose `setMode(value)` that writes to localStorage `dash_theme_mode` and applies the theme; preserve existing default behavior).

- [ ] **Step 2: Wire panel into desktop shell**

In `src/components/MessengerShell.jsx`, add a state for the panel and a cog button in the chat list header. Read the current shell:

```bash
sed -n '1,80p' src/components/MessengerShell.jsx
```

Add:

```jsx
const [settingsOpen, setSettingsOpen] = useState(false);
```

In the chat-list column header, add a cog button:

```jsx
<button type="button" onClick={() => setSettingsOpen(true)} aria-label="Настройки"
        style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", color: $.tx, cursor: "pointer", fontSize: 18 }}>⚙</button>
```

And below the main shell, render a slide-out panel:

```jsx
{settingsOpen && (
  <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 380, background: $.bg, borderLeft: `1px solid ${$.brd}`, overflowY: "auto", zIndex: 100, boxShadow: $.sh }}>
    <MessengerSettingsPanel onClose={() => setSettingsOpen(false)} />
  </aside>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MessengerSettingsPanel.jsx src/components/MessengerShell.jsx src/context/ThemeContext.jsx
git commit -m "feat: add MessengerSettingsPanel and desktop settings drawer"
```

---

## Wave 12 — Mobile UI Integration

### Task 12.1: Long-press + context menu in `MobileChatThread`

**Files:**
- Modify: `src/mobile/MobileChatThread.jsx`.

- [ ] **Step 1: Import context menu and shared components**

At the top of the file, add:

```jsx
import MessengerContextMenu from "../components/MessengerContextMenu";
import MessengerPinBar from "../components/MessengerPinBar";
import MessengerMentionPicker from "../components/MessengerMentionPicker";
```

- [ ] **Step 1.5: Extend `useMessenger()` destructure and add helper refs**

In `MobileChatThread`, find the existing `useMessenger()` destructure (around lines 12-23 of the original file) and extend with the new fields/methods:

```jsx
const {
  activeChatId, chats, messages, loadMessages, sendMsg, sendFiles, markRead,
  downloadFile, downloadFiles, getFileUrl,
  pinnedForAll, pinnedForMe, replyTargets,
  selectionMode, selectedIds,
  pinForAll, unpinForAll, pinForMe, unpinForMe,
  setReplyTarget, clearReplyTarget,
  enterSelectionMode, exitSelectionMode, toggleSelection,
  bulkDelete,
} = useMessenger();
```

Also add the helper refs and state used later in this task:

```jsx
const messageRefs = useRef(new Map());
const textareaRef = useRef(null);
const [pinCycleIndex, setPinCycleIndex] = useState(0);
const [mentionQuery, setMentionQuery] = useState(null);

const findMessageById = useCallback((id) => {
  const list = messages[activeChatId] || [];
  return list.find((m) => m.id === id) || null;
}, [messages, activeChatId]);

const parseMentions = (textValue, participants) => {
  const ids = [];
  for (const p of participants || []) {
    const name = p.display_name || p.username;
    if (!name) continue;
    const re = new RegExp(`@${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?=\\s|$|[^\\w-])`);
    if (re.test(textValue)) ids.push(p.user_id);
  }
  return ids;
};
```

- [ ] **Step 2: Add long-press detection**

In the component body, add state and a handler factory:

```jsx
const [ctx, setCtx] = useState(null); // { x, y, msg } | null
const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE = 8;

const longPressHandlers = (msg) => {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let triggered = false;
  return {
    onPointerDown: (e) => {
      startX = e.clientX; startY = e.clientY; triggered = false;
      timer = window.setTimeout(() => {
        triggered = true;
        if (navigator.vibrate) navigator.vibrate(10);
        setCtx({ x: startX, y: startY, msg });
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
        window.clearTimeout(timer);
      }
    },
    onPointerUp: () => { window.clearTimeout(timer); },
    onPointerCancel: () => { window.clearTimeout(timer); },
    onContextMenu: (e) => { e.preventDefault(); },
  };
};
```

- [ ] **Step 3: Wrap each rendered bubble with the handlers**

In the message-rendering loop, wrap each item:

```jsx
<div {...longPressHandlers(item.msg)} ref={(el) => { if (el) messageRefs.current.set(item.msg.id, el); else messageRefs.current.delete(item.msg.id); }}>
  <MessageBubble
    msg={item.msg}
    isMine={item.msg.sender_id === user?.id}
    chatReceipts={activeChat.receipts || []}
    participants={activeChat.participants || []}
    currentUserId={user?.id}
    chatId={activeChat.id}
    downloadFile={downloadFile}
    downloadFiles={downloadFiles}
    getFileUrl={getFileUrl}
    onOpenImage={openImage}
    replyToMessage={item.msg.reply_to_message_id ? findMessageById(item.msg.reply_to_message_id) : null}
    onJumpToMessage={(id) => { const el = messageRefs.current.get(id); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
    selectionMode={selectionMode}
    isSelected={selectedIds.includes(item.msg.id)}
    onToggleSelection={toggleSelection}
  />
</div>
```

Where `messageRefs` is `useRef(new Map())` defined in the component body.

- [ ] **Step 4: Render the context menu**

```jsx
{ctx && (
  <>
    <div onClick={() => setCtx(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
    <MessengerContextMenu
      x={ctx.x} y={ctx.y}
      msgType={ctx.msg.msg_type}
      canEdit={ctx.msg.sender_id === user.id && !ctx.msg.deleted_for_all && ctx.msg.msg_type === "text"}
      canDeleteForAll={ctx.msg.sender_id === user.id}
      isPinnedForAll={!!ctx.msg.pinned_at}
      isPinnedForMe={(pinnedForMe[activeChat.id] || []).some((m) => m.id === ctx.msg.id)}
      canPinForAll={(pinnedForAll[activeChat.id] || []).length < 5}
      canPinForMe={(pinnedForMe[activeChat.id] || []).length < 5}
      onReply={() => { setReplyTarget(activeChat.id, ctx.msg); setCtx(null); }}
      onForward={() => { /* open MessengerForwardModal */ setCtx(null); }}
      onEdit={() => { /* enter edit mode for this message */ setCtx(null); }}
      onCopy={() => { navigator.clipboard?.writeText(ctx.msg.text || ""); setCtx(null); }}
      onPinForAll={() => { pinForAll(activeChat.id, ctx.msg.id); setCtx(null); }}
      onUnpinForAll={() => { unpinForAll(activeChat.id, ctx.msg.id); setCtx(null); }}
      onPinForMe={() => { pinForMe(activeChat.id, ctx.msg.id); setCtx(null); }}
      onUnpinForMe={() => { unpinForMe(activeChat.id, ctx.msg.id); setCtx(null); }}
      onDeleteSelf={() => { /* call existing delete handler with scope=self */ setCtx(null); }}
      onDeleteAll={() => { /* call existing delete handler with scope=all */ setCtx(null); }}
      onEnterSelection={() => { enterSelectionMode(ctx.msg.id); setCtx(null); }}
    />
  </>
)}
```

- [ ] **Step 5: Add pin-bar above the message list**

```jsx
{(pinnedForAll[activeChat.id] || []).length > 0 && (
  <MessengerPinBar
    pinnedMessages={pinnedForAll[activeChat.id]}
    currentIndex={pinCycleIndex}
    onClickNext={() => {
      const list = pinnedForAll[activeChat.id];
      const target = list[pinCycleIndex];
      if (target) {
        const el = messageRefs.current.get(target.id);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setPinCycleIndex((i) => (i + 1) % list.length);
    }}
    onUnpin={(id) => unpinForAll(activeChat.id, id)}
  />
)}
```

- [ ] **Step 6: Add selection action-bar header**

Replace the header rendering when `selectionMode === true`:

```jsx
{selectionMode ? (
  <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
    <button type="button" onClick={exitSelectionMode} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 18 }}>✕</button>
    <div style={{ flex: 1, fontWeight: 700 }}>Выбрано: {selectedIds.length}</div>
    <button type="button" onClick={async () => {
        if (selectedIds.length === 0) return;
        const choice = window.confirm(`Удалить ${selectedIds.length} сообщ. у всех? (Отмена = у себя)`);
        const scope = choice ? "all" : "self";
        const r = await bulkDelete(activeChat.id, selectedIds, scope);
        if (!r.ok && r.error?.includes?.("BULK_DELETE_FORBIDDEN")) alert("Нельзя удалить чужие у всех");
      }} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 18 }}>🗑</button>
    <button type="button" onClick={() => { /* open forward modal */ }} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 18 }}>↗</button>
  </header>
) : (
  /* existing header — keep as-is */
)}
```

- [ ] **Step 7: Add reply preview above the input footer**

Above the input row in the existing `<footer>`:

```jsx
{replyTargets[activeChat.id] && (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 8px" }}>
    <div style={{ width: 3, height: 32, background: $.ac, borderRadius: 2 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: $.ac }}>Ответ на:</div>
      <div style={{ fontSize: 12, color: $.txS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {replyTargets[activeChat.id].text?.slice(0, 80) || "[файл]"}
      </div>
    </div>
    <button type="button" onClick={() => clearReplyTarget(activeChat.id)}
            style={{ border: "none", background: "transparent", color: $.txS, fontSize: 20 }}>×</button>
  </div>
)}
```

- [ ] **Step 8: Add mention picker around the textarea**

Wrap the existing textarea in a relative wrapper and add mention detection (use the same `handleInputChange`/`pickMention` pattern from Task 11.1 Step 11).

- [ ] **Step 9: Extend `handleSend` to pass reply + mentions**

```jsx
const handleSend = async () => {
  const trimmed = text.trim();
  if (!trimmed || sending || !activeChat) return;
  setSending(true); setError("");
  const mentioned = parseMentions(trimmed, activeChat.participants);
  const options = {};
  if (replyTargets[activeChat.id]) options.replyToMessageId = replyTargets[activeChat.id].id;
  if (mentioned.length > 0) options.mentionedUserIds = mentioned;
  const ok = await sendMsg(activeChat.id, trimmed, options);
  if (ok) { setText(""); setShowEmoji(false); }
  else setError("Не удалось отправить сообщение");
  setSending(false);
};
```

- [ ] **Step 10: Commit**

```bash
git add src/mobile/MobileChatThread.jsx
git commit -m "feat: long-press menu, multi-select, reply, mentions, pin-bar in MobileChatThread"
```

### Task 12.2: Create `MobileChatSearchOverlay`

**Files:**
- Create: `src/mobile/MobileChatSearchOverlay.jsx`.
- Modify: `src/mobile/MobileChatThread.jsx` to mount it.

- [ ] **Step 1: Write the overlay**

```jsx
import { useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileChatSearchOverlay({ chatId, onClose, onJumpToMessage }) {
  const { $ } = useTheme();
  const { searchInChat } = useMessenger();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setMatches([]); return; }
      const r = await searchInChat(chatId, q.trim());
      setMatches(r.matches || []);
      setIndex(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q, chatId, searchInChat]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px",
      background: $.bgC, borderBottom: `1px solid ${$.brd}`,
      display: "flex", gap: 8, alignItems: "center", zIndex: 9990,
    }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск в чате..."
             style={{ flex: 1, height: 38, padding: "0 12px", borderRadius: 10, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, fontSize: 14 }} />
      <div style={{ fontSize: 12, color: $.txS, minWidth: 50, textAlign: "center" }}>{matches.length > 0 ? `${index + 1}/${matches.length}` : "—"}</div>
      <button type="button" disabled={matches.length === 0}
              onClick={() => { const i = (index - 1 + matches.length) % matches.length; setIndex(i); onJumpToMessage?.(matches[i].messageId); }}
              style={{ width: 36, height: 36, border: "none", background: "transparent", color: $.tx, fontSize: 18 }}>↑</button>
      <button type="button" disabled={matches.length === 0}
              onClick={() => { const i = (index + 1) % matches.length; setIndex(i); onJumpToMessage?.(matches[i].messageId); }}
              style={{ width: 36, height: 36, border: "none", background: "transparent", color: $.tx, fontSize: 18 }}>↓</button>
      <button type="button" onClick={onClose}
              style={{ width: 36, height: 36, border: "none", background: "transparent", color: $.tx, fontSize: 18 }}>✕</button>
    </div>
  );
}
```

- [ ] **Step 2: Mount in `MobileChatThread`**

Add a search button (🔍) to the existing thread header, and state to show the overlay:

```jsx
const [searchOpen, setSearchOpen] = useState(false);

// In header (next to existing buttons):
<button type="button" onClick={() => setSearchOpen(true)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 16 }}>🔍</button>

// Above the main JSX, conditionally render the overlay:
{searchOpen && (
  <MobileChatSearchOverlay
    chatId={activeChat.id}
    onClose={() => setSearchOpen(false)}
    onJumpToMessage={(id) => {
      const el = messageRefs.current.get(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/mobile/MobileChatSearchOverlay.jsx src/mobile/MobileChatThread.jsx
git commit -m "feat: add MobileChatSearchOverlay (in-chat mobile search)"
```

### Task 12.3: Create `MobileSearchScreen` (global)

**Files:**
- Create: `src/mobile/MobileSearchScreen.jsx`.
- Modify: `src/mobile/MobileChatList.jsx` — add entry point.
- Modify: `src/mobile/MobileMessengerShell.jsx` — route to it.

- [ ] **Step 1: Write the screen**

```jsx
import { useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileSearchScreen({ onBack, onSelectChat }) {
  const { $ } = useTheme();
  const { searchGlobal } = useMessenger();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setGroups([]); return; }
      setBusy(true);
      const r = await searchGlobal(q.trim());
      setGroups(r.groups || []);
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, searchGlobal]);

  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={onBack} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по всем чатам..."
               style={{ flex: 1, height: 40, padding: "0 12px", borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 14 }} />
      </header>
      <section style={{ padding: 12, display: "grid", gap: 12 }}>
        {busy && <div style={{ color: $.txS, fontSize: 13 }}>Поиск...</div>}
        {!busy && q.trim().length >= 2 && groups.length === 0 && (
          <div style={{ color: $.txS, fontSize: 13, textAlign: "center", padding: 20 }}>Ничего не найдено</div>
        )}
        {groups.map((g) => (
          <div key={g.chatId}>
            <div style={{ fontSize: 11, fontWeight: 700, color: $.txS, marginBottom: 6 }}>{g.chatTitle}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {g.matches.map((m) => (
                <button key={m.messageId} type="button"
                  onClick={() => onSelectChat?.(g.chatId, m.messageId)}
                  style={{ textAlign: "left", padding: 10, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, color: $.tx, fontSize: 13, cursor: "pointer" }}>
                  {m.snippet}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Add entry point in `MobileChatList`**

In the chat list header (existing), add a 🔍 button that calls `props.onOpenSearch?.()`. Plumb the prop through.

- [ ] **Step 3: Route in `MobileMessengerShell`**

Add a screen state (`"list"` | `"thread"` | `"settings"` | `"search"`) and render `<MobileSearchScreen onBack={() => setScreen("list")} onSelectChat={(chatId) => { setActiveChatId(chatId); setScreen("thread"); }} />` when `screen === "search"`.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/MobileSearchScreen.jsx src/mobile/MobileChatList.jsx src/mobile/MobileMessengerShell.jsx
git commit -m "feat: add MobileSearchScreen (global mobile search)"
```

### Task 12.4: Mention badge in `MobileChatList`

**Files:**
- Modify: `src/mobile/MobileChatList.jsx`.

- [ ] **Step 1: Replicate Task 11.3 Step 3** for the mobile chat row component. Use the same `hasUnreadMention` computation; render an `@` chip next to the unread count in the row.

- [ ] **Step 2: Commit**

```bash
git add src/mobile/MobileChatList.jsx
git commit -m "feat: mention badge in MobileChatList"
```

### Task 12.5: Rewrite `MobileMessengerSettings`

**Files:**
- Rewrite: `src/mobile/MobileMessengerSettings.jsx`.

- [ ] **Step 1: Replace the file**

```jsx
import MessengerSettingsPanel from "../components/MessengerSettingsPanel";
import { useTheme } from "../context/ThemeContext";

export default function MobileMessengerSettings({ onBack }) {
  const { $ } = useTheme();
  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" onClick={onBack} aria-label="Назад" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Настройки</div>
      </header>
      <MessengerSettingsPanel />
    </main>
  );
}
```

The shared `MessengerSettingsPanel` (Task 11.4) handles all the section rendering. The mobile screen is now just the chrome.

- [ ] **Step 2: Commit**

```bash
git add src/mobile/MobileMessengerSettings.jsx
git commit -m "feat: rewrite MobileMessengerSettings to use MessengerSettingsPanel"
```

### Task 12.6: Personal bookmarks (pin-for-me list) screen — mobile

**Files:**
- Create: `src/mobile/MobileBookmarksScreen.jsx`.
- Modify: `src/mobile/MobileChatList.jsx` — add long-press → action sheet → "Закладки" entry.
- Modify: `src/mobile/MobileMessengerShell.jsx` — route to it.

- [ ] **Step 1: Write the bookmarks screen**

```jsx
import { useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileBookmarksScreen({ chatId, onBack, onJumpToMessage }) {
  const { $ } = useTheme();
  const { pinnedForMe, loadPinnedForMe, unpinForMe } = useMessenger();
  const list = pinnedForMe[chatId] || [];

  useEffect(() => { loadPinnedForMe(chatId); }, [chatId, loadPinnedForMe]);

  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" onClick={onBack} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Закладки</div>
      </header>
      <section style={{ padding: 12, display: "grid", gap: 8 }}>
        {list.length === 0 && <div style={{ color: $.txS, fontSize: 13, textAlign: "center", padding: 30 }}>Закладок нет</div>}
        {list.map((m) => (
          <div key={m.id} style={{ padding: 12, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: $.txS, fontWeight: 600 }}>{m.sender_display_name || m.sender_username}</div>
              <div style={{ fontSize: 13, color: $.tx, marginTop: 4, lineHeight: 1.4 }}>
                {m.deleted_for_all ? <em style={{ color: $.txS }}>Сообщение удалено</em> : m.text || "[файл]"}
              </div>
            </div>
            <button type="button" onClick={() => onJumpToMessage?.(m.id)} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer", fontSize: 12 }}>Перейти</button>
            <button type="button" onClick={() => unpinForMe(chatId, m.id)} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", color: $.txS, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Wire entry point in `MobileChatList`**

Add a long-press handler on chat rows (mirror the bubble long-press pattern from Task 12.1 Step 2). On trigger, show a simple action sheet:

```jsx
const [chatAction, setChatAction] = useState(null); // { x, y, chat } | null
{chatAction && (
  <>
    <div onClick={() => setChatAction(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
    <div style={{ position: "fixed", top: chatAction.y, left: chatAction.x, width: 180, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, padding: 6, zIndex: 9999 }}>
      <button type="button" onClick={() => { props.onOpenBookmarks?.(chatAction.chat.id); setChatAction(null); }}
              style={{ width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", color: $.tx, borderRadius: 6, fontSize: 13 }}>
        Закладки
      </button>
    </div>
  </>
)}
```

- [ ] **Step 3: Route in `MobileMessengerShell`**

Add a `"bookmarks"` screen state. When `screen === "bookmarks"`, render `<MobileBookmarksScreen chatId={bookmarksChatId} onBack={() => setScreen("list")} onJumpToMessage={(id) => { setActiveChatId(bookmarksChatId); setPendingScrollId(id); setScreen("thread"); }} />`. Implement `pendingScrollId` in `MobileChatThread` so the thread can scroll to it on mount.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/MobileBookmarksScreen.jsx src/mobile/MobileChatList.jsx src/mobile/MobileMessengerShell.jsx src/mobile/MobileChatThread.jsx
git commit -m "feat: add personal bookmarks screen on mobile"
```

### Task 12.7: Push pre-prompt + iOS install banner in mobile shell

**Files:**
- Modify: `src/mobile/MobileMessengerShell.jsx`.

- [ ] **Step 1: Mount the banner and prompt**

At the top of the shell render:

```jsx
import MessengerPushPrompt, { shouldShowPushPrompt } from "../components/MessengerPushPrompt";
import MessengerIosInstallBanner, { shouldShowIosInstallBanner } from "../components/MessengerIosInstallBanner";

// Inside the component:
const [showPushPrompt, setShowPushPrompt] = useState(false);
const [showIosBanner, setShowIosBanner] = useState(false);

useEffect(() => {
  setShowPushPrompt(shouldShowPushPrompt());
  setShowIosBanner(shouldShowIosInstallBanner());
}, []);
```

In the JSX:

```jsx
{showPushPrompt && <MessengerPushPrompt onClose={() => setShowPushPrompt(false)} />}
{showIosBanner && <MessengerIosInstallBanner onClose={() => setShowIosBanner(false)} />}
```

- [ ] **Step 2: Mount the same in desktop `MessengerShell`**

Same imports, same `useEffect`, same conditional render at top level — already cohabitates with the cog button etc.

- [ ] **Step 3: Manual UI check**

```bash
# In Chrome DevTools console (after loading the app on mobile-mode emulation):
localStorage.removeItem("messenger_push_prompt_seen")
localStorage.removeItem("messenger_ios_install_banner_dismissed")
# Reload — verify modal appears (Chrome) or banner appears (Safari iOS sim)
```

- [ ] **Step 4: Commit**

```bash
git add src/mobile/MobileMessengerShell.jsx src/components/MessengerShell.jsx
git commit -m "feat: mount push pre-prompt and iOS install banner"
```

---

## Wave 13 — Cache & Offline-Sync Touch-ups

### Task 13.1: Cache new fields in `messengerCache.js`

**Files:**
- Modify: `src/utils/messengerCache.js`.

- [ ] **Step 1: Read existing cache logic**

```bash
grep -n "saveCachedMessages\|loadCachedMessages\|pending" src/utils/messengerCache.js | head
```

- [ ] **Step 2: Verify new fields pass through**

Since the cache likely just stores the whole message object (verify by reading the file), the new `reply_to_message_id`, `pinned_at`, and `meta.mentionedUserIds` flow through unchanged. If the cache uses a per-field whitelist, add those fields to it.

- [ ] **Step 3: Pending-queue support for reply/mentions**

In `MessengerContext`, the pending queue retries failed sends after reconnect. Find the retry loop (search for `pendingQueue` / `flushPending`) and confirm `replyToMessageId`/`mentionedUserIds` are part of the persisted payload. If not, extend the persisted shape to include them so retried sends still carry the reply target and mentions.

- [ ] **Step 4: Commit if any change**

```bash
git add src/utils/messengerCache.js src/context/MessengerContext.jsx
git commit -m "feat: persist reply + mention fields in pending queue / cache"
```

---

## Wave 14 — Verify Scripts

Each script is a self-contained `node:assert/strict` runner, mirrors the existing `verifyMessengerUnread.mjs` shape, and runs against the **live dev server**. Scripts assume a known dev user token in `MESSENGER_TEST_TOKEN` env var.

### Task 14.1: `scripts/verifyMessengerPin.mjs`

**Files:**
- Create: `scripts/verifyMessengerPin.mjs`.

- [ ] **Step 1: Write the script**

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const MSG_IDS = String(process.env.SMOKE_MSG_IDS || "").split(",").map(Number).filter(Boolean);

if (!TOKEN || !CHAT_ID || MSG_IDS.length < 6) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_MSG_IDS (>=6 ids comma-sep)");
  process.exit(0);
}

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

// Pin 5 messages
for (const id of MSG_IDS.slice(0, 5)) {
  const r = await call(`/api/chats/${CHAT_ID}/messages/${id}/pin`, "POST");
  assert.equal(r.status, 200, `pin ${id} should succeed`);
}

// 6th should hit limit
const sixth = await call(`/api/chats/${CHAT_ID}/messages/${MSG_IDS[5]}/pin`, "POST");
assert.equal(sixth.status, 409, "6th pin should fail with limit");
assert.match(sixth.data?.error || "", /PIN_LIMIT_REACHED/);

// List
const list = await call(`/api/chats/${CHAT_ID}/pinned`);
assert.equal(list.status, 200);
assert.equal(list.data.messages.length, 5);

// Unpin all
for (const id of MSG_IDS.slice(0, 5)) {
  const r = await call(`/api/chats/${CHAT_ID}/messages/${id}/pin`, "DELETE");
  assert.equal(r.status, 200);
}

// Personal pin lifecycle
for (const id of MSG_IDS.slice(0, 5)) {
  await call(`/api/chats/${CHAT_ID}/messages/${id}/pin-for-me`, "POST");
}
const sixthMe = await call(`/api/chats/${CHAT_ID}/messages/${MSG_IDS[5]}/pin-for-me`, "POST");
assert.equal(sixthMe.status, 409);
const listMe = await call(`/api/chats/${CHAT_ID}/pinned-for-me`);
assert.equal(listMe.data.messages.length, 5);
for (const id of MSG_IDS.slice(0, 5)) {
  await call(`/api/chats/${CHAT_ID}/messages/${id}/pin-for-me`, "DELETE");
}

console.log("messenger pin ok");
```

- [ ] **Step 2: Run it**

```bash
MESSENGER_TEST_TOKEN="<token>" SMOKE_CHAT_ID=1 SMOKE_MSG_IDS=1,2,3,4,5,6 node scripts/verifyMessengerPin.mjs
```

Expected output: `messenger pin ok`.

- [ ] **Step 3: Add npm script**

In root `package.json`, in the `scripts` object, add:

```json
    "verify:messenger-pin": "node scripts/verifyMessengerPin.mjs",
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verifyMessengerPin.mjs package.json
git commit -m "test: add verifyMessengerPin script"
```

### Task 14.2: `scripts/verifyMessengerReply.mjs`

- [ ] **Step 1: Write the script**

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);

if (!TOKEN || !CHAT_ID) { console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID"); process.exit(0); }

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Send parent
const parent = await call(`/api/chats/${CHAT_ID}/messages`, "POST", {
  text: "parent for reply test", clientMessageId: `parent-${Date.now()}`,
});
assert.equal(parent.status, 200);
const parentId = parent.data.message.id;

// Reply to parent
const reply = await call(`/api/chats/${CHAT_ID}/messages`, "POST", {
  text: "this is a reply", replyToMessageId: parentId, clientMessageId: `reply-${Date.now()}`,
});
assert.equal(reply.status, 200);
assert.equal(reply.data.message.reply_to_message_id, parentId);

// Delete parent for all (only works if you own it)
await call(`/api/chats/${CHAT_ID}/messages/${parentId}?scope=all`, "DELETE");

// Re-fetch reply — reply_to_message_id should now be null (ON DELETE SET NULL)
// Use listMessages with a before greater than the reply's id
const fetched = await call(`/api/chats/${CHAT_ID}/messages?before=${reply.data.message.id + 1}&limit=20`);
const found = fetched.data.messages.find((m) => m.id === reply.data.message.id);
assert.equal(found.reply_to_message_id, null);

console.log("messenger reply ok");
```

- [ ] **Step 2-4: run, add npm script, commit (same as 14.1)**

```bash
node scripts/verifyMessengerReply.mjs
```

```json
    "verify:messenger-reply": "node scripts/verifyMessengerReply.mjs",
```

```bash
git add scripts/verifyMessengerReply.mjs package.json
git commit -m "test: add verifyMessengerReply script"
```

### Task 14.3: `scripts/verifyMessengerBulk.mjs`

- [ ] **Step 1: Write the script**

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const FOREIGN_MSG_ID = Number(process.env.SMOKE_FOREIGN_MSG_ID); // a message authored by another user

if (!TOKEN || !CHAT_ID || !FOREIGN_MSG_ID) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_FOREIGN_MSG_ID");
  process.exit(0);
}

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Send 2 own messages
const a = await call(`/api/chats/${CHAT_ID}/messages`, "POST", { text: "bulk a", clientMessageId: `bulk-a-${Date.now()}` });
const b = await call(`/api/chats/${CHAT_ID}/messages`, "POST", { text: "bulk b", clientMessageId: `bulk-b-${Date.now()}` });

// Mixed selection (own + foreign), scope=all → expect 403 atomic reject
const mixed = await call(`/api/chats/${CHAT_ID}/messages/bulk-delete`, "POST", {
  ids: [a.data.message.id, b.data.message.id, FOREIGN_MSG_ID], scope: "all",
});
assert.equal(mixed.status, 403);
assert.equal(mixed.data.error, "BULK_DELETE_FORBIDDEN");
assert.ok(Array.isArray(mixed.data.deniedIds));
assert.ok(mixed.data.deniedIds.includes(FOREIGN_MSG_ID));

// scope=self with same mixed selection → succeeds for self
const mixedSelf = await call(`/api/chats/${CHAT_ID}/messages/bulk-delete`, "POST", {
  ids: [a.data.message.id, b.data.message.id, FOREIGN_MSG_ID], scope: "self",
});
assert.equal(mixedSelf.status, 200);

console.log("messenger bulk ok");
```

- [ ] **Step 2-4: run, add npm script, commit**

```json
    "verify:messenger-bulk": "node scripts/verifyMessengerBulk.mjs",
```

```bash
git add scripts/verifyMessengerBulk.mjs package.json
git commit -m "test: add verifyMessengerBulk script"
```

### Task 14.4: `scripts/verifyMessengerSearch.mjs`

- [ ] **Step 1: Write the script**

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);

if (!TOKEN || !CHAT_ID) { console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID"); process.exit(0); }

const call = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const needle = `marker-${Date.now()}`;
const send = await post(`/api/chats/${CHAT_ID}/messages`, { text: `hello ${needle} world`, clientMessageId: needle });
assert.equal(send.status, 200);

// In-chat search
const inChat = await call(`/api/chats/${CHAT_ID}/messages/search?q=${encodeURIComponent(needle)}`);
assert.equal(inChat.status, 200);
assert.ok(inChat.data.matches.some((m) => m.snippet.includes(needle)));

// Global search
const global = await call(`/api/messenger/search?q=${encodeURIComponent(needle)}`);
assert.equal(global.status, 200);
assert.ok(global.data.groups.some((g) => g.matches.some((m) => m.snippet.includes(needle))));

// Too-short query returns empty done
const short = await call(`/api/chats/${CHAT_ID}/messages/search?q=a`);
assert.deepEqual(short.data, { matches: [], done: true });

console.log("messenger search ok");
```

- [ ] **Step 2-4: run, add npm script, commit**

```json
    "verify:messenger-search": "node scripts/verifyMessengerSearch.mjs",
```

```bash
git add scripts/verifyMessengerSearch.mjs package.json
git commit -m "test: add verifyMessengerSearch script"
```

### Task 14.5: `scripts/verifyMessengerMention.mjs`

- [ ] **Step 1: Write the script**

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const TARGET_USER_ID = Number(process.env.SMOKE_TARGET_USER_ID);
const NON_PARTICIPANT_USER_ID = Number(process.env.SMOKE_NON_PARTICIPANT_USER_ID);

if (!TOKEN || !CHAT_ID || !TARGET_USER_ID || !NON_PARTICIPANT_USER_ID) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_TARGET_USER_ID, SMOKE_NON_PARTICIPANT_USER_ID");
  process.exit(0);
}

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Valid mention
const ok = await post(`/api/chats/${CHAT_ID}/messages`, {
  text: "hi @someone", mentionedUserIds: [TARGET_USER_ID], clientMessageId: `mention-ok-${Date.now()}`,
});
assert.equal(ok.status, 200);
assert.deepEqual(ok.data.message.meta?.mentionedUserIds, [TARGET_USER_ID]);

// Invalid mention (non-participant)
const bad = await post(`/api/chats/${CHAT_ID}/messages`, {
  text: "hi", mentionedUserIds: [NON_PARTICIPANT_USER_ID], clientMessageId: `mention-bad-${Date.now()}`,
});
assert.equal(bad.status, 400);

console.log("messenger mention ok");
```

- [ ] **Step 2-4: run, add npm script, commit**

```json
    "verify:messenger-mention": "node scripts/verifyMessengerMention.mjs",
```

```bash
git add scripts/verifyMessengerMention.mjs package.json
git commit -m "test: add verifyMessengerMention script"
```

### Task 14.6: `scripts/verifyMessengerSettings.mjs`

- [ ] **Step 1: Write the script**

```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
if (!TOKEN) { console.log("set MESSENGER_TEST_TOKEN"); process.exit(0); }

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Get current me
const me = await call(`/api/auth/me`);
assert.equal(me.status, 200);
const original = me.data.user?.display_name || "";

// Patch display name
const patch = await call(`/api/auth/me`, "PATCH", { displayName: `verify-${Date.now()}` });
assert.equal(patch.status, 200);
assert.match(patch.data.displayName, /^verify-/);

// Restore
await call(`/api/auth/me`, "PATCH", { displayName: original });

// Devices list
const devices = await call(`/api/messenger/devices`);
assert.equal(devices.status, 200);
assert.ok(Array.isArray(devices.data.devices));

console.log("messenger settings ok");
```

- [ ] **Step 2-4: run, add npm script, commit**

```json
    "verify:messenger-settings": "node scripts/verifyMessengerSettings.mjs",
```

```bash
git add scripts/verifyMessengerSettings.mjs package.json
git commit -m "test: add verifyMessengerSettings script"
```

### Task 14.7: Final sweep — `verify:messenger-all`

**Files:**
- Modify: `package.json`.

- [ ] **Step 1: Add umbrella script**

In `scripts`:

```json
    "verify:messenger-all": "npm run verify:messenger-unread && npm run verify:messenger-push-client && npm run verify:messenger-pin && npm run verify:messenger-reply && npm run verify:messenger-bulk && npm run verify:messenger-search && npm run verify:messenger-mention && npm run verify:messenger-settings",
```

- [ ] **Step 2: Run end-to-end**

With server running (`npm run dev:server`):

```bash
MESSENGER_TEST_TOKEN="<token>" SMOKE_CHAT_ID=1 SMOKE_MSG_IDS=1,2,3,4,5,6 \
  SMOKE_FOREIGN_MSG_ID=<id> SMOKE_TARGET_USER_ID=<id> SMOKE_NON_PARTICIPANT_USER_ID=<id> \
  npm run verify:messenger-all
```

Expected: every script prints `... ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "test: add verify:messenger-all umbrella script"
```

---

## Wave 15 — Manual QA + Release Prep

### Task 15.1: Manual cross-platform QA matrix

- [ ] **Step 1: Run through the matrix**

For each combination, run through the user-visible flows:

| Browser/Device | Push pre-prompt | iOS banner | Pin-for-all | Reply | Search | Mentions | Multi-select |
|---|---|---|---|---|---|---|---|
| Desktop Chrome (Mac) | ✓ show on first messenger entry; verify denied path | n/a | open chat, long-press substitute (right-click) → Pin → bar appears | reply → cite → click → scroll | 🔍 in chat → results highlight; 🔍 in list → groups | type `@`, pick, send → bubble highlights | right-click → "Выбрать" → toggle → bulk delete |
| Desktop Safari (Mac) | same | n/a | same | same | same | same | same |
| Mobile Chrome (Android, PWA installed) | ✓ show modal | n/a (Android) | long-press 400ms → menu → pin | reply preview shows; click cite → scroll | 🔍 from header → overlay | type `@`, picker pops | menu → Выбрать → action-bar |
| Mobile Safari (iOS, NOT installed) | suppressed | ✓ banner shows | long-press → menu | same | same | same | same |
| Mobile Safari (iOS, installed PWA) | ✓ show modal | n/a | same | same | same | same | same |

- [ ] **Step 2: Smoke-check existing flows still work**

For each platform, also confirm:
- Existing single-message edit still works (desktop right-click → Редактировать)
- Existing single-message delete works
- File send still works
- Photo bundle send still works
- Read receipts (✓✓) still appear
- Push notifications still fire when another user sends a message (use two browsers)

- [ ] **Step 3: Verify no regressions in encryption**

```bash
# Send a fresh message in the UI, then:
psql "$DATABASE_URL" -c "SELECT id, encrypted_text FROM messages ORDER BY id DESC LIMIT 1"
```

Expected: `encrypted_text` is base64 ciphertext, not plain text. If anything legible appears, STOP and investigate — encryption pipeline must remain intact.

- [ ] **Step 4: Note any issues found and fix or punt**

For any regression, file a follow-up commit. For non-blocking polish issues, document in a `BUGS.md` for later cycle.

### Task 15.2: Final commit & PR

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```

Expected: nothing to commit, working tree clean.

- [ ] **Step 2: Push branch and open PR**

```bash
git push -u origin feat/messenger-telegram-parity-a
gh pr create --title "feat: messenger telegram-parity (sub-project A)" --body "$(cat <<'EOF'
## Summary
- Mobile long-press context menu + multi-select with bulk operations
- Reply-to-message with quoted preview and jump-to-original
- Pin-for-all (max 5 per chat) + pin-for-me personal bookmarks (max 5 per user per chat)
- Soft push pre-prompt modal + iOS install banner
- In-chat search and global cross-chat search (decrypt-and-scan)
- @-mentions with picker, validation, encrypted-meta storage, unread badge
- Settings panel: display_name edit, theme, font size, password change, active devices, clear cache, logout

All migrations are additive (`ALTER TABLE ... ADD COLUMN` via `try/catch`). No changes to existing endpoints' response shapes. Two new WS events (`message_pinned`, `message_unpinned`) — old clients safely ignore. Push notification flow untouched.

Reference spec: `docs/superpowers/specs/2026-05-14-messenger-telegram-parity-design.md`

## Test plan
- [ ] `npm run verify:messenger-all` passes
- [ ] Manual QA matrix (see Wave 15 in plan): Chrome desktop, Safari desktop, Chrome Android PWA, Safari iOS (installed and non-installed)
- [ ] No regression in single-message edit/delete, file/photo send, read receipts, push notifications
- [ ] `psql` check confirms `encrypted_text` remains encrypted

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review and address feedback**

Done.

---

## Appendix A — Files Touched (Summary)

**Created:**
- `src/components/MessengerPinBar.jsx`
- `src/components/MessengerMentionPicker.jsx`
- `src/components/MessengerPushPrompt.jsx`
- `src/components/MessengerIosInstallBanner.jsx`
- `src/components/MessengerSettingsPanel.jsx`
- `src/mobile/MobileChatSearchOverlay.jsx`
- `src/mobile/MobileSearchScreen.jsx`
- `src/mobile/MobileBookmarksScreen.jsx`
- `server/services/messengerSearch.js`
- `scripts/verifyMessengerPin.mjs`
- `scripts/verifyMessengerReply.mjs`
- `scripts/verifyMessengerBulk.mjs`
- `scripts/verifyMessengerSearch.mjs`
- `scripts/verifyMessengerMention.mjs`
- `scripts/verifyMessengerSettings.mjs`

**Modified:**
- `server/services/db.js` (migrations + helpers)
- `server/services/ws.js` (reply/mention validation)
- `server/services/messengerStore.js` (listMessengerDevicesForUser)
- `server/routes/messenger.js` (pin/bulk/search endpoints, reply/mentions on POST /messages)
- `server/routes/auth.js` (PATCH /me)
- `src/utils/messengerApi.js` (new client API methods)
- `src/utils/messengerCache.js` (verify new fields persist)
- `src/context/MessengerContext.jsx` (state + methods + WS handlers)
- `src/context/ThemeContext.jsx` (expose setMode/mode if not already)
- `src/components/MessengerContextMenu.jsx` (full rewrite with new items)
- `src/components/MessageBubble.jsx` (reply citation, mentions, selection)
- `src/components/MessengerChatWindow.jsx` (integration on desktop)
- `src/components/MessengerChatList.jsx` (global search + mention badge)
- `src/components/MessengerShell.jsx` (cog button + settings drawer)
- `src/styles/global.css` (highlight keyframes)
- `src/mobile/MobileChatThread.jsx` (long-press, multi-select, reply, mentions, pin-bar)
- `src/mobile/MobileChatList.jsx` (search entry, mention badge, long-press → bookmarks)
- `src/mobile/MobileMessengerShell.jsx` (routing + prompt/banner mount)
- `src/mobile/MobileMessengerSettings.jsx` (rewritten as thin wrapper)
- `package.json` (verify scripts)

---

## Appendix B — Spec Section ↔ Plan Task Coverage

| Spec section | Plan tasks |
|---|---|
| 2.1 New `messages` columns | 1.1 |
| 2.2 New `message_pinned_for_users` table | 1.1 |
| 2.3 Indexes | 1.1 |
| 2.5 Migrations applied via `initSchema` | 1.1 |
| 3.1 New HTTP endpoints (pin, bulk, search, devices, PATCH /me) | 2.1–2.5, 4.2–4.3, 5.3–5.4, 6.1–6.2 |
| 3.2 Extend `POST /messages` (reply, mentions) | 3.1 |
| 3.3 Existing endpoints unchanged | (no task — covered by not touching them) |
| 3.4 WS events `message_pinned`/`message_unpinned` | 2.1, 2.2 (server) + 8.2 (client) |
| 3.5 `new_message` payload + mentions | 3.1, 3.2 (mentions ride in encrypted_meta) |
| 3.6 Access rules | enforced in 2.1–2.5, 4.2 |
| 3.7 Decrypt-and-scan search | 5.1–5.4 |
| 4.1 File structure | covered across waves |
| 4.2 Context menu behaviour | 9.5 + integration 11.1, 12.1 |
| 4.3 Multi-select | 8.4 + 11.1 + 12.1 |
| 4.4 Reply UI | 10.1 + 11.1 + 12.1 |
| 4.5 Pin-bar | 9.1 + 11.1 + 12.1 + bookmarks 12.6 |
| 4.6 Search overlays | 11.2 + 11.3 + 12.2 + 12.3 |
| 4.7 @-mentions | 9.2 + 10.1 + 11.1 + 11.3 + 12.1 + 12.4 |
| 4.8 Push pre-prompt + iOS banner | 9.3 + 9.4 + 12.7 |
| 4.9 Settings panel (mobile + desktop) | 11.4 + 12.5 |
| 5 Safety + rollback | covered by additive migration pattern + Task 15.1 Step 3 |
| 5.3 Verify scripts | 14.1–14.7 |

