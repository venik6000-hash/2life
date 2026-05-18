# Spec A — Messenger: Chat List Performance + Read Receipts UI + Voice Messages

**Date:** 2026-05-18
**Status:** Approved (design)
**Scope:** Three independent feature streams shipped together in one PR. Topics-as-threads (Telegram-style) is intentionally split into a separate Spec B.

---

## 1. Goals

1. **Chat list performance.** Every chat row shows the actual last message and a smart timestamp on first render, without lazy per-chat fetching. Eliminate the "Нет сообщений" placeholder caused by previews being derived from local `chatMessages[chat.length - 1]`.
2. **Per-message read receipts.** Right-click (desktop) or long-press (mobile) on your own message reveals a `✓✓ N просмотров` row with avatar stack; expanding it opens a Telegram-style list of readers with name + time. Updates in real time via WebSocket.
3. **Voice messages.** Hold-to-record with swipe-up-to-lock (TG parity), waveform visualization in the bubble, playback with scrubbing and 1x/1.5x/2x speed. Voice payload travels through the existing E2E pipeline.

## 2. Non-Goals (YAGNI)

- Auto-advance to next voice message on playback end.
- Voice-to-text transcription.
- Message reactions.
- Telegram-style "listened" indicator (separate read state per voice message).
- Day-grouped separators inside the readers list.
- Hard duration/size limit on voice (use whatever the browser + existing file upload allow).

## 3. Architecture

Three streams, no shared abstraction. Each can be reverted independently.

```
Spec A
├── Stream 1 — Chat List Preview (perf)
│    server: getChatsByUser SQL adds LATERAL join for last non-system, non-hidden message
│    client: list renders chat.last_message; new chatTimeFormat util
│
├── Stream 2 — Read Receipts UI
│    server: GET /chats/:id/messages/:mid/readers (own-message only)
│           WS read_receipt event from POST /chats/:id/read
│    client: context menu "N просмотров" row + MessengerReadersPopover
│
└── Stream 3 — Voice Messages
     server: validate msg_type='voice' payload, reuse existing /chats/:id/files upload
     client: MessengerVoiceRecorder (hold/lock/cancel), MessengerVoiceBubble (waveform player)
```

### New files

- `src/utils/chatTimeFormat.js` — `formatChatListTime(iso, now)`.
- `src/utils/formatReadAt.js` — `formatReadAt(iso)`.
- `src/utils/voiceWaveform.js` — record-time sampling + resample to 32 bars; offline fallback via `decodeAudioData`.
- `src/components/MessengerReadersPopover.jsx`.
- `src/components/MessengerVoiceRecorder.jsx`.
- `src/components/MessengerVoiceBubble.jsx`.
- Verify scripts: `verifyChatListPreview.js`, `verifyReadReceiptsBroadcast.js`, `verifyVoiceMessageRoundtrip.js` under `server/scripts/`.

### Modified files

- `server/services/db.js` — `getChatsByUser` (LATERAL), new `getReadersForMessage`.
- `server/routes/messenger.js` — readers endpoint; emit `read_receipt` in `POST /chats/:id/read`; validate voice payload.
- `server/services/ws.js` — pass-through for `read_receipt`.
- `server/services/messengerPush.js` — push body for voice.
- `src/context/MessengerContext.jsx` — consume `last_message` from `/chats` payload; handle `read_receipt`; update last_message on `new_message` / `message_deleted` WS events.
- `src/components/MessengerChatList.jsx`, `src/mobile/MobileChatList.jsx` — render from `chat.last_message`, use `chatTimeFormat`.
- `src/components/MessengerContextMenu.jsx` — bottom row with views count + popover trigger.
- `src/mobile/MobileChatThread.jsx` — same row in long-press bottom-sheet; integrate `MessengerVoiceRecorder`.
- `src/components/MessengerChatWindow.jsx` — integrate `MessengerVoiceRecorder` next to input.
- `src/components/MessageBubble.jsx` — branch on `msg_type === 'voice'` → `MessengerVoiceBubble`.

### Design principles

