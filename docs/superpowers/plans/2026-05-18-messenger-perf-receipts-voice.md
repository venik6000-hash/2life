# Messenger: Perf + Read Receipts + Voice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent messenger improvements in one PR: (1) chat-list last-message previews with smart timestamps, (2) Telegram-style per-message read-receipts UI ("N просмотров" + reader list), (3) voice messages with hold-to-record, waveform, and playback controls.

**Architecture:** Three independent streams sharing only the existing E2E pipeline (AES-GCM with chat key) and the existing WebSocket broadcaster. The voice blob rides the existing `chat_files` upload endpoint; the read-receipt UI derives readers from the existing `message_receipts` cursor table; the chat-list preview comes from a new `LATERAL JOIN` inside `getChatsByUser`. No schema migrations except one optional index.

**Tech Stack:** Node 18+ / Express / PostgreSQL on the server; React 18 + Vite + plain CSS-in-JS (no Tailwind) on the client; native `MediaRecorder` + Web Audio API for voice capture; Web Crypto (`AES-GCM 256` + ECDH) already in `src/utils/crypto.js`; WebSocket already in `server/services/ws.js`; tests = standalone Node verify scripts under `scripts/verifyMessenger*.mjs` using `node:assert/strict`.

**Spec:** [docs/superpowers/specs/2026-05-18-messenger-perf-receipts-voice-design.md](../specs/2026-05-18-messenger-perf-receipts-voice-design.md)

**One spec deviation, noted up front:**
- Spec §5.1 says to emit a new WS `read_receipt` event from `POST /chats/:chatId/read`. The route already broadcasts `receipts_update` with the full `receipts` array, and `MessengerContext` already handles it (case at `src/context/MessengerContext.jsx:488`). Reusing `receipts_update` is strictly a superset — bubbles re-derive `✓/✓✓` from `receiptsByChat`, and the readers popover re-derives names from the same store. **No new WS event is added.** The dedicated REST endpoint `GET /chats/:chatId/messages/:messageId/readers` for the popover stays.

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `src/utils/chatTimeFormat.js` | Pure: `formatChatListTime(iso, now)` → `"HH:MM"` / `"пн"` / `"DD/MM/YYYY"` |
| `src/utils/formatReadAt.js` | Pure: `formatReadAt(iso, now)` → `"сегодня в HH:MM"` / `"вчера в HH:MM"` / `"DD.MM.YYYY HH:MM"` |
| `src/utils/voiceWaveform.js` | Pure: `resampleWaveform(samples, bars)`, `packWaveform(u8)`, `unpackWaveform(b64)` |
| `src/components/MessengerReadersPopover.jsx` | Popover/bottom-sheet listing readers of one message |
| `src/components/MessengerVoiceRecorder.jsx` | Hold-to-record UI, mic permission, lock/cancel state machine |
| `src/components/MessengerVoiceBubble.jsx` | SVG waveform + `<audio>` player + speed toggle |
| `scripts/verifyChatTimeFormat.mjs` | Unit-style verify for `chatTimeFormat.js` |
| `scripts/verifyFormatReadAt.mjs` | Unit-style verify for `formatReadAt.js` |
| `scripts/verifyVoiceWaveform.mjs` | Unit-style verify for `voiceWaveform.js` |
| `scripts/verifyMessengerChatPreview.mjs` | Smoke test: `GET /api/chats` returns `last_message` |
| `scripts/verifyMessengerReaders.mjs` | Smoke test: readers endpoint auth + payload |
| `scripts/verifyMessengerVoice.mjs` | Smoke test: voice round-trip (upload → send → fetch) |

### Modified files

| Path | What changes |
|------|--------------|
| `server/services/db.js` | `getChatsByUser` adds `LATERAL JOIN` for last non-system, non-hidden message; new `getReadersForMessage` |
| `server/routes/messenger.js` | Voice payload validation in `POST .../messages`; new `GET .../readers`; `message_deleted_all` payload includes refreshed `last_message` |
| `server/services/messengerPush.js` | Voice → "🎤 Голосовое сообщение" |
| `src/context/MessengerContext.jsx` | On `new_message` patch `chat.last_message`; on `message_deleted_all` patch `chat.last_message` from payload |
| `src/components/MessengerChatList.jsx` | Read from `chat.last_message`; use `formatChatListTime` |
| `src/mobile/MobileChatList.jsx` | Same as above for mobile |
| `src/components/MessengerContextMenu.jsx` | Add `views` row + popover |
| `src/mobile/MobileChatThread.jsx` | Long-press sheet gets `views` row; mount `MessengerVoiceRecorder` |
| `src/components/MessengerChatWindow.jsx` | Mount `MessengerVoiceRecorder` |
| `src/components/MessageBubble.jsx` | Branch `msg_type === 'voice'` → `MessengerVoiceBubble` |
| `package.json` | New `verify:messenger-*` scripts, joined into `verify:messenger-all` |

---

## Phase 1 — Chat List Preview (perf)

### Task 1.1: Pure util — `formatChatListTime`

**Files:**
- Create: `src/utils/chatTimeFormat.js`
- Create: `scripts/verifyChatTimeFormat.mjs`

- [ ] **Step 1: Write the failing verify script**

`scripts/verifyChatTimeFormat.mjs`:
```js
import assert from "node:assert/strict";
import { formatChatListTime } from "../src/utils/chatTimeFormat.js";

const now = new Date("2026-05-18T15:00:00+03:00");

// Today → HH:MM (local)
assert.equal(formatChatListTime("2026-05-18T07:42:00+03:00", now), "07:42");
assert.equal(formatChatListTime("2026-05-18T23:00:00+03:00", now), "23:00");

// Yesterday → short weekday
assert.equal(formatChatListTime("2026-05-17T10:00:00+03:00", now), "вс");

// 2..6 days ago → short weekday
assert.equal(formatChatListTime("2026-05-13T10:00:00+03:00", now), "ср");
assert.equal(formatChatListTime("2026-05-12T10:00:00+03:00", now), "вт");

// 7 days ago → date
assert.equal(formatChatListTime("2026-05-11T10:00:00+03:00", now), "11/05/2026");

// Older → date
assert.equal(formatChatListTime("2025-12-25T10:00:00+03:00", now), "25/12/2025");

// Null/undefined → empty
assert.equal(formatChatListTime(null, now), "");
assert.equal(formatChatListTime("", now), "");

console.log("chatTimeFormat ok");
```

- [ ] **Step 2: Run it; expect failure**

Run: `node scripts/verifyChatTimeFormat.mjs`
Expected: `Cannot find module .../src/utils/chatTimeFormat.js`

- [ ] **Step 3: Implement the util**

`src/utils/chatTimeFormat.js`:
```js
const SHORT_WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const pad2 = (n) => String(n).padStart(2, "0");

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Local-midnight date (yyyy-mm-dd) treated as day index.
const dayIndex = (d) => {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor(t / 86400000);
};

export function formatChatListTime(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (sameDay(d, now)) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const diffDays = dayIndex(now) - dayIndex(d);
  if (diffDays >= 1 && diffDays <= 6) return SHORT_WEEKDAYS_RU[d.getDay()];
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
```

- [ ] **Step 4: Run; expect pass**

Run: `node scripts/verifyChatTimeFormat.mjs`
Expected: `chatTimeFormat ok`

- [ ] **Step 5: Commit**

```bash
git add src/utils/chatTimeFormat.js scripts/verifyChatTimeFormat.mjs
git commit -m "feat(messenger): chatTimeFormat util for chat list timestamps"
```

---

### Task 1.2: SQL — `getChatsByUser` returns last non-system message

**Files:**
- Modify: `server/services/db.js:1005-1014` (function `getChatsByUser`)
- Modify: `server/services/db.js` (add index inside DDL block — find `idx_mr_chat` near line 323 and add new index next to it)