- Voice rides the **existing** E2E pipeline (AES-GCM with chat key). The blob uploads through `POST /api/chats/:chatId/files` (no server-side awareness that it is audio); the message payload (`text` field, encrypted) carries `{ fileId, duration, waveform }`. Server validates `msg_type='voice' ⇒ mime audio/*`.
- Read receipts schema is **unchanged**. `message_receipts` keeps the per-(chat, user) cursor `last_read_message_id`. "Readers of message N" is derived: `last_read_message_id >= N`.
- Chat list sort order is unchanged — `_lastMsgAt` already moves on any message including system ones; system messages bump sort but are excluded from preview text.

## 4. Stream 1 — Chat List Preview

### 4.1 Server

In `getChatsByUser(userId)`:

```sql
SELECT c.*,
       lm.id         AS last_message_id,
       lm.sender_id  AS last_message_sender_id,
       lm.msg_type   AS last_message_type,
       lm.text       AS last_message_text,   -- ciphertext, decrypted on client
       lm.created_at AS last_message_at
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
ORDER BY COALESCE(lm.created_at, c.created_at) DESC;
```

Add index if missing:
```sql
CREATE INDEX IF NOT EXISTS idx_messages_chat_id_id_desc ON messages(chat_id, id DESC);
```

`GET /api/chats` response includes `chat.last_message: { id, senderId, type, text, createdAt } | null`.

### 4.2 Client

`MessengerChatList.jsx` / `MobileChatList.jsx`:
- `getLastMessagePreview` consumes `chat.last_message` directly (no fallback to `chatMessages[length-1]`).
- Text is decrypted with the same helper used for thread messages; while the chat key is loading, show `🔒 …`.
- Voice preview: `🎤 Голосовое M:SS` (duration from decrypted payload).

`src/utils/chatTimeFormat.js`:

```js
// today                              → "HH:MM" (local)
// yesterday or within last 6 days    → "пн" | "вт" | "ср" | "чт" | "пт" | "сб" | "вс"
// older                              → "DD/MM/YYYY"
export function formatChatListTime(iso, now = new Date()) { /* ... */ }
```

"Today" boundary = local midnight. "Last week" boundary = the previous 6 calendar days (matches TG, day-7 rolls over to date).

### 4.3 Realtime update

`MessengerContext.jsx`:
- On WS `new_message`: update `chat.last_message` locally (no refetch).
- On WS `message_deleted`: the server emits `last_message` (the new latest non-system non-hidden message, or `null`) inside the existing `message_deleted` payload. Client replaces `chat.last_message` accordingly.

### 4.4 Edge cases

- Chat with zero non-system messages → `last_message: null` → row shows "Нет сообщений" with no timestamp.
- Encrypted preview text → render `🔒 …` until chat key is ready.
- Voice in preview uses cached decrypted payload from already-rendered messages if available, otherwise decrypts the small JSON payload synchronously.

## 5. Stream 2 — Read Receipts UI

### 5.1 Server

`db.js → getReadersForMessage(chatId, messageId)`:

```sql
SELECT mr.user_id, u.username AS name, u.avatar_url AS avatar, mr.read_at
FROM message_receipts mr
JOIN users u ON u.id = mr.user_id
WHERE mr.chat_id = $1
  AND mr.last_read_message_id >= $2
  AND mr.user_id <> (SELECT sender_id FROM messages WHERE id = $2)
ORDER BY mr.read_at ASC;
```

`GET /api/chats/:chatId/messages/:messageId/readers`:
- Auth → participant of chat.
- 403 if `sender_id !== req.user.id` (you can only see who read **your** messages — privacy).
- Response: `{ readers: [{ userId, name, avatar, readAt }] }`.

`POST /api/chats/:chatId/read` (existing): after `upsertReceipt(...)`:

```js
await broadcastToChat(chatId, {
  type: "read_receipt",
  chatId,
  userId: req.user.id,
  lastReadMessageId,
  readAt: new Date().toISOString(),
}, null);
```

### 5.2 Client