- [ ] **Step 1: Add the index inside the schema init**

Find the line `CREATE INDEX IF NOT EXISTS idx_mr_chat ON message_receipts(chat_id);` in `server/services/db.js` (around line 323) and **add immediately after it**:
```sql
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id_id_desc ON messages(chat_id, id DESC);
```

- [ ] **Step 2: Rewrite `getChatsByUser` to include `last_message`**

Replace the body at `server/services/db.js:1005-1014`:
```js
const getChatsByUser = async (userId) => {
  const r = await pool.query(
    `SELECT c.*, cp.role_in_chat, cp.encrypted_chat_key, cp.is_pinned,
            lm.id          AS last_message_id,
            lm.sender_id   AS last_message_sender_id,
            lm.msg_type    AS last_message_type,
            lm.text        AS last_message_text,
            lm.created_at  AS last_message_at
     FROM chats c
     JOIN chat_participants cp ON cp.chat_id = c.id AND cp.user_id = $1
     LEFT JOIN LATERAL (
       SELECT m.id, m.sender_id, m.msg_type, m.text, m.created_at
       FROM messages m
       WHERE m.chat_id = c.id
         AND m.msg_type <> 'system'
         AND NOT EXISTS (
           SELECT 1 FROM message_hidden_for_users h
           WHERE h.message_id = m.id AND h.user_id = $1
         )
       ORDER BY m.id DESC
       LIMIT 1
     ) lm ON TRUE
     ORDER BY cp.is_pinned DESC,
              COALESCE(lm.created_at, c.created_at) DESC`,
    [userId]
  );
  return r.rows.map((row) => {
    const { last_message_id, last_message_sender_id, last_message_type,
            last_message_text, last_message_at, ...rest } = row;
    return {
      ...rest,
      last_message: last_message_id
        ? {
            id: last_message_id,
            senderId: last_message_sender_id,
            type: last_message_type,
            text: last_message_text,
            createdAt: last_message_at,
          }
        : null,
    };
  });
};
```

- [ ] **Step 3: Restart server, exercise it**

Run: `npm run dev:server` in one terminal.
Then in another: `curl -s -H "Authorization: Bearer $MESSENGER_TEST_TOKEN" http://localhost:3001/api/chats | jq '.chats[0] | {id, last_message}'`.
Expected: each chat has a `last_message` object (or `null` for empty chats), no SQL errors.

- [ ] **Step 4: Commit**

```bash
git add server/services/db.js
git commit -m "feat(messenger/db): getChatsByUser returns last_message via LATERAL join"
```

---

### Task 1.3: Smoke verify for chat preview payload

**Files:**
- Create: `scripts/verifyMessengerChatPreview.mjs`
- Modify: `package.json` (add `verify:messenger-chat-preview` script and append to `verify:messenger-all`)

- [ ] **Step 1: Write the smoke script**

`scripts/verifyMessengerChatPreview.mjs`:
```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);

if (!TOKEN || !CHAT_ID) {
  console.log("set MESSENGER_TEST_TOKEN and SMOKE_CHAT_ID");
  process.exit(1);
}

const call = async (path) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const { status, data } = await call("/api/chats");
assert.equal(status, 200, "GET /api/chats should 200");
assert.ok(Array.isArray(data?.chats), "response.chats must be array");

const target = data.chats.find((c) => Number(c.id) === CHAT_ID);
assert.ok(target, `chat ${CHAT_ID} should be reachable`);
assert.ok("last_message" in target, "every chat row must include last_message");

if (target.last_message) {
  for (const key of ["id", "senderId", "type", "text", "createdAt"]) {
    assert.ok(key in target.last_message, `last_message.${key} required`);
  }
  assert.notEqual(target.last_message.type, "system",
    "system messages must not surface as last_message");
}

console.log("messenger chat preview ok");
```

- [ ] **Step 2: Wire into npm**

Edit `package.json` — inside `"scripts"`:
- add `"verify:messenger-chat-preview": "node scripts/verifyMessengerChatPreview.mjs",`
- in `"verify:messenger-all"`, append ` && npm run verify:messenger-chat-preview`.

- [ ] **Step 3: Run**

Run: `npm run verify:messenger-chat-preview`
Expected: `messenger chat preview ok` (requires dev server + env).

- [ ] **Step 4: Commit**

```bash
git add scripts/verifyMessengerChatPreview.mjs package.json
git commit -m "test(messenger): verify GET /chats returns last_message"
```

---

### Task 1.4: Client — render `last_message` in desktop chat list

**Files:**
- Modify: `src/components/MessengerChatList.jsx:55-72, 198-239`

- [ ] **Step 1: Read the current preview helpers**

Read `src/components/MessengerChatList.jsx:50-80` and the render block at `:198-240` so the replacement matches surrounding style and imports.

- [ ] **Step 2: Replace the preview source**

In `src/components/MessengerChatList.jsx`:
1. Add at the top of the file (with other imports):
   ```js
   import { formatChatListTime } from "../utils/chatTimeFormat";
   ```
2. Replace `getLastMessagePreview(lastMessage)` so it accepts `chat.last_message` and supports `voice`:
   ```js
   const getLastMessagePreview = (lastMessage) => {
     if (!lastMessage) return "Нет сообщений";
     if (lastMessage.type === "files_bundle") {
       const files = parseBundleFiles(lastMessage.text);
       if (files.length === 1) return files[0].mime?.startsWith("image/") ? "🖼 Фото" : `📎 ${files[0].name || "Файл"}`;
       return `📎 ${files.length} файлов`;
     }
     if (lastMessage.type === "image") return "🖼 Фото";
     if (lastMessage.type === "file") return "📎 Файл";
     if (lastMessage.type === "voice") {
       const meta = safeParseVoiceMeta(lastMessage.text);
       return meta?.duration ? `🎤 Голосовое ${fmtDuration(meta.duration)}` : "🎤 Голосовое";
     }
     const text = String(lastMessage.text || "");
     return text.length > 60 ? `${text.slice(0, 60)}…` : text;
   };

   function fmtDuration(sec) {
     const s = Math.max(0, Math.round(sec || 0));
     return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
   }

   function safeParseVoiceMeta(text) {
     try {
       const v = JSON.parse(text || "{}");
       return typeof v === "object" && v ? v : null;
     } catch { return null; }
   }
   ```
3. Inside the chat row render (around `:198`), replace
   ```js
   const lastMessage = chatMessages[chatMessages.length - 1];
   const source = chat._lastMsgAt || lastMessage?.created_at || chat.created_at;
   ```
   with
   ```js
   const lastMessage = chat.last_message;
   const source = chat._lastMsgAt || lastMessage?.createdAt || chat.created_at;
   ```
4. Replace the timestamp render (around `:229`) — change `fmtTime(lastMessage.created_at)` to `formatChatListTime(source)`.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev` and open the messenger. Expected: chat rows show real previews (no "Нет сообщений" on chats that actually have messages), and the timestamp uses `HH:MM` / weekday / date depending on age.

- [ ] **Step 4: Commit**

```bash
git add src/components/MessengerChatList.jsx
git commit -m "feat(messenger): render last_message in desktop chat list with smart timestamps"
```

---

### Task 1.5: Client — same change for mobile

**Files:**
- Modify: `src/mobile/MobileChatList.jsx:8, 175`

- [ ] **Step 1: Read current logic**

Read `src/mobile/MobileChatList.jsx:1-30` and `:160-200`.

- [ ] **Step 2: Apply the same swap**

In `src/mobile/MobileChatList.jsx`:
1. Add import: `import { formatChatListTime } from "../utils/chatTimeFormat";`
2. Rewrite `lastMessagePreview(message)` to mirror the desktop version (same branches: text / image / file / files_bundle / voice).
3. Replace the source: `const last = chat.last_message;` (instead of the previous derivation from `chatMessages`).
4. Replace timestamp render → `formatChatListTime(last?.createdAt || chat._lastMsgAt || chat.created_at)`.

- [ ] **Step 3: Smoke on mobile shell**

Run: `npm run dev` and open `/app/messenger` from a phone-sized viewport. Expected: previews and timestamps match desktop.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/MobileChatList.jsx
git commit -m "feat(messenger/mobile): render last_message in MobileChatList"
```

---

### Task 1.6: WS — update `chat.last_message` on new/deleted messages

**Files:**
- Modify: `src/context/MessengerContext.jsx:471-487` (cases `new_message`, `message_edited`, `message_deleted_*`)
- Modify: `server/routes/messenger.js` (DELETE `/chats/:chatId/messages/:messageId` and bulk-delete — emit refreshed `last_message`)
- Modify: `server/services/db.js` (export a helper `getLastMessageForChat(chatId, userId)` reused by routes)

- [ ] **Step 1: Add the helper**

In `server/services/db.js`, near `getChatsByUser`, add:
```js
const getLastMessageForChat = async (chatId, userId) => {
  const r = await pool.query(
    `SELECT m.id, m.sender_id AS "senderId", m.msg_type AS type, m.text, m.created_at AS "createdAt"
     FROM messages m
     WHERE m.chat_id = $1
       AND m.msg_type <> 'system'
       AND NOT EXISTS (
         SELECT 1 FROM message_hidden_for_users h
         WHERE h.message_id = m.id AND h.user_id = $2
       )
     ORDER BY m.id DESC
     LIMIT 1`,
    [chatId, userId]
  );
  return r.rows[0] ?? null;
};
```
Export it in the module exports block (`module.exports = { ... }`) near `getChatsByUser`.

- [ ] **Step 2: Server emits refreshed `last_message` on delete**

In `server/routes/messenger.js`, locate the `DELETE /chats/:chatId/messages/:messageId` handler (~line 524) and the bulk-delete handler (~line 675). After the existing `broadcastToChat(... { type: "message_deleted_all", ... })`, **for each unique target user**, compute a per-user `last_message` and **include it in the payload**.

Practical compromise: the broadcast does **not** know each recipient's hide list. Send a generic `lastMessage` derived with `userId = null` semantics — i.e., for `message_deleted_all` (which removes for everyone), compute `getLastMessageForChat(chatId, sender_id)` is the same for everyone since the message is gone for all. Send that single value. For `message_deleted_self` (hide-for-me), send a per-user event via `sendTo(userId, ...)` already in place, with `lastMessage` computed for that user.

Concretely, in the existing `broadcastToChat(chatId, { type: "message_deleted_all", chatId, messageId }, null)` call:
```js
const lastMessage = await getLastMessageForChat(chatId, /* userId */ null);
// last_message_hidden_for_users is irrelevant here because deletion is global
await broadcastToChat(chatId, {
  type: "message_deleted_all",
  chatId,
  messageId,
  lastMessage,
}, null);
```
(`getLastMessageForChat(chatId, null)` works — the `NOT EXISTS` clause evaluates against `user_id = NULL` and never matches, so no hide rows filter out.)

For `message_deleted_self`, in the existing `sendTo(userId, ...)` call:
```js
const lastMessage = await getLastMessageForChat(chatId, userId);
sendTo(userId, { type: "message_deleted_self", chatId, messageId, lastMessage });
```

Repeat the same change inside the bulk-delete handler (`/chats/:chatId/messages/bulk-delete`).

- [ ] **Step 3: Client applies updates**

In `src/context/MessengerContext.jsx` at the WS handler block (~line 471), patch the cases:

```js
case "new_message":
case "message_edited": {
  // existing code that appends/updates message...
  // ADD: refresh chat.last_message for non-system types
  if (data.message && data.message.msg_type !== "system") {
    setChats((prev) => prev.map((c) =>
      c.id === data.chatId
        ? {
            ...c,
            _lastMsgAt: data.message.created_at,
            last_message: {
              id: data.message.id,
              senderId: data.message.sender_id,
              type: data.message.msg_type,
              text: data.message.text,
              createdAt: data.message.created_at,
            },
          }
        : c
    ));
  }
  break;
}

case "message_deleted_all":
case "message_deleted_self": {
  // existing code that removes message locally...
  // ADD:
  if ("lastMessage" in data) {
    setChats((prev) => prev.map((c) =>
      c.id === data.chatId ? { ...c, last_message: data.lastMessage } : c
    ));
  }
  break;
}
```
(Match the exact `setChats` / state variable name used in the file — read `src/context/MessengerContext.jsx:100-150` first to confirm.)

- [ ] **Step 4: Manual round-trip**

Run dev, send a message in chat A from user X → user Y's chat list updates without refresh. Delete the last message → preview falls back to the previous message.

- [ ] **Step 5: Commit**

```bash
git add server/services/db.js server/routes/messenger.js src/context/MessengerContext.jsx
git commit -m "feat(messenger): update chat.last_message in realtime via WS"
```

---

## Phase 2 — Read Receipts UI

### Task 2.1: Pure util — `formatReadAt`

**Files:**
- Create: `src/utils/formatReadAt.js`
- Create: `scripts/verifyFormatReadAt.mjs`

- [ ] **Step 1: Write failing verify**

`scripts/verifyFormatReadAt.mjs`:
```js
import assert from "node:assert/strict";
import { formatReadAt } from "../src/utils/formatReadAt.js";

const now = new Date("2026-05-18T15:00:00+03:00");

assert.equal(formatReadAt("2026-05-18T07:50:00+03:00", now), "сегодня в 07:50");
assert.equal(formatReadAt("2026-05-17T22:15:00+03:00", now), "вчера в 22:15");
assert.equal(formatReadAt("2026-05-10T09:00:00+03:00", now), "10.05.2026 09:00");
assert.equal(formatReadAt(null, now), "");

console.log("formatReadAt ok");
```

- [ ] **Step 2: Run; expect fail**

Run: `node scripts/verifyFormatReadAt.mjs` → `Cannot find module ...`

- [ ] **Step 3: Implement**