`MessengerContext.jsx`:
- Handler for `read_receipt` patches `receiptsByChat[chatId]` for the emitting user. `MessageBubble`'s `✓` → `✓✓` recomputation already keys on `receipts`, so bubbles update automatically.
- Open `MessengerReadersPopover` patches in real time: append new reader with subtle fade-in.

`MessengerContextMenu.jsx` (desktop right-click) — after the last item, a separator and:

```
✓✓  N просмотров      [avatar][avatar]   ›
```

`MobileChatThread.jsx` long-press bottom-sheet — same row at the bottom; tap opens a stacked bottom-sheet (`MessengerReadersPopover` in `variant="sheet"`).

`MessengerReadersPopover.jsx`:
- Loads `GET .../readers` on hover (desktop) / tap (mobile) — **not** on context menu open (avoid hammering API).
- Renders rows: avatar + name + `✓✓ formatReadAt(readAt)`.
- Active color (waveform-like accent for unread/transitions): `$.ac`.

Counter & avatar stack inside the context-menu row are computed **client-side** from the already-loaded `receipts[]` array on the chat (no network call): users where `last_read_message_id >= msg.id` and `userId !== sender`. Show up to 3 avatars.

`src/utils/formatReadAt.js`:
- today → "сегодня в HH:MM"
- yesterday → "вчера в HH:MM"
- older → "DD.MM.YYYY HH:MM"

### 5.3 Edge cases

- 1-on-1 chat: hide the views row entirely — `✓✓` under the bubble already conveys it.
- Zero readers: row is hidden.
- Other user's message: row is hidden.
- Reader leaves chat: keep them in the list if their receipt row still exists; if `chat_participants` row is gone, the JOIN with `users` still resolves (users table is the source of truth for name/avatar).

## 6. Stream 3 — Voice Messages

### 6.1 Recording UX

State machine: `idle → recording → (locked | preview | cancelled | sent)`.

**Desktop (`MessengerVoiceRecorder.jsx`):**
- 🎤 icon on the right side of the empty input.
- `mousedown` → start. Big pulsing circle (color `$.ac`) appears centered in the input bar; running timer on the left; `↑ Lock` hint on the right.
- Drag cursor up while holding → visual "lock" feedback; releasing keeps recording. Cancel and Send buttons appear.
- Release **outside** the mic button without locking → cancel, blob discarded.

**Mobile (`MobileChatThread.jsx` integration):**
- `touchstart` / `touchmove` / `touchend`. Swipe up → lock. Swipe left → cancel with trash animation.

**Preview before send (lock branch only):**
- After stop, preview bubble appears in input area: waveform (rendered from already-captured samples) + play/pause + duration + `[🗑]` `[Отправить]`.

### 6.2 Capture stack

- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })`.
- `MediaRecorder` with `audio/webm;codecs=opus`; fallback `audio/mp4` if unsupported.
- No hard size/duration limit imposed by us. The browser's own MediaRecorder limits and the existing `/chats/:chatId/files` upload size cap apply.
- mic-permission denied → toast with help text; 🎤 button disabled with tooltip.

### 6.3 Waveform (`src/utils/voiceWaveform.js`)

Live capture:
- Tap the same `MediaStream` with `AudioContext` + `AnalyserNode`.
- Sample `getByteTimeDomainData()` every ~50 ms; collect into a `Float32Array`.
- On stop: resample to **32 bars**, normalize 0..255, pack `Uint8Array(32)` → base64 (44 chars).
- Fallback path (if AudioContext unavailable mid-record): decode blob with `decodeAudioData` after stop and compute offline.

### 6.4 Send pipeline

1. Encrypt blob (AES-GCM with chat key) → upload via existing `POST /api/chats/:chatId/files` → `{ fileId }`.
2. Build payload `{ fileId, duration, waveform }`, JSON, encrypt as message `text` (same path as all messages).
3. Send via WS/REST with `msg_type: 'voice'`.

Server validation in `routes/messenger.js`:
- `msg_type === 'voice'` ⇒ referenced `chat_files.id` exists, mime starts with `audio/`, sender is uploader.
- Encrypted `text` payload size sanity-capped (e.g. ≤ 4 KB; the JSON is tiny).

### 6.5 Playback (`MessengerVoiceBubble.jsx`)

Layout:
```
[▶] ▁▃▆█▆▃▁▂▄▅▇▆▄▂▁▃▅▆▄▂▁▂▄▅▇▆▄▂▁▃▅  0:42   [1x]
```

- Waveform via SVG `<rect>` per bar.
- During playback, bars at `x < currentTime/duration * width` are filled with `$.ac`; the rest with `$.txM`.
- Tap on waveform → seek.
- Audio fetched lazily on first play: `GET /api/chats/:chatId/files/:fileId` → decrypt → `URL.createObjectURL` → `<audio>`. Blob cached in `messengerCache` while chat is open.
- Speed toggle 1x / 1.5x / 2x in the bubble's top-right.
- Loading state during fetch: a thin progress overlay on the waveform.

### 6.6 Preview & push

- Chat-list preview: `🎤 Голосовое M:SS`.
- Push notification (`messengerPush.js`): "🎤 Голосовое сообщение".

### 6.7 Edge cases

- Recording interrupted (incoming call, tab background): `MediaRecorder.onstop` fires; empty buffer ⇒ silent cancel.
- Tab backgrounded mid-record: keep going while the browser allows.
- Slow network for receiver: progress overlay on waveform until blob is decrypted.

## 7. Implementation order & commit plan

Each numbered item is intended as an atomic commit. Each phase ends with a passing verify script.

### Phase 1 — Chat list performance
1. `db.js`: `getChatsByUser` LATERAL join + index `idx_messages_chat_id_id_desc`.
2. `messenger.js`: `GET /chats` payload includes `last_message`; `message_deleted` payload includes new `last_message`.
3. `src/utils/chatTimeFormat.js`.
4. `MessengerChatList.jsx` + `MobileChatList.jsx`: render from `chat.last_message`.
5. `MessengerContext.jsx`: WS handlers update `chat.last_message`.
6. `server/scripts/verifyChatListPreview.js`.

### Phase 2 — Read receipts
7. `db.js`: `getReadersForMessage`.
8. `messenger.js`: `GET .../readers` endpoint (own-message-only); emit `read_receipt` in `POST .../read`.
9. `ws.js` + `MessengerContext.jsx`: pass through and patch `receiptsByChat`.
10. `src/utils/formatReadAt.js`.
11. `MessengerReadersPopover.jsx`.
12. `MessengerContextMenu.jsx`: views row + popover trigger.
13. `MobileChatThread.jsx`: views row + bottom-sheet variant.
14. `server/scripts/verifyReadReceiptsBroadcast.js`.

### Phase 3 — Voice messages
15. `src/utils/voiceWaveform.js`.
16. `MessengerVoiceRecorder.jsx`.
17. `MessengerVoiceBubble.jsx`.
18. `MessengerChatWindow.jsx`: integrate recorder.
19. `MobileChatThread.jsx`: integrate recorder.
20. `MessageBubble.jsx`: branch on `msg_type === 'voice'`.
21. `messenger.js`: voice payload validation.
22. Chat list preview for voice (`🎤 Голосовое M:SS`).
23. `messengerPush.js`: push body for voice.
24. `server/scripts/verifyVoiceMessageRoundtrip.js`.

## 8. Testing

- **Unit:** `chatTimeFormat`, `formatReadAt`, `voiceWaveform` resampling.
- **Integration:** the three verify scripts under `server/scripts/`, joined into the existing umbrella `npm` task.
- **Manual matrix:** Chrome + Safari (iOS) + Firefox for voice; Chrome + mobile shell for receipts UI.

## 9. Theming

Active waveform color and recording pulse use `$.ac` (`#22c997` dark / `#0f9b73` light). Inactive bars use `$.txM`.

## 10. Out of scope (deferred to Spec B or later)

- Chat topics (forum-style threads) — separate spec.
- Voice "listened" indicator distinct from regular `✓✓`.
- Reactions.
- Voice transcription.