`src/utils/formatReadAt.js`:
```js
const pad2 = (n) => String(n).padStart(2, "0");

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const yesterday = (now) => {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return y;
};

export function formatReadAt(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (sameDay(d, now)) return `сегодня в ${time}`;
  if (sameDay(d, yesterday(now))) return `вчера в ${time}`;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${time}`;
}
```

- [ ] **Step 4: Run; expect pass**

`node scripts/verifyFormatReadAt.mjs` → `formatReadAt ok`

- [ ] **Step 5: Commit**

```bash
git add src/utils/formatReadAt.js scripts/verifyFormatReadAt.mjs
git commit -m "feat(messenger): formatReadAt util for read-receipt timestamps"
```

---

### Task 2.2: Server — `getReadersForMessage` + endpoint

**Files:**
- Modify: `server/services/db.js` (add function, export it)
- Modify: `server/routes/messenger.js` (add GET endpoint between existing routes around line 870)

- [ ] **Step 1: Add the DB function**

In `server/services/db.js`, near the existing `getReceiptsByChat` (~line 1499), add:
```js
const getReadersForMessage = async (chatId, messageId) => {
  const r = await pool.query(
    `SELECT mr.user_id        AS "userId",
            u.username        AS name,
            u.avatar_url      AS avatar,
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
```
Add `getReadersForMessage` to the `module.exports` block.

- [ ] **Step 2: Add the route**

In `server/routes/messenger.js`, right after the existing `GET /chats/:chatId/pinned-for-me` (line ~882), add:
```js
router.get("/chats/:chatId/messages/:messageId/readers", requireAuth(), async (req, res) => {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!Number.isInteger(chatId) || !Number.isInteger(messageId)) {
      return res.status(400).json({ error: "Некорректный id" });
    }
    if (!(await requireParticipant(req, res, chatId))) return;

    const msg = await getMessageById(messageId);
    if (!msg || Number(msg.chat_id) !== chatId) {
      return res.status(404).json({ error: "Сообщение не найдено" });
    }
    if (Number(msg.sender_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Можно смотреть только свои сообщения" });
    }

    const readers = await getReadersForMessage(chatId, messageId);
    res.json({ readers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```
(`getMessageById` is already imported from `db.js` for other routes — verify the import at the top of the file and add it to the import list if missing. Same for `getReadersForMessage`.)

- [ ] **Step 3: Smoke**

Run: dev server + a chat with at least 2 readers on one of your messages. Then:
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/chats/$CHAT_ID/messages/$MSG_ID/readers | jq
```
Expected: `{ "readers": [ { "userId": ..., "name": "...", "avatar": "...", "readAt": "..." } ] }`. 403 if you query someone else's message; 404 for a message from another chat.

- [ ] **Step 4: Commit**

```bash
git add server/services/db.js server/routes/messenger.js
git commit -m "feat(messenger): GET /chats/:id/messages/:id/readers (own-message only)"
```

---

### Task 2.3: Verify script for readers endpoint

**Files:**
- Create: `scripts/verifyMessengerReaders.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

`scripts/verifyMessengerReaders.mjs`:
```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);
const OWN_MSG_ID = Number(process.env.SMOKE_OWN_MSG_ID);
const OTHER_MSG_ID = Number(process.env.SMOKE_OTHER_MSG_ID);

if (!TOKEN || !CHAT_ID || !OWN_MSG_ID || !OTHER_MSG_ID) {
  console.log("set MESSENGER_TEST_TOKEN, SMOKE_CHAT_ID, SMOKE_OWN_MSG_ID, SMOKE_OTHER_MSG_ID");
  process.exit(1);
}

const call = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// Own message → 200 + array
const ownRes = await call(`/api/chats/${CHAT_ID}/messages/${OWN_MSG_ID}/readers`);
assert.equal(ownRes.status, 200);
assert.ok(Array.isArray(ownRes.data?.readers));

// Other's message → 403
const otherRes = await call(`/api/chats/${CHAT_ID}/messages/${OTHER_MSG_ID}/readers`);
assert.equal(otherRes.status, 403);

// Bad id → 400
const badRes = await call(`/api/chats/${CHAT_ID}/messages/abc/readers`);
assert.equal(badRes.status, 400);

console.log("messenger readers ok");
```

- [ ] **Step 2: Wire into npm**

Add `"verify:messenger-readers": "node scripts/verifyMessengerReaders.mjs",` to `package.json` and append to `verify:messenger-all`.

- [ ] **Step 3: Run**

`npm run verify:messenger-readers` → `messenger readers ok`.

- [ ] **Step 4: Commit**

```bash
git add scripts/verifyMessengerReaders.mjs package.json
git commit -m "test(messenger): verify readers endpoint auth + payload"
```

---

### Task 2.4: Readers popover component

**Files:**
- Create: `src/components/MessengerReadersPopover.jsx`

- [ ] **Step 1: Implement**

`src/components/MessengerReadersPopover.jsx`:
```jsx
import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { formatReadAt } from "../utils/formatReadAt";

export default function MessengerReadersPopover({
  chatId, messageId, variant = "popover", onClose, anchorRect,
}) {
  const { $ } = useTheme();
  const { authFetch } = useAuth();
  const [state, setState] = useState({ status: "loading", readers: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(`/api/chats/${chatId}/messages/${messageId}/readers`);
        const data = await res.json();
        if (!alive) return;
        if (res.ok) setState({ status: "ok", readers: data.readers || [] });
        else setState({ status: "error", readers: [], error: data?.error });
      } catch (e) {
        if (alive) setState({ status: "error", readers: [], error: e.message });
      }
    })();
    return () => { alive = false; };
  }, [authFetch, chatId, messageId]);

  const wrapperStyle = variant === "sheet"
    ? {
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10000,
        background: $.bgC, borderTop: `1px solid ${$.brd}`,
        borderRadius: "16px 16px 0 0", padding: 12, maxHeight: "60vh", overflowY: "auto",
      }
    : {
        position: "fixed",
        top: Math.min((anchorRect?.top ?? 0), window.innerHeight - 360),
        left: Math.min((anchorRect?.right ?? 0) + 6, window.innerWidth - 280),
        width: 260, zIndex: 10000,
        background: $.bgC, border: `1px solid ${$.brd}`,
        borderRadius: 10, boxShadow: $.sh, padding: 8, maxHeight: 340, overflowY: "auto",
      };

  return (
    <div style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      {state.status === "loading" && <div style={{ padding: 8, color: $.txM, fontSize: 13 }}>Загрузка…</div>}
      {state.status === "error" && <div style={{ padding: 8, color: $.dn, fontSize: 13 }}>Не удалось загрузить</div>}
      {state.status === "ok" && state.readers.length === 0 && <div style={{ padding: 8, color: $.txM, fontSize: 13 }}>Никто ещё не прочитал</div>}
      {state.status === "ok" && state.readers.map((r) => (
        <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px" }}>
          <Avatar src={r.avatar} name={r.name} bg={$.acD} fg={$.ac} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: $.tx, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
            <div style={{ color: $.txM, fontSize: 11 }}>✓✓ {formatReadAt(r.readAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Avatar({ src, name, bg, fg }) {
  if (src) return <img src={src} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />;
  const initials = String(name || "?").split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
      {initials || "?"}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MessengerReadersPopover.jsx
git commit -m "feat(messenger): MessengerReadersPopover (popover + bottom-sheet variants)"
```

---

### Task 2.5: Context menu — "N просмотров" row (desktop)

**Files:**
- Modify: `src/components/MessengerContextMenu.jsx`
- Modify: `src/components/MessengerChatWindow.jsx` (pass new props when opening the menu)

- [ ] **Step 1: Extend the menu's API**

Replace `src/components/MessengerContextMenu.jsx` so it accepts `views`, `readers` preview, and a `onShowReaders` callback. Full file:

```jsx
import { useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function MessengerContextMenu({
  x, y,
  canEdit, canDeleteForAll, isPinnedForAll, isPinnedForMe,
  canPinForAll, canPinForMe,
  msgType,
  // NEW:
  isOwnMessage,        // boolean
  readersPreview,      // [{ userId, avatar, name }] — derived client-side, up to 3
  readersCount,        // number
  onShowReaders,       // (anchorRect) => void
  // existing:
  onReply, onForward, onEdit, onCopy,
  onPinForAll, onUnpinForAll,
  onPinForMe, onUnpinForMe,
  onDeleteSelf, onDeleteAll,
  onEnterSelection,
}) {
  const { $ } = useTheme();
  const rowRef = useRef(null);
  const top = Math.min(y, window.innerHeight - 360);
  const left = Math.min(x, window.innerWidth - 230);

  const itemStyle = { width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "inherit" };
  const isText = msgType === "text";

  const showViews = isOwnMessage && readersCount > 0;

  return (
    <div onClick={(e) => e.stopPropagation()}
         style={{ position: "fixed", top, left, width: 230, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, boxShadow: $.sh, zIndex: 9999, padding: 6 }}>
      {onReply && <button onClick={onReply} style={{ ...itemStyle, color: $.tx }}>Ответить</button>}
      {onForward && <button onClick={onForward} style={{ ...itemStyle, color: $.tx }}>Переслать</button>}
      {isPinnedForAll
        ? <button onClick={onUnpinForAll} style={{ ...itemStyle, color: $.tx }}>Открепить</button>
        : canPinForAll && <button onClick={onPinForAll} style={{ ...itemStyle, color: $.tx }}>Закрепить для всех</button>}
      {isPinnedForMe
        ? <button onClick={onUnpinForMe} style={{ ...itemStyle, color: $.tx }}>Убрать из своих закладок</button>
        : canPinForMe && <button onClick={onPinForMe} style={{ ...itemStyle, color: $.tx }}>Закрепить для себя</button>}
      {isText && onCopy && <button onClick={onCopy} style={{ ...itemStyle, color: $.tx }}>Копировать</button>}
      {canEdit && <button onClick={onEdit} style={{ ...itemStyle, color: $.tx }}>Редактировать</button>}
      {onEnterSelection && <button onClick={onEnterSelection} style={{ ...itemStyle, color: $.tx }}>Выбрать</button>}
      {onDeleteSelf && <button onClick={onDeleteSelf} style={{ ...itemStyle, color: $.tx }}>Удалить у себя</button>}
      {canDeleteForAll && <button onClick={onDeleteAll} style={{ ...itemStyle, color: $.dn }}>Удалить у всех</button>}

      {showViews && (
        <>
          <div style={{ height: 1, background: $.brd, margin: "6px 4px" }} />
          <button
            ref={rowRef}
            onMouseEnter={() => onShowReaders?.(rowRef.current?.getBoundingClientRect())}
            onClick={() => onShowReaders?.(rowRef.current?.getBoundingClientRect())}
            style={{ ...itemStyle, display: "flex", alignItems: "center", gap: 8, color: $.txS }}
          >
            <span style={{ color: $.ac, fontWeight: 600 }}>✓✓</span>
            <span style={{ flex: 1 }}>{readersCount} {pluralize(readersCount)}</span>
            <span style={{ display: "flex", marginRight: 4 }}>
              {readersPreview.slice(0, 3).map((r, i) => (
                <MiniAvatar key={r.userId} reader={r} offset={i} bg={$.acD} fg={$.ac} brd={$.bgC} />
              ))}
            </span>
            <span style={{ color: $.txM }}>›</span>
          </button>
        </>
      )}
    </div>
  );
}

function pluralize(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "просмотр";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "просмотра";
  return "просмотров";
}

function MiniAvatar({ reader, offset, bg, fg, brd }) {
  const initials = String(reader.name || "?").split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  const style = { width: 22, height: 22, borderRadius: "50%", marginLeft: offset === 0 ? 0 : -8, border: `2px solid ${brd}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color: fg, fontSize: 9, fontWeight: 700 };
  if (reader.avatar) return <img src={reader.avatar} alt="" style={{ ...style, padding: 0 }} />;
  return <div style={style}>{initials || "?"}</div>;
}
```

- [ ] **Step 2: Wire props from `MessengerChatWindow`**

In `src/components/MessengerChatWindow.jsx`, find the place where `MessengerContextMenu` is rendered. Compute and pass:
```jsx
const isOwn = Number(msg.sender_id) === Number(user.id);
const readersForMsg = (chat.receipts || [])
  .filter((rc) => rc.last_read_message_id >= msg.id && rc.user_id !== msg.sender_id)
  .map((rc) => {
    const p = (chat.participants || []).find((x) => x.user_id === rc.user_id);
    return { userId: rc.user_id, name: p?.username || `#${rc.user_id}`, avatar: p?.avatar_url || null };
  });

<MessengerContextMenu
  /* …existing props… */
  isOwnMessage={isOwn}
  readersPreview={readersForMsg}
  readersCount={readersForMsg.length}
  onShowReaders={(rect) => setReadersPopover({ messageId: msg.id, anchorRect: rect })}
/>
```
And render the popover when `readersPopover` is set:
```jsx
{readersPopover && (
  <MessengerReadersPopover
    chatId={chat.id}
    messageId={readersPopover.messageId}
    anchorRect={readersPopover.anchorRect}
    onClose={() => setReadersPopover(null)}
  />
)}
```
Add a click-outside handler that clears both `contextMenu` and `readersPopover`.

- [ ] **Step 3: Smoke**

Right-click your own message in a group chat where someone has read it → menu shows "N просмотров" + mini-avatars; hovering it reveals the popover with names and times.

- [ ] **Step 4: Commit**

```bash
git add src/components/MessengerContextMenu.jsx src/components/MessengerChatWindow.jsx
git commit -m "feat(messenger): N просмотров row in desktop context menu"
```

---

### Task 2.6: Mobile long-press — same row in bottom-sheet

**Files:**
- Modify: `src/mobile/MobileChatThread.jsx`

- [ ] **Step 1: Read the existing long-press menu**

Search for the long-press / action sheet block in `src/mobile/MobileChatThread.jsx` (look for `onLongPress`, `setActionSheet`, or similar).

- [ ] **Step 2: Add views row at the bottom of the action sheet**

Inside the long-press sheet JSX, append (only when `isOwnMessage && readersCount > 0`):
```jsx
<div style={{ height: 1, background: $.brd, margin: "8px 0" }} />
<button
  onClick={() => setReadersSheet({ messageId: msg.id })}
  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", background: "none", border: "none", color: $.txS, fontSize: 14 }}
>
  <span style={{ color: $.ac, fontWeight: 600 }}>✓✓</span>
  <span style={{ flex: 1, textAlign: "left" }}>{readersCount} {pluralize(readersCount)}</span>
  <AvatarStack readers={readersPreview} $={$} />
  <span style={{ color: $.txM }}>›</span>
</button>
```
(`pluralize`, `AvatarStack` — extract into a local helper file `src/mobile/_readersRow.jsx` or copy from desktop component; DRY by importing the shared helpers if you move them to `src/utils/readersFormatting.js`.)

Render `MessengerReadersPopover` with `variant="sheet"` when `readersSheet` is set.

- [ ] **Step 3: Smoke (mobile shell)**

Long-press your own message → action sheet ends with "N просмотров"; tap → second sheet slides up with the list.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/MobileChatThread.jsx
git commit -m "feat(messenger/mobile): N просмотров row in long-press action sheet"
```

---

## Phase 3 — Voice Messages

### Task 3.1: Pure util — `voiceWaveform`

**Files:**
- Create: `src/utils/voiceWaveform.js`
- Create: `scripts/verifyVoiceWaveform.mjs`

- [ ] **Step 1: Write failing verify**

`scripts/verifyVoiceWaveform.mjs`:
```js
import assert from "node:assert/strict";
import { resampleWaveform, packWaveform, unpackWaveform } from "../src/utils/voiceWaveform.js";

// 1 — identity-ish case: 32 input → 32 bars
const arr1 = Array.from({ length: 32 }, (_, i) => i * 8);
const r1 = resampleWaveform(arr1, 32);
assert.equal(r1.length, 32);
assert.equal(r1[0], 0);
assert.equal(r1[31], 31 * 8);

// 2 — downsample: many samples → 32 bars, peak preserved
const arr2 = Array.from({ length: 1024 }, (_, i) => (i === 500 ? 255 : 10));
const r2 = resampleWaveform(arr2, 32);
assert.equal(r2.length, 32);
assert.ok(r2.some((v) => v >= 200), "peak preserved when downsampling");

// 3 — upsample: fewer than bars
const r3 = resampleWaveform([10, 200, 10], 32);
assert.equal(r3.length, 32);

// 4 — pack/unpack round-trip
const u8 = new Uint8Array(32).map((_, i) => (i * 7) & 0xff);
const packed = packWaveform(u8);
assert.equal(typeof packed, "string");
const unpacked = unpackWaveform(packed);
assert.equal(unpacked.length, 32);
for (let i = 0; i < 32; i++) assert.equal(unpacked[i], u8[i]);

console.log("voiceWaveform ok");
```

- [ ] **Step 2: Run; expect fail**

`node scripts/verifyVoiceWaveform.mjs` → module not found.

- [ ] **Step 3: Implement**

`src/utils/voiceWaveform.js`:
```js
// Resample `samples` (number[]) into exactly `bars` peak values 0..255.
export function resampleWaveform(samples, bars = 32) {
  const out = new Uint8Array(bars);
  if (!samples || samples.length === 0) return out;
  if (samples.length === bars) {
    for (let i = 0; i < bars; i++) out[i] = clamp255(samples[i]);
    return out;
  }
  if (samples.length < bars) {
    // Upsample: nearest neighbour with peak hold.
    for (let i = 0; i < bars; i++) {
      const idx = Math.min(samples.length - 1, Math.floor((i / bars) * samples.length));
      out[i] = clamp255(samples[idx]);
    }
    return out;
  }
  // Downsample: take peak of each bucket.
  const bucket = samples.length / bars;
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.min(samples.length, Math.floor((i + 1) * bucket));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const v = clamp255(samples[j]);
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}

function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n || 0))); }

export function packWaveform(u8) {
  // base64 (browser btoa-compatible)
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  // node + browser both: Buffer | btoa
  if (typeof btoa === "function") return btoa(s);
  return Buffer.from(u8).toString("base64");
}

export function unpackWaveform(b64) {
  if (!b64) return new Uint8Array(0);
  if (typeof atob === "function") {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}
```

- [ ] **Step 4: Run; expect pass**

`node scripts/verifyVoiceWaveform.mjs` → `voiceWaveform ok`.

- [ ] **Step 5: Wire into npm + commit**

Add `"verify:voice-waveform": "node scripts/verifyVoiceWaveform.mjs",` to `package.json` and append to `verify:messenger-all`.

```bash
git add src/utils/voiceWaveform.js scripts/verifyVoiceWaveform.mjs package.json
git commit -m "feat(messenger): voiceWaveform util (resample, pack, unpack)"
```

---

### Task 3.2: `MessengerVoiceRecorder` component

**Files:**
- Create: `src/components/MessengerVoiceRecorder.jsx`

This is the largest single piece. The flow:

```
idle → (pointerdown on mic) → recording
   ↑                                ↓
 cancelled  ←──(release outside)────│
                                    ↓ (drag up past lock threshold)
                                  locked
                                    ↓ (Send / Cancel buttons)
                                  preview → sent
```

- [ ] **Step 1: Create the component**

`src/components/MessengerVoiceRecorder.jsx`:
```jsx
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { packWaveform, resampleWaveform } from "../utils/voiceWaveform";

const LOCK_PIXELS = 80;            // drag up to lock
const CANCEL_PIXELS_X = 120;       // mobile swipe-left distance
const WAVEFORM_BARS = 32;
const SAMPLE_INTERVAL_MS = 50;

export default function MessengerVoiceRecorder({ onSend, disabled }) {
  const { $ } = useTheme();
  const [state, setState] = useState("idle"); // idle | recording | locked | preview | error
  const [elapsed, setElapsed] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const samplesRef = useRef([]);
  const startTimeRef = useRef(0);
  const tickerRef = useRef(null);
  const sampleTimerRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const previewRef = useRef(null); // { blob, mime, duration, waveform: Uint8Array, url }

  const cleanup = () => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
    if (analyserRef.current) try { analyserRef.current.disconnect(); } catch {}
    if (audioCtxRef.current) try { audioCtxRef.current.close(); } catch {}
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    tickerRef.current = null;
    sampleTimerRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
  };

  useEffect(() => cleanup, []);

  const startRecording = async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mime = pickMime();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      chunksRef.current = [];
      samplesRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      recorder.start(250);

      // Waveform tap.
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.fftSize);

      sampleTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        // Convert 128-centered amplitude into peak distance.
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const d = Math.abs(buf[i] - 128);
          if (d > peak) peak = d;
        }
        samplesRef.current.push(peak * 2); // 0..255
      }, SAMPLE_INTERVAL_MS);

      startTimeRef.current = Date.now();
      setElapsed(0);
      tickerRef.current = setInterval(() => setElapsed((Date.now() - startTimeRef.current) / 1000), 100);

      setState("recording");
    } catch (e) {
      setErrorMsg(humanizeMicError(e));
      setState("error");
      cleanup();
    }
  };

  const stopAndPreview = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    const duration = Math.max(0, (Date.now() - startTimeRef.current) / 1000);
    const mime = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    const wave = resampleWaveform(samplesRef.current, WAVEFORM_BARS);
    cleanup();
    if (blob.size === 0) { setState("idle"); return; }
    const url = URL.createObjectURL(blob);
    previewRef.current = { blob, mime, duration, waveform: wave, url };
    setState("preview");
  };

  const cancel = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    cleanup();
    if (previewRef.current?.url) URL.revokeObjectURL(previewRef.current.url);
    previewRef.current = null;
    setState("idle");
    setElapsed(0);
    setDragY(0);
  };

  const send = async () => {
    const p = previewRef.current;
    if (!p) return;
    setState("idle");
    await onSend({
      blob: p.blob,
      mime: p.mime,
      duration: p.duration,
      waveformB64: packWaveform(p.waveform),
    });
    URL.revokeObjectURL(p.url);
    previewRef.current = null;
  };

  // Pointer handlers — desktop hold + drag-up-to-lock; mobile uses same since pointer events normalize.
  const onPointerDown = async (e) => {
    if (disabled || state !== "idle") return;
    e.preventDefault();
    await startRecording();
  };

  const onPointerMove = (e) => {
    if (state !== "recording") return;
    const dy = -(e.movementY || 0);
    setDragY((y) => Math.max(0, Math.min(LOCK_PIXELS, y + dy)));
    if (dragY + dy >= LOCK_PIXELS) setState("locked");
  };

  const onPointerUp = () => {
    if (state === "recording") stopAndPreview().then(() => {/* go to preview */});
    // locked → user uses Send/Cancel buttons
  };

  const onPointerLeave = () => {
    if (state === "recording") cancel();
  };

  // --- render ---

  if (state === "idle" || state === "error") {
    return (
      <button
        onPointerDown={onPointerDown}
        title={errorMsg || "Голосовое (зажмите)"}
        disabled={disabled}
        style={iconBtn($, disabled)}
        aria-label="Записать голосовое"
      >
        🎤
      </button>
    );
  }

  if (state === "recording") {
    return (
      <div onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave}
           style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", flex: 1 }}>
        <span style={{ color: $.dn, fontSize: 12 }}>● {fmtDuration(elapsed)}</span>
        <div style={{ flex: 1, color: $.txM, fontSize: 12, textAlign: "center" }}>
          ← Отпустить, чтобы отменить · ↑ Lock
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: $.ac,
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          transform: `translateY(-${dragY}px)`, transition: "transform 60ms linear",
          boxShadow: `0 0 0 ${4 + dragY/4}px ${$.acD}`,
        }}>🎤</div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", flex: 1 }}>
        <button onClick={cancel} style={{ ...iconBtn($), color: $.dn }}>🗑</button>
        <span style={{ color: $.dn, fontSize: 12 }}>● {fmtDuration(elapsed)}</span>
        <div style={{ flex: 1 }} />
        <button onClick={stopAndPreview} style={{ ...iconBtn($), background: $.ac, color: "#fff" }}>✓</button>
      </div>
    );
  }

  if (state === "preview") {
    const p = previewRef.current;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", flex: 1 }}>
        <button onClick={cancel} style={{ ...iconBtn($), color: $.dn }}>🗑</button>
        <audio ref={(el) => { if (el && p) el.src = p.url; }} controls preload="metadata"
               style={{ flex: 1, height: 32 }} />
        <span style={{ color: $.txM, fontSize: 12 }}>{fmtDuration(p.duration)}</span>
        <button onClick={send} style={{ ...iconBtn($), background: $.ac, color: "#fff" }}>→</button>
      </div>
    );
  }

  return null;
}

function pickMime() {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const m of cands) if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return "";
}

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function humanizeMicError(e) {
  if (e?.name === "NotAllowedError") return "Нет доступа к микрофону";
  if (e?.name === "NotFoundError") return "Микрофон не найден";
  return "Не удалось начать запись";
}

function iconBtn($, disabled = false) {
  return {
    width: 36, height: 36, borderRadius: 8, background: $.bgI, color: $.tx,
    border: `1px solid ${$.brd}`, cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    opacity: disabled ? 0.5 : 1, fontSize: 18,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MessengerVoiceRecorder.jsx
git commit -m "feat(messenger): MessengerVoiceRecorder (hold/lock/cancel)"
```

---

### Task 3.3: `MessengerVoiceBubble` component

**Files:**
- Create: `src/components/MessengerVoiceBubble.jsx`

- [ ] **Step 1: Implement**

`src/components/MessengerVoiceBubble.jsx`:
```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { unpackWaveform } from "../utils/voiceWaveform";

const BARS = 32;
const SPEEDS = [1, 1.5, 2];

export default function MessengerVoiceBubble({ chatId, message }) {
  const { $ } = useTheme();
  const { authFetch } = useAuth();
  const { decryptForChat } = useMessenger(); // exposed helper for AES-GCM decrypt of payloads/files
  const audioRef = useRef(null);
  const [meta, setMeta] = useState(null); // { duration, waveform: Uint8Array, fileId }
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Decrypt the small JSON payload.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await decryptForChat(chatId, message.text);
        const parsed = JSON.parse(json);
        if (!alive) return;
        setMeta({
          duration: Number(parsed.duration) || 0,
          waveform: unpackWaveform(parsed.waveform || ""),
          fileId: parsed.fileId,
        });
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [authFetch, chatId, decryptForChat, message.id, message.text]);

  const ensureAudio = async () => {
    if (audioUrl || !meta?.fileId || loadingAudio) return;
    setLoadingAudio(true);
    try {
      const res = await authFetch(`/api/chats/${chatId}/files/${meta.fileId}`);
      const encrypted = await res.arrayBuffer();
      const decrypted = await decryptForChat(chatId, encrypted, { binary: true });
      const blob = new Blob([decrypted], { type: "audio/webm" });
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingAudio(false);
    }
  };

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const togglePlay = async () => {
    await ensureAudio();
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.playbackRate = SPEEDS[speedIdx]; await el.play(); setPlaying(true); }
  };

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || !meta?.duration) return;
    setProgress(el.currentTime / meta.duration);
  };

  const onEnded = () => { setPlaying(false); setProgress(0); };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !meta?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * meta.duration;
    setProgress(pct);
  };

  const bars = useMemo(() => {
    if (!meta) return new Uint8Array(BARS);
    return meta.waveform.length === BARS ? meta.waveform : new Uint8Array(BARS);
  }, [meta]);

  if (error) return <div style={{ color: $.dn, fontSize: 12, padding: 4 }}>🎤 ошибка: {error}</div>;
  if (!meta)  return <div style={{ color: $.txM, fontSize: 12, padding: 4 }}>🎤 …</div>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", minWidth: 220 }}>
      <button onClick={togglePlay}
              style={{ width: 36, height: 36, borderRadius: "50%", background: $.ac, color: "#fff", border: "none", cursor: "pointer", fontSize: 14 }}>
        {playing ? "❚❚" : "▶"}
      </button>
      <svg width="160" height="28" viewBox="0 0 160 28" preserveAspectRatio="none"
           onClick={seek} style={{ cursor: "pointer", flex: 1 }}>
        {Array.from(bars).map((v, i) => {
          const h = Math.max(2, (v / 255) * 24);
          const active = i / BARS < progress;
          return (
            <rect key={i}
                  x={i * (160 / BARS) + 1}
                  y={(28 - h) / 2}
                  width={(160 / BARS) - 2}
                  height={h}
                  rx={1.5}
                  fill={active ? $.ac : $.txM} />
          );
        })}
      </svg>
      <span style={{ color: $.txM, fontSize: 11, minWidth: 34, textAlign: "right" }}>
        {fmt(meta.duration * (1 - progress))}
      </span>
      <button onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
              style={{ fontSize: 11, color: $.txS, background: "none", border: `1px solid ${$.brd}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer" }}>
        {SPEEDS[speedIdx]}x
      </button>
      <audio ref={audioRef} src={audioUrl || undefined} onTimeUpdate={onTimeUpdate} onEnded={onEnded} preload="none" />
      {loadingAudio && <span style={{ color: $.txM, fontSize: 10 }}>…</span>}
    </div>
  );
}

function fmt(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Confirm `decryptForChat` exists**

Read `src/context/MessengerContext.jsx` to find the actual decrypt API exposed by the context (search for `decrypt`, `decryptForChat`, or `decryptMessage`). If the exposed name differs, rename the call in this component to match. If a binary decrypt for files doesn't exist yet, follow the same path the existing image viewer uses (`MessengerImageViewer.jsx`) — copy that decrypt pattern for the audio blob.

- [ ] **Step 3: Commit**

```bash
git add src/components/MessengerVoiceBubble.jsx
git commit -m "feat(messenger): MessengerVoiceBubble (waveform player + speed)"
```

---

### Task 3.4: Server — validate voice payload

**Files:**
- Modify: `server/routes/messenger.js` (POST `/chats/:chatId/messages` at line ~400)

- [ ] **Step 1: Read the existing handler**

Read `server/routes/messenger.js:400-480` to see the existing `msg_type` whitelist and validation.

- [ ] **Step 2: Add `voice` to allowed types**

In the handler:
1. Add `"voice"` to the allowed `msg_type` set.
2. Add validation:
   ```js
   if (msg_type === "voice") {
     // text is the encrypted JSON payload — we just bound its size.
     if (typeof text !== "string" || text.length > 4096) {
       return res.status(400).json({ error: "voice payload too large" });
     }
   }
   ```
3. The `fileId → mime startsWith "audio/"` check is **left to the client** because the file row is referenced **inside** the encrypted payload (`text`). The server cannot inspect the fileId without decrypting. This is fine: a malicious client can already construct any encrypted payload it wants. Real protection is the chat-key gate.

- [ ] **Step 3: Same change for the WS `send` path**

In `server/services/ws.js`, locate the `case "send_message"` (around line 195) and apply the same type whitelist if it duplicates the validation.

- [ ] **Step 4: Commit**

```bash
git add server/routes/messenger.js server/services/ws.js
git commit -m "feat(messenger): accept msg_type=voice on POST and WS send"
```

---

### Task 3.5: Wire `MessengerVoiceBubble` into `MessageBubble`

**Files:**
- Modify: `src/components/MessageBubble.jsx`

- [ ] **Step 1: Branch on type**

Inside the body of `MessageBubble`, near the existing `isFile`/`isBundle` checks:
```jsx
import MessengerVoiceBubble from "./MessengerVoiceBubble";
// ...
const isVoice = msg.msg_type === "voice";
// inside the bubble body, BEFORE the text/file branches:
if (isVoice) return <MessengerVoiceBubble chatId={chatId} message={msg} />;
```
Match the existing surrounding bubble wrapper / reply-citation chrome — wrap the voice content the same way other media types are wrapped (read the file to see how `isFile` / `isBundle` flow into JSX).

- [ ] **Step 2: Smoke**

Hard to fully smoke yet without the recorder hooked up. We'll smoke E2E in Task 3.7.

- [ ] **Step 3: Commit**

```bash
git add src/components/MessageBubble.jsx
git commit -m "feat(messenger): render voice messages via MessengerVoiceBubble"
```

---

### Task 3.6: Mount recorder in `MessengerChatWindow` + `MobileChatThread`

**Files:**
- Modify: `src/components/MessengerChatWindow.jsx`
- Modify: `src/mobile/MobileChatThread.jsx`

- [ ] **Step 1: Add `handleSendVoice` to context surface**

In `src/context/MessengerContext.jsx`, alongside the existing `sendMessage`/`sendFile`, expose:
```js
const sendVoiceMessage = useCallback(async (chatId, { blob, mime, duration, waveformB64 }) => {
  // 1. Encrypt blob with chat key and upload via existing /files endpoint.
  const fileId = await uploadEncryptedFile(chatId, blob, mime); // existing helper used by sendFile
  // 2. Build payload, encrypt as message text, send.
  const payload = JSON.stringify({ fileId, duration, waveform: waveformB64 });
  await sendEncryptedMessage(chatId, payload, "voice"); // existing helper, mirroring sendMessage
}, [/* deps mirror sendFile */]);
```
Add `sendVoiceMessage` to the context value. **Verify** the names of the internal helpers (`uploadEncryptedFile`, `sendEncryptedMessage`) by grepping the file for the equivalents used by image/file sending; rename your call sites to match.

- [ ] **Step 2: Wire into desktop input bar**

In `src/components/MessengerChatWindow.jsx`, find the input bar (where the existing 📎 attach button lives). Add:
```jsx
import MessengerVoiceRecorder from "./MessengerVoiceRecorder";
// inside JSX, next to the attach button:
<MessengerVoiceRecorder
  disabled={!chat || !cryptoReady}
  onSend={(payload) => sendVoiceMessage(chat.id, payload)}
/>
```
When the recorder is in `recording`/`locked`/`preview` state it expands to fill the input row; for that, the recorder already returns full-flex JSX in those states. Hide or grey-out the text input and attach button while `recorder.state !== "idle"`. Simplest: lift recorder state up via a callback `onActiveChange(isActive)` and conditionally render the rest of the bar.

- [ ] **Step 3: Wire into mobile**

Same in `src/mobile/MobileChatThread.jsx`. Use pointer events (already normalized).

- [ ] **Step 4: Commit**

```bash
git add src/context/MessengerContext.jsx src/components/MessengerChatWindow.jsx src/mobile/MobileChatThread.jsx
git commit -m "feat(messenger): mount voice recorder in desktop + mobile composer"
```

---

### Task 3.7: E2E voice smoke verify

**Files:**
- Create: `scripts/verifyMessengerVoice.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

This one is the trickiest because real audio capture isn't possible from a Node smoke. We verify the **server-side accept path**: upload a tiny fake encrypted "audio" blob, then post a `voice` message that references it, then fetch back and validate the chat list preview.

`scripts/verifyMessengerVoice.mjs`:
```js
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const CHAT_ID = Number(process.env.SMOKE_CHAT_ID);

if (!TOKEN || !CHAT_ID) {
  console.log("set MESSENGER_TEST_TOKEN and SMOKE_CHAT_ID");
  process.exit(1);
}

const headers = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, ...extra });

// 1. Upload a fake file with audio mime.
const fakeBlob = new Blob([new Uint8Array(64)], { type: "audio/webm" });
const fd = new FormData();
fd.append("file", fakeBlob, "v.webm");
const up = await fetch(`${BASE}/api/chats/${CHAT_ID}/files`, { method: "POST", headers: headers(), body: fd });
assert.equal(up.status, 200, "upload should 200");
const { fileId } = await up.json();
assert.ok(fileId, "upload returns fileId");

// 2. Post a voice message referencing it (plaintext payload for smoke; in production it is AES-GCM ciphertext).
const payload = JSON.stringify({ fileId, duration: 12.5, waveform: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" });
const post = await fetch(`${BASE}/api/chats/${CHAT_ID}/messages`, {
  method: "POST",
  headers: headers({ "Content-Type": "application/json" }),
  body: JSON.stringify({ msg_type: "voice", text: payload }),
});
assert.equal(post.status, 200, "POST voice should 200");
const { message } = await post.json();
assert.equal(message.msg_type, "voice");

// 3. Oversize payload → 400.
const big = await fetch(`${BASE}/api/chats/${CHAT_ID}/messages`, {
  method: "POST",
  headers: headers({ "Content-Type": "application/json" }),
  body: JSON.stringify({ msg_type: "voice", text: "x".repeat(5000) }),
});
assert.equal(big.status, 400);

// 4. Chat list shows voice as last_message.
const chats = await (await fetch(`${BASE}/api/chats`, { headers: headers() })).json();
const target = chats.chats.find((c) => Number(c.id) === CHAT_ID);
assert.equal(target.last_message.type, "voice");
assert.equal(target.last_message.id, message.id);

console.log("messenger voice ok");
```

- [ ] **Step 2: Wire into npm**

Add `"verify:messenger-voice": "node scripts/verifyMessengerVoice.mjs",` and append to `verify:messenger-all`.

- [ ] **Step 3: Run**

`npm run verify:messenger-voice` → `messenger voice ok`.

- [ ] **Step 4: Commit**

```bash
git add scripts/verifyMessengerVoice.mjs package.json
git commit -m "test(messenger): voice round-trip smoke verify"
```

---

### Task 3.8: Push notification copy for voice

**Files:**
- Modify: `server/services/messengerPush.js`

- [ ] **Step 1: Find the body-building function**

Open `server/services/messengerPush.js`, search for the function that picks the push body based on `msg_type` (likely a switch with `"image" → "🖼 Фото"`, etc.).

- [ ] **Step 2: Add the branch**

```js
if (msgType === "voice") return "🎤 Голосовое сообщение";
```

- [ ] **Step 3: Commit**

```bash
git add server/services/messengerPush.js
git commit -m "feat(messenger/push): voice body copy"
```

---

## Phase Wrap-up

### Task W.1: Run the full verify suite

- [ ] **Step 1: Run**

```bash
npm run verify:messenger-all
```

Expected: every step in the chain prints its `... ok` line and exits 0. If any step fails, fix the actual bug — do not weaken the assertion.

- [ ] **Step 2: Manual matrix**

Open the messenger in Chrome desktop, Safari iOS (or iOS Simulator), and Firefox desktop. Walk through:
1. Chat list shows real previews and timestamps in all three time buckets (today / weekday / date).
2. Right-click your own message in a multi-user chat → "N просмотров" row → popover with names and `сегодня в HH:MM`.
3. Long-press the same message on mobile → action sheet → views row → bottom sheet.
4. Hold-to-record on desktop → drag up → lock → preview → send. Bubble shows waveform; play, scrub, change speed to 2x.
5. Send a voice from desktop → mobile shows it correctly without refresh.

- [ ] **Step 3: Commit**

If any small fixes fell out of manual smoke, commit them as `fix(messenger): ...` per area.

---

## Out of scope (do NOT do here)

- Telegram-style topics inside chats (Spec B).
- Voice "listened" indicator distinct from `✓✓`.
- Voice transcription.
- Per-message reactions.
- Auto-advance to next voice on playback end.
- Group-by-day separators in readers list.
- Hard duration cap on recordings.

---

## Self-Review Notes (for the implementer)

- **Spec §4 (preview):** covered by Tasks 1.1–1.6.
- **Spec §5 (receipts UI):** covered by Tasks 2.1–2.6. WS path reuses existing `receipts_update` (one explicit deviation, documented at the top of this plan).
- **Spec §6 (voice):** covered by Tasks 3.1–3.8.
- **Spec §7 (commit order):** mapped 1:1 to Phase numbering above.
- **Spec §8 (testing):** Node verify scripts substitute for unit tests (project has no jest/vitest); each pure util has a dedicated verify script.
- **Spec §9 (theming):** `$.ac` used for active waveform bars, recording pulse, "✓✓" accent in the views row. `$.txM` for inactive bars.
- **One unresolved detail at implementation time:** the exact name of the AES-GCM helpers exposed by `MessengerContext.jsx` (Task 3.3 step 2 and Task 3.6 step 1). Resolve by reading the file and matching whatever the existing image/file flow uses.
