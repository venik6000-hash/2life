# Messenger Layer 1 — Denormalization & Sync Preview Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать список чатов корректно отражающим последнее сообщение в любой ситуации (включая reconnect после offline) и снять нагрузку с базы при росте до тысяч чатов/сообщений.

**Architecture:** Денормализовать «последнее сообщение» в таблицу `chats` (id/at/sender/type/encrypted_text), поддерживать её консистентной из приложения внутри транзакций insert/edit/delete/hide. Заменить `LATERAL` в `getChatsByUser` на одиночный JOIN с PK lookup + fallback per-user для скрытых сообщений. Расширить sync-события снапшотом `lastMessage`, чтобы клиент обновлял превью при replay, не только в live WebSocket.

**Tech Stack:** PostgreSQL (миграции через `migrate()` в `server/services/db.js`), Node.js (Express), React (`MessengerContext.jsx`), верификация через `node` smoke-скрипты в `scripts/verifyMessenger*.mjs`.

**Жёсткие требования (constraints):**
1. **Никакого мёртвого кода после рефакторинга.** Старые функции, ставшие ненужными, должны быть удалены. Старые SQL-паттерны (LATERAL для last message) полностью замещаются.
2. **Никаких новых UI-элементов.** Всё работает «под капотом». Ни одной новой кнопки «обновить», «синхронизировать», тоста или индикатора. Только внутренняя логика.
3. **Полное сохранение функционала.** Push-уведомления, голосовые, файлы, картинки, ответы, упоминания, пины, реакции, receipts, поиск, форвард, hide-for-self, delete-for-all, edit, system-сообщения, multi-device — всё должно работать как раньше. Регрессии = блокер.

**Out of scope (это слои 2 и 3, отдельные планы):**
- Монотонный `pts` per-user/per-chat и gap detection
- IndexedDB как source of truth с реактивными подписками
- Виртуализация списка сообщений
- Pagination самого списка чатов

---

## Pre-flight

- [x] **Подготовка:** убедиться, что dev-БД доступна и `npm run start` (или эквивалент) поднимает сервер. Принимаем как baseline: текущие smoke `node scripts/verifyMessengerChatPreview.mjs` проходят.

Run:
```bash
git status
git log --oneline -5
```
Expected: чистый рабочий каталог, последний коммит = `1dc4e56 feat: add periodic /app/uploads tar.gz backup`.

---

## File map (что и где трогаем)

| Файл | Что меняется |
|---|---|
| `server/services/db.js` | Миграция (новые колонки `chats.last_message_*` + индекс), новая функция `applyChatLastMessage`, переписанный `getChatsByUser`, врезка в `insertMessage`/`updateMessageContent`/`deleteMessageForAll`/`deleteMessagesForAllBulk`/`hideMessageForUser`/`hideMessagesForUserBulk` |
| `server/services/messengerStore.js` | Расширить `createSyncEvent` payload новым полем `lastMessage`, добавить helper `loadLastMessageSnapshot(chatId, userId)` |
| `server/routes/messenger.js` | Передавать `lastMessage` в `createSyncEvent` вместе с `messageId`; в `/messenger/sync` обогащать события снапшотом превью; в `chat-deleted-self` (hide) — пересчитывать |
| `server/services/ws.js` | Передавать `lastMessage` в `createSyncEvent` в обработчиках `send_message`, `edit_message`, `delete_message` |
| `src/context/MessengerContext.jsx` | В `replaySyncEvents` для `new_message`/`message_edited`/`message_deleted_all`/`message_deleted_self`/`messages_deleted_self_bulk` патчить `chat.last_message` и `_lastMsgAt` из payload |
| `scripts/verifyMessengerChatPreviewSync.mjs` (new) | Smoke: симулирует пропуск WS → проверяет что `/messenger/sync` отдаёт `lastMessage` и клиентский inverse-флоу работает (smoke только на ответ API) |
| `scripts/verifyMessengerChatListPerf.mjs` (new) | Бенчмарк: создаёт N чатов с M сообщений, замеряет p50/p95 `/api/chats`. Cap: smoke с N=20, чтобы не висел CI |
| `package.json` | Добавить два npm-скрипта для новых verify |

---

## Task 1: Schema — добавить денормализованные колонки и индекс

**Files:**
- Modify: `server/services/db.js` (в функции `migrate()`, после блока с `idx_chats_internal`)

- [x] **Step 1: Найти точку врезки миграции**

В `server/services/db.js` найти строку 443:
```js
try { await pool.query("CREATE INDEX IF NOT EXISTS idx_chats_internal ON chats(is_internal)"); } catch (_) {}
```

- [x] **Step 2: Добавить ALTER TABLE для пяти колонок и индекс**

Сразу после строки `idx_chats_internal` вставить:

```js
  // Denormalized last message snapshot on chats (Layer 1).
  // Maintained transactionally by applyChatLastMessage in insert/edit/delete/hide paths.
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_id INTEGER"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_at TIMESTAMPTZ"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_sender_id INTEGER"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_type TEXT"); } catch (_) {}
  try { await pool.query("ALTER TABLE chats ADD COLUMN last_message_encrypted_text TEXT"); } catch (_) {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC NULLS LAST)"); } catch (_) {}
```

- [x] **Step 3: Запустить сервер, убедиться что миграция прошла**

Run:
```bash
node -e "require('./server/services/db.js').migrate().then(() => { console.log('migrate ok'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); })"
```
Expected: `migrate ok`. Проверить вручную через psql:
```bash
psql "$DATABASE_URL" -c "\d chats" | grep last_message
```
Expected: видны 5 колонок `last_message_*`.

- [x] **Step 4: Commit**

```bash
git add server/services/db.js
git commit -m "feat(messenger): add denormalized last_message_* columns on chats"
```

---

## Task 2: Backfill — заполнить колонки из существующих сообщений

**Files:**
- Modify: `server/services/db.js` (в `migrate()`, сразу после Task 1)

- [x] **Step 1: Добавить idempotent backfill сразу после индекса**

После строки `CREATE INDEX IF NOT EXISTS idx_chats_last_message_at` вставить:

```js
  // One-time backfill for last_message_* (idempotent: only fills NULL rows).
  try {
    await pool.query(`
      UPDATE chats c
      SET last_message_id = lm.id,
          last_message_at = lm.created_at,
          last_message_sender_id = lm.sender_id,
          last_message_type = lm.msg_type,
          last_message_encrypted_text = lm.encrypted_text
      FROM (
        SELECT DISTINCT ON (chat_id) chat_id, id, created_at, sender_id, msg_type, encrypted_text
        FROM messages
        WHERE msg_type <> 'system' AND deleted_for_all = false
        ORDER BY chat_id, id DESC
      ) lm
      WHERE c.id = lm.chat_id AND c.last_message_id IS NULL
    `);
  } catch (_) {}
```

- [x] **Step 2: Прогнать миграцию ещё раз**

Run:
```bash
node -e "require('./server/services/db.js').migrate().then(() => process.exit(0))"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM chats WHERE last_message_id IS NOT NULL"
psql "$DATABASE_URL" -c "SELECT COUNT(DISTINCT chat_id) FROM messages WHERE msg_type <> 'system' AND deleted_for_all = false"
```
Expected: оба count'а одинаковы (или backfill count меньше на пустые чаты).

- [x] **Step 3: Commit**

```bash
git add server/services/db.js
git commit -m "feat(messenger): backfill last_message_* from existing messages"
```

---

## Task 3: Helper `applyChatLastMessage` — recompute и записать снапшот

**Files:**
- Modify: `server/services/db.js` (перед `insertMessage`, около строки 1212)

- [x] **Step 1: Добавить helper**

В `server/services/db.js` перед `const insertMessage = ...` вставить:

```js
// Recomputes the latest visible-to-everyone message for the chat
// and writes it to chats.last_message_*. Pass `client` to participate in caller's tx.
const applyChatLastMessage = async (executor, chatId) => {
  await executor.query(
    `UPDATE chats c
     SET last_message_id          = lm.id,
         last_message_at          = lm.created_at,
         last_message_sender_id   = lm.sender_id,
         last_message_type        = lm.msg_type,
         last_message_encrypted_text = lm.encrypted_text
     FROM (
       SELECT id, created_at, sender_id, msg_type, encrypted_text
       FROM messages
       WHERE chat_id = $1
         AND msg_type <> 'system'
         AND deleted_for_all = false
       ORDER BY id DESC
       LIMIT 1
     ) lm
     WHERE c.id = $1`,
    [chatId]
  );
  // Edge case: no visible messages left (all deleted_for_all or system-only)
  await executor.query(
    `UPDATE chats
     SET last_message_id = NULL,
         last_message_at = NULL,
         last_message_sender_id = NULL,
         last_message_type = NULL,
         last_message_encrypted_text = NULL
     WHERE id = $1
       AND NOT EXISTS (
         SELECT 1 FROM messages
         WHERE chat_id = $1
           AND msg_type <> 'system'
           AND deleted_for_all = false
       )`,
    [chatId]
  );
};
```

- [x] **Step 2: Экспортировать функцию**

В нижнем `module.exports` (около строки 1687-1700) добавить `applyChatLastMessage` в список:

```js
module.exports = {
  // ... existing exports ...
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser, getMessages,
  applyChatLastMessage,
  // ... rest ...
};
```
(Найти строку 1691 и добавить `applyChatLastMessage,` в той же строке после `getMessages,`.)

- [x] **Step 3: Smoke-проверить helper через ad-hoc node**

Run:
```bash
node -e "
const { pool, applyChatLastMessage } = require('./server/services/db.js');
(async () => {
  const r = await pool.query('SELECT id FROM chats LIMIT 1');
  if (!r.rows[0]) { console.log('no chats'); process.exit(0); }
  await applyChatLastMessage(pool, r.rows[0].id);
  const after = await pool.query('SELECT last_message_id, last_message_at FROM chats WHERE id = \$1', [r.rows[0].id]);
  console.log('helper ok', after.rows[0]);
  process.exit(0);
})();
"
```
Expected: `helper ok { last_message_id: <число или null>, last_message_at: ... }`.

- [x] **Step 4: Commit**

```bash
git add server/services/db.js
git commit -m "feat(messenger): add applyChatLastMessage helper"
```

---

## Task 4: Врезать helper в `insertMessage`

**Files:**
- Modify: `server/services/db.js` (функция `insertMessage`, строки ~1212-1257)

- [x] **Step 1: В транзакционной ветке (с client_message_id)**

Заменить блок строк 1234-1241:

```js
      const inserted = await client.query(
        `INSERT INTO messages (chat_id, sender_id, encrypted_text, encrypted_meta, msg_type, file_id, client_message_id, reply_to_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
        [chatId, senderId, encryptedText, encryptedMeta, msgType, fileId || null, safeClientMessageId, replyToMessageId || null]
      );
      await client.query("COMMIT");
      return { ...inserted.rows[0], __existing: false };
```

на:

```js
      const inserted = await client.query(
        `INSERT INTO messages (chat_id, sender_id, encrypted_text, encrypted_meta, msg_type, file_id, client_message_id, reply_to_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
        [chatId, senderId, encryptedText, encryptedMeta, msgType, fileId || null, safeClientMessageId, replyToMessageId || null]
      );
      if (msgType !== "system") {
        await applyChatLastMessage(client, chatId);
      }
      await client.query("COMMIT");
      return { ...inserted.rows[0], __existing: false };
```

- [x] **Step 2: В нетранзакционной ветке (без client_message_id)**

Заменить блок строк 1250-1256:

```js
  const r = await pool.query(
    `INSERT INTO messages (chat_id, sender_id, encrypted_text, encrypted_meta, msg_type, file_id, client_message_id, reply_to_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
    [chatId, senderId, encryptedText, encryptedMeta, msgType, fileId || null, safeClientMessageId, replyToMessageId || null]
  );
  return { ...r.rows[0], __existing: false };
```

на:

```js
  const r = await pool.query(
    `INSERT INTO messages (chat_id, sender_id, encrypted_text, encrypted_meta, msg_type, file_id, client_message_id, reply_to_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
    [chatId, senderId, encryptedText, encryptedMeta, msgType, fileId || null, safeClientMessageId, replyToMessageId || null]
  );
  if (msgType !== "system") {
    await applyChatLastMessage(pool, chatId);
  }
  return { ...r.rows[0], __existing: false };
```

- [x] **Step 3: Smoke — отправить сообщение и проверить колонки**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT id, last_message_id, last_message_at FROM chats ORDER BY last_message_at DESC NULLS LAST LIMIT 3"
```
Затем отправить тестовое сообщение через UI или существующий smoke (`node scripts/smokeMessengerStore.js` если работает), потом ещё раз:
```bash
psql "$DATABASE_URL" -c "SELECT id, last_message_id, last_message_at FROM chats ORDER BY last_message_at DESC NULLS LAST LIMIT 3"
```
Expected: для чата, в который ушло новое сообщение, `last_message_id` обновился, `last_message_at` — свежий timestamp.

- [x] **Step 4: Commit**

```bash
git add server/services/db.js
git commit -m "feat(messenger): maintain last_message_* on insertMessage"
```

---

## Task 5: Врезать helper в edit/delete/hide

**Files:**
- Modify: `server/services/db.js` (функции `updateMessageContent`, `deleteMessageForAll`, `deleteMessagesForAllBulk`, `hideMessageForUser`, `hideMessagesForUserBulk`)

- [x] **Step 1: `updateMessageContent`**

Заменить функцию целиком (строки 1272-1281):

```js
const updateMessageContent = async (chatId, messageId, encryptedText, encryptedMeta = "") => {
  const r = await pool.query(
    `UPDATE messages
     SET encrypted_text = $3, encrypted_meta = $4, edited_at = NOW()
     WHERE chat_id = $1 AND id = $2 AND deleted_for_all = false
     RETURNING *, encrypted_text AS ciphertext, encrypted_meta AS iv`,
    [chatId, messageId, encryptedText, encryptedMeta]
  );
  const row = r.rows[0] ?? null;
  if (row) {
    // If edited message is the chat's last message, refresh denormalized preview.
    await pool.query(
      `UPDATE chats SET last_message_encrypted_text = $2
       WHERE id = $1 AND last_message_id = $3`,
      [chatId, encryptedText, messageId]
    );
  }
  return row;
};
```

- [x] **Step 2: `deleteMessageForAll`**

Заменить функцию (строки 1283-1294):

```js
const deleteMessageForAll = async (chatId, messageId, deletedBy) => {
  const r = await pool.query(
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
    await applyChatLastMessage(pool, chatId);
  }
  return row;
};
```

- [x] **Step 3: `deleteMessagesForAllBulk`**

Заменить функцию (строки 1314-1325):

```js
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
  const deletedIds = r.rows.map((row) => row.id);
  if (deletedIds.length > 0) {
    await applyChatLastMessage(pool, chatId);
  }
  return deletedIds;
};
```

- [x] **Step 4: `hideMessageForUser` и `hideMessagesForUserBulk` — НЕ трогаем denormalization**

Hide-for-user — per-user операция, не меняет «глобального» last message. Per-user fallback делаем в `getChatsByUser` (Task 6). В этих функциях ничего не меняем.

- [x] **Step 5: Smoke — удалить сообщение, проверить откат last_message**

Через UI или вручную:
```bash
psql "$DATABASE_URL" -c "SELECT id, last_message_id FROM chats WHERE last_message_id IS NOT NULL LIMIT 1"
# скопировать chat_id и last_message_id, выполнить delete-for-all через UI или:
psql "$DATABASE_URL" -c "UPDATE messages SET deleted_for_all = true WHERE id = <last_message_id>"
# но это обходит applyChatLastMessage — лучше через UI/API
# после удаления:
psql "$DATABASE_URL" -c "SELECT last_message_id FROM chats WHERE id = <chat_id>"
```
Expected: `last_message_id` указывает на предыдущее сообщение или NULL если их не осталось.

- [x] **Step 6: Commit**

```bash
git add server/services/db.js
git commit -m "feat(messenger): maintain last_message_* on edit/delete paths"
```

---

## Task 6: Переписать `getChatsByUser` на денормализацию + per-user fallback

**Files:**
- Modify: `server/services/db.js` (функция `getChatsByUser`, строки 1015-1057)

- [x] **Step 1: Заменить функцию целиком**

```js
const getChatsByUser = async (userId) => {
  // Primary read uses denormalized columns. If user has hidden the chat's
  // last_message via message_hidden_for_users, lm.* comes back NULL and we
  // do a per-chat fallback below.
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

  // Chats where last_message exists globally but is hidden for this user
  // need a per-chat fallback to the next visible message.
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
```

- [x] **Step 2: Запустить существующий smoke `verifyMessengerChatPreview`**

Run:
```bash
MESSENGER_TEST_TOKEN=<token> SMOKE_CHAT_ID=<id> node scripts/verifyMessengerChatPreview.mjs
```
Expected: `messenger chat preview ok` (формат ответа не поменялся).

- [x] **Step 3: Замерить latency `/api/chats` до и после (одна и та же БД)**

Run (до коммита):
```bash
curl -w "\n%{time_total}s\n" -o /dev/null -s -H "Authorization: Bearer $MESSENGER_TEST_TOKEN" http://localhost:3001/api/chats
```
Expected: время не увеличилось vs baseline (если у тебя <100 чатов, разница будет мала; на тысячах — должно стать в разы быстрее).

- [x] **Step 4: Commit**

```bash
git add server/services/db.js
git commit -m "perf(messenger): replace LATERAL with denormalized read + per-user fallback"
```

---

## Task 7: Переписать `getLastMessageForChat` на денормализацию + расширить sync events

**Цель:** убрать дублирующий LATERAL-запрос в `getLastMessageForChat`, использовать денормализованные колонки. Эта функция уже вызывается из 4 мест после Task 5 (delete-self, delete-all, bulk delete), мы её переиспользуем для sync-events вместо создания новой `loadLastMessageSnapshot`. **Никаких новых функций — рефакторинг существующей.**

**Files:**
- Modify: `server/services/db.js` (функция `getLastMessageForChat`, строки 1059-1077)
- Modify: `server/routes/messenger.js` (4 вызова `createSyncEvent`)
- Modify: `server/services/ws.js` (3 вызова `createSyncEvent`)

- [x] **Step 1: Переписать `getLastMessageForChat` на чтение из колонок chats**

Заменить функцию в `server/services/db.js` (строки 1059-1077):

```js
const getLastMessageForChat = async (chatId, userId) => {
  // Read denormalized snapshot from chats row.
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

  // If caller asked for per-user view and current last message is hidden for them,
  // fall back to next visible message via single targeted query.
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
```

**Контракт функции не меняется:** возвращаемая форма та же, что и раньше. Все 4 существующих вызова (в `routes/messenger.js:547, 560, 704, 723`) продолжают работать без изменений. Это важно — иначе сломается логика delete-for-all/self уведомлений.

- [x] **Step 2: Прогнать существующие smoke на delete-функционал**

Если в проекте есть verify для удаления, прогнать. Иначе вручную: удалить сообщение через UI с scope=self и scope=all, проверить что `lastMessage` в response корректный.

Run (ручной):
- Отправить 2 сообщения в чат A.
- Удалить второе (последнее) с scope=self → в списке чатов превью должно показать первое.
- В другой вкладке (того же юзера или с другого аккаунта в том же чате) проверить, что у них всё ещё видно второе как последнее.
- Удалить второе с scope=all → у всех превью откатилось на первое.

Expected: все три сценария корректны (контракт `getLastMessageForChat` сохранён).

- [x] **Step 3: Добавить `lastMessage` в payload `new_message` через `getLastMessageForChat(chatId, null)`**

В `server/routes/messenger.js` найти строку 474:

```js
      await createSyncEvent(pool, { chatId, eventType: "new_message", payload: { messageId: saved.id } });
```

Заменить на:

```js
      const lastMessage = await getLastMessageForChat(chatId, null);
      await createSyncEvent(pool, {
        chatId,
        eventType: "new_message",
        payload: { messageId: saved.id, lastMessage },
      });
```

Аналогично для строки 786 (forward):

```js
      const lastMessage = await getLastMessageForChat(targetChatId, null);
      await createSyncEvent(pool, {
        chatId: targetChatId,
        eventType: "new_message",
        payload: { messageId: saved.id, lastMessage },
      });
```

`getLastMessageForChat` уже импортирован в этом файле (строка 10) — никаких новых импортов.

- [x] **Step 4: Добавить `lastMessage` в `message_edited` / `message_deleted_all` sync events**

В `server/routes/messenger.js` найти оставшиеся `createSyncEvent`:

```bash
grep -n "createSyncEvent" server/routes/messenger.js
```

Для строки 558 (delete-all):

```js
      const lastMessage = await getLastMessageForChat(chatId, null);
      await createSyncEvent(pool, {
        chatId,
        eventType: "message_deleted_all",
        payload: { messageId, userId: req.user.id, lastMessage },
      });
```

⚠️ В этом же handler строка 560 уже вычисляет `lastMessage` для WS broadcast. Используем **одну** переменную, не считаем дважды. То есть переупорядочить:

```js
      const deleted = await deleteMessageForAll(chatId, messageId, req.user.id);
      if (!deleted) return res.status(404).json({ error: "Сообщение не найдено" });
      const lastMessage = await getLastMessageForChat(chatId, null);
      await createSyncEvent(pool, { chatId, eventType: "message_deleted_all", payload: { messageId, userId: req.user.id, lastMessage } });

      const payload = { type: "message_deleted_all", chatId, messageId, userId: req.user.id, lastMessage };
      await broadcastToChat(chatId, payload, null);
      sendTo(req.user.id, payload);
      return res.json({ ok: true, scope: "all" });
```

Аналогично для других eventType из {`message_edited`, `messages_deleted_self_bulk`} — добавить `lastMessage: await getLastMessageForChat(chatId, null)` в payload (если уже не вычислен поблизости — переиспользовать).

Для `message_deleted_self`: payload содержит `userId`, и `lastMessage` уже передаётся в WS (строка 548) — добавить такой же в createSyncEvent (если был).

- [x] **Step 5: Аналогично в `server/services/ws.js`**

```bash
grep -n "createSyncEvent" server/services/ws.js
```

Импорт `getLastMessageForChat` в ws.js: проверить — если нет, дописать в существующий require:

```js
const {
  insertMessage, getMessageById, updateMessageContent, deleteMessageForAll, hideMessageForUser,
  getLastMessageForChat,
  // ...
} = require("./db");
```

Для каждого `createSyncEvent` с eventType из {`new_message`, `message_edited`, `message_deleted_all`}: добавить `lastMessage`. Пример (строка ~205):

```js
        const lastMessage = await getLastMessageForChat(chatId, null);
        await createSyncEvent(pool, {
          chatId,
          eventType: "new_message",
          payload: { messageId: saved.id, lastMessage },
        });
```

Для остальных типов sync_event (pin/unpin, receipts, participants) — НЕ добавляем lastMessage. Они не влияют на превью.

- [x] **Step 6: Smoke — отправить сообщение, прочитать sync event payload**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT id, event_type, payload FROM messenger_sync_events ORDER BY id DESC LIMIT 3"
```
Expected: для записи с `event_type='new_message'` JSON содержит ключ `lastMessage` с полями `id`, `senderId`, `type`, `text`, `createdAt`.

- [x] **Step 7: Commit**

```bash
git add server/services/db.js server/routes/messenger.js server/services/ws.js
git commit -m "refactor(messenger): denormalize getLastMessageForChat; embed snapshot in sync events"
```

---

## Task 8: Клиент — `replaySyncEvents` патчит `chat.last_message`

**Files:**
- Modify: `src/context/MessengerContext.jsx` (функция `replaySyncEvents`, строки 992-1043)

- [x] **Step 1: Расширить обработку `new_message`/`message_edited`**

Найти строки 998-1002:
```js
        case "new_message":
        case "message_edited":
          if (chatId) refreshMessages.add(chatId);
          break;
```

Заменить на:
```js
        case "new_message":
        case "message_edited":
          if (chatId) refreshMessages.add(chatId);
          if (chatId && payload.lastMessage) {
            setChats((prev) => prev.map((chat) => (
              chat.id === chatId
                ? {
                    ...chat,
                    _lastMsgAt: payload.lastMessage.createdAt,
                    last_message: payload.lastMessage,
                  }
                : chat
            )));
          }
          break;
```

- [x] **Step 2: Расширить обработку delete-вариантов**

Найти строки 1003-1006:
```js
        case "message_deleted_all":
        case "message_deleted_self":
          if (chatId && payload.messageId) removeMessage(chatId, payload.messageId);
          break;
```

Заменить на:
```js
        case "message_deleted_all":
        case "message_deleted_self":
          if (chatId && payload.messageId) removeMessage(chatId, payload.messageId);
          if (chatId && "lastMessage" in payload) {
            setChats((prev) => prev.map((chat) => (
              chat.id === chatId
                ? {
                    ...chat,
                    _lastMsgAt: payload.lastMessage?.createdAt || null,
                    last_message: payload.lastMessage,
                  }
                : chat
            )));
          }
          break;
```

- [x] **Step 3: Убедиться что `replaySyncEvents` имеет доступ к `setChats`**

В замыкании коллбэка проверить, что `setChats` есть в области видимости. Поскольку `replaySyncEvents` — `useCallback` определён в том же компоненте, что и `setChats`, доступ есть автоматически. Добавить `setChats` в массив зависимостей `useCallback` на строке 1043:

```js
  }, [clearRemovedChatLocalState, fetchChatById, loadMessages, loadPinnedForAll, loadPinnedForMe, patchMessage, removeMessage, setChats, user?.id]);
```

(добавить `setChats,` в существующий список)

- [x] **Step 4: Smoke — ручной тест в браузере**

1. Открыть приложение, авторизоваться.
2. С другого устройства/вкладки отправить сообщение в чат, который виден в списке у первой вкладки.
3. На первой вкладке: открыть DevTools → Network → WS → найти соединение и **поставить его на pause** (или дёрнуть оффлайн в эмуляции).
4. Со второго устройства отправить ещё одно сообщение.
5. На первой вкладке: убрать pause / включить онлайн.
6. Превью в списке чатов должно обновиться на последнее сообщение **без клика по чату**.

Expected: превью fresh.

- [x] **Step 5: Commit**

```bash
git add src/context/MessengerContext.jsx
git commit -m "fix(messenger): apply lastMessage snapshot during sync replay"
```

---

## Task 9: Verify-скрипт `verifyMessengerChatListPerf.mjs`

**Files:**
- Create: `scripts/verifyMessengerChatListPerf.mjs`
- Modify: `package.json` (один npm-скрипт)

- [x] **Step 1: Создать файл**

```js
// scripts/verifyMessengerChatListPerf.mjs
// Smoke: измеряет латентность GET /api/chats и проверяет что денормализация работает.
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;
const MAX_MS = Number(process.env.CHAT_LIST_MAX_MS || 250);

if (!TOKEN) {
  console.log("set MESSENGER_TEST_TOKEN");
  process.exit(1);
}

const samples = 5;
const timings = [];

for (let i = 0; i < samples; i++) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/chats`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const t1 = performance.now();
  assert.equal(res.status, 200, "GET /api/chats should 200");
  const body = await res.json();
  assert.ok(Array.isArray(body?.chats), "response.chats must be array");
  timings.push(t1 - t0);
}

timings.sort((a, b) => a - b);
const p50 = timings[Math.floor(samples / 2)];
const p95 = timings[Math.floor(samples * 0.95)] ?? timings[samples - 1];

console.log(`chat list: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms (n=${samples})`);
assert.ok(p95 < MAX_MS, `p95 ${p95.toFixed(1)}ms exceeds threshold ${MAX_MS}ms`);
console.log("messenger chat list perf ok");
```

- [x] **Step 2: Добавить npm-скрипт**

В `package.json`, в `"scripts"`, после `"verify:messenger-chat-preview"`:

```json
    "verify:messenger-chat-list-perf": "node scripts/verifyMessengerChatListPerf.mjs",
```

- [x] **Step 3: Запустить**

```bash
MESSENGER_TEST_TOKEN=<token> npm run verify:messenger-chat-list-perf
```
Expected: `messenger chat list perf ok` с p95 < 250ms на dev-данных.

- [x] **Step 4: Commit**

```bash
git add scripts/verifyMessengerChatListPerf.mjs package.json
git commit -m "test(messenger): add chat list perf verify script"
```

---

## Task 10: Verify-скрипт `verifyMessengerChatPreviewSync.mjs`

**Files:**
- Create: `scripts/verifyMessengerChatPreviewSync.mjs`
- Modify: `package.json`

- [x] **Step 1: Создать файл**

```js
// scripts/verifyMessengerChatPreviewSync.mjs
// Smoke: проверяет что /messenger/sync возвращает events с lastMessage payload
// для new_message — это нужно для клиентского replaySyncEvents.
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.MESSENGER_TEST_TOKEN;

if (!TOKEN) {
  console.log("set MESSENGER_TEST_TOKEN");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}` };

// 1. Получить текущий cursor (sync с after=0 чтобы взять последний id)
const initial = await fetch(`${BASE}/api/messenger/sync?after=0`, { headers: auth });
assert.equal(initial.status, 200);
const initialBody = await initial.json();
const cursor = Number(initialBody.cursor || 0);

// 2. Найти чат для теста
const chatsRes = await fetch(`${BASE}/api/chats`, { headers: auth });
const chatsBody = await chatsRes.json();
const chat = (chatsBody.chats || []).find((c) => c.role_in_chat);
assert.ok(chat, "need at least one chat to test");

// 3. Отправить тестовое сообщение через REST (если есть такой роут) или через WS — здесь skip,
// инструкция: ручной шаг. Для автоматики использовать существующий smokeMessengerStore.
console.log(`baseline cursor=${cursor}, chat=${chat.id}`);
console.log("send a message to this chat now, then press enter");
process.stdin.once("data", async () => {
  const after = await fetch(`${BASE}/api/messenger/sync?after=${cursor}`, { headers: auth });
  const afterBody = await after.json();
  const newMsgEvent = (afterBody.events || []).find(
    (e) => e.event_type === "new_message" && Number(e.chat_id) === Number(chat.id)
  );
  assert.ok(newMsgEvent, "expected new_message event in sync after sending message");
  const payload = typeof newMsgEvent.payload === "string"
    ? JSON.parse(newMsgEvent.payload) : newMsgEvent.payload;
  assert.ok(payload?.lastMessage, "new_message payload must include lastMessage");
  for (const key of ["id", "senderId", "type", "text", "createdAt"]) {
    assert.ok(key in payload.lastMessage, `lastMessage.${key} required`);
  }
  console.log("messenger chat preview sync ok");
  process.exit(0);
});
```

- [x] **Step 2: Добавить npm-скрипт в `package.json`**

```json
    "verify:messenger-chat-preview-sync": "node scripts/verifyMessengerChatPreviewSync.mjs",
```

- [x] **Step 3: Запустить интерактивно**

```bash
MESSENGER_TEST_TOKEN=<token> npm run verify:messenger-chat-preview-sync
# скрипт ждёт enter; пока он ждёт — отправить сообщение в указанный чат через UI; нажать enter
```
Expected: `messenger chat preview sync ok`.

- [x] **Step 4: Commit**

```bash
git add scripts/verifyMessengerChatPreviewSync.mjs package.json
git commit -m "test(messenger): add sync-replay preview verify script"
```

---

## Task 11: Полный регрессионный чеклист — все фичи работают

**Files:** ничего не редактируем, только проверяем.

Это критичный шаг. Constraint: «функционал не должен пострадать». Каждый пункт — это сценарий из реальной жизни мессенджера. Если хоть один не работает — фикс перед мержем.

- [ ] **Step 1: Прогнать все существующие messenger verify-скрипты**

```bash
MESSENGER_TEST_TOKEN=<token> SMOKE_CHAT_ID=<id> npm run verify:messenger-chat-preview
MESSENGER_TEST_TOKEN=<token> npm run verify:messenger-chat-list-perf
ls scripts/verifyMessenger* | xargs -n1 echo
# прогнать все, которые применимы без специальных env vars
```
Expected: все verify скрипты, которые шли зелёными до плана, идут зелёными после.

- [ ] **Step 2: Текстовые сообщения**

1. Отправить текстовое сообщение → появилось в чате, появилось в превью списка.
2. С другого аккаунта/устройства — то же, превью у получателя обновилось без обновления страницы.

Expected: работает мгновенно через WS, превью свежее.

- [ ] **Step 3: Голосовые сообщения**

1. Записать и отправить голосовое (msg_type='voice').
2. В списке чатов превью показывает иконку голосового / надпись «Голосовое сообщение» (как раньше).
3. У получателя — то же.

Expected: voice сообщение становится last_message; превью корректное.

- [ ] **Step 4: Файлы и изображения**

1. Прикрепить и отправить файл (msg_type='file') → превью показывает имя файла / иконку как раньше.
2. То же для картинки (msg_type='image').
3. Удалить файл из сообщения — поведение как раньше (если такое было).

Expected: file/image сообщения участвуют в last_message; UI неизменный.

- [ ] **Step 5: Push-уведомления**

1. С устройства A отправить сообщение пользователю B (который не онлайн в этой вкладке).
2. У B приходит push (если у него зарегистрирован device).
3. Содержимое push неизменное (заголовок, тело).

Expected: pushes работают как раньше. Логика `sendPrivateMessagePush` не затронута планом.

- [ ] **Step 6: Reply и mentions**

1. Ответить на сообщение (reply_to_message_id) → reply отображается, превью в списке показывает текст reply.
2. Упомянуть юзера через @ — mention сохраняется в meta.

Expected: reply и mentions работают; они входят в last_message текст как раньше.

- [ ] **Step 7: Pinned messages**

1. Закрепить сообщение → отображается в шапке чата.
2. Открепить → исчезает.
3. Закрепление НЕ должно влиять на превью в списке чатов (это отдельная сущность).

Expected: пины работают независимо.

- [ ] **Step 8: Edit (редактирование)**

1. Отправить текстовое сообщение → оно становится последним, превью показывает оригинал.
2. Отредактировать его → превью в списке обновляется на новый текст (важно: только если это **последнее** сообщение чата).
3. Отредактировать НЕ последнее сообщение → превью списка НЕ меняется.

Expected: Task 5 Step 1 правильно патчит `last_message_encrypted_text` только когда отредактированное = последнее.

- [ ] **Step 9: Delete-for-all (удаление для всех)**

1. Удалить своё последнее сообщение для всех → у всех в списке чатов превью откатилось на предыдущее.
2. Удалить НЕ последнее сообщение для всех → превью не меняется (там был не оно).

Expected: `applyChatLastMessage` правильно пересчитывает.

- [ ] **Step 10: Delete-for-self (удаление только у себя)**

1. Скрыть последнее сообщение только у себя → у себя в превью списка показывается предыдущее видимое сообщение.
2. У других участников чата превью НЕ изменилось.

Expected: per-user fallback в Task 6 работает.

- [ ] **Step 11: Bulk delete**

1. Удалить пачку сообщений через bulk-эндпоинт (если есть UI или через API) → превью корректно откатывается.

Expected: `deleteMessagesForAllBulk` дёргает `applyChatLastMessage` (Task 5 Step 3).

- [ ] **Step 12: Forward (пересылка)**

1. Переслать сообщение в другой чат → в чате-получателе превью обновилось на пересланное.

Expected: route `/messenger/forward` (или эквивалент) использует `insertMessage`, который теперь обновляет last_message.

- [ ] **Step 13: System-сообщения не ломают превью**

1. Создать ситуацию, которая порождает system-сообщение (новый участник, изменение названия чата и т.п.).
2. System-сообщение появляется в ленте чата, но **НЕ становится** last_message в превью списка.

Expected: `if (msgType !== "system")` в Task 4 защищает.

- [ ] **Step 14: Receipts (прочитано/доставлено)**

1. Прочитать сообщение → у отправителя статус обновился.
2. Не должно влиять на last_message.

Expected: receipts путь не задет.

- [ ] **Step 15: Multi-device sync**

1. Залогиниться с двух устройств одновременно.
2. Отправить сообщение с устройства A → на устройстве B превью обновилось (через WS).
3. Закрыть WS на устройстве B на 10 секунд (DevTools → Network → offline).
4. Отправить сообщение с A.
5. Включить online на B → превью обновилось без необходимости открывать чат.

Expected: **это основной сценарий, ради которого пишем слой 1.** Должен работать.

- [ ] **Step 16: Sync после длительного оффлайна**

1. Залогиниться, увидеть список чатов.
2. Закрыть вкладку.
3. Через 5 минут открыть заново — клиент дернет `/messenger/sync` с курсором.
4. Превью в списке отражает все сообщения, прилетевшие за это время.

Expected: replay сработал, новый payload с `lastMessage` использован.

- [ ] **Step 17: Создание нового чата**

1. Создать новый пустой чат → в списке появился, превью пустое.
2. Отправить первое сообщение → превью появилось.

Expected: chats с NULL `last_message_at` корректно сортируются по `created_at` (см. SQL в Task 6).

- [ ] **Step 18: Reset / reset-account (если такая фича есть)**

```bash
grep -rn "messengerReset" server/services | head -5
```
Если есть такой сервис — проверить, что он не упирается в новые колонки (вероятно, очищает messages — applyChatLastMessage сам подтянет NULL).

Expected: сброс работает без ошибок в БД.

- [x] **Step 19: Дописать строку в `CHANGELOG_ONE_LINE.md`**

Прочитать первые 5 строк файла, повторить стиль. Добавить:

```
feat: denormalize last_message on chats; sync replay updates preview on reconnect
```

- [x] **Step 20: Commit финал**

```bash
git add CHANGELOG_ONE_LINE.md
git commit -m "docs: changelog for messenger layer 1"
```

---

## Task 12: Аудит мёртвого кода — удалить всё, что больше не нужно

**Цель:** выполнить constraint №1 — никакого мёртвого кода. После всех рефакторингов могут остаться неиспользуемые helper'ы, импорты или комментарии.

**Files:**
- Audit: `server/services/db.js`, `server/services/messengerStore.js`, `server/routes/messenger.js`, `server/services/ws.js`, `src/context/MessengerContext.jsx`

- [x] **Step 1: Проверить unused exports в `db.js`**

```bash
# Найти функции, которые экспортируются, но не импортируются нигде
node -e "
const db = require('./server/services/db.js');
const fs = require('fs');
const path = require('path');
const files = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(js|jsx|mjs)\$/.test(f)) files.push(p);
  }
}
walk('./server'); walk('./src'); walk('./scripts');
const src = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
for (const name of Object.keys(db)) {
  if (typeof db[name] !== 'function') continue;
  const re = new RegExp('\\\\b' + name + '\\\\b', 'g');
  const matches = (src.match(re) || []).length;
  if (matches <= 1) console.log('UNUSED?:', name, matches);
}
"
```

Expected: список потенциально мёртвых функций. Каждую вручную проверить через `grep -rn '<name>' server src scripts --include='*.js' --include='*.jsx' --include='*.mjs'`. Если правда не используется — удалить из `db.js` (и определение, и экспорт).

⚠️ Не удалять функции, которые могут вызываться через динамические импорты или строки. При сомнении — оставлять.

- [x] **Step 2: Проверить что `loadLastMessageSnapshot` НЕ создан**

В этом плане мы переиспользовали `getLastMessageForChat`. Убедиться, что в `messengerStore.js` нет функции `loadLastMessageSnapshot`:

```bash
grep -n "loadLastMessageSnapshot" server src scripts
```
Expected: пусто.

- [x] **Step 3: Проверить что старый LATERAL-паттерн в `getChatsByUser` и `getLastMessageForChat` удалён**

```bash
grep -n "LEFT JOIN LATERAL" server/services/db.js
```
Expected: ноль вхождений в этих двух функциях (могут остаться в других, не связанных с last_message — проверить, что это не наш SQL).

- [x] **Step 4: Проверить неиспользуемые импорты**

```bash
# В каждом изменённом файле проверить, что все импорты используются
# Для каждого файла:
node -e "
const fs = require('fs');
const f = 'server/routes/messenger.js';  // повторить для остальных
const src = fs.readFileSync(f, 'utf8');
const imports = src.match(/require\(['\"][^'\"]+['\"]\)/g) || [];
// + проверить деструктуризацию в requires
console.log(imports.length, 'requires');
"
```

Простой grep подход:
```bash
# Для каждого имени из деструктуризации require — проверить, используется ли в файле
# (Вручную, потому что автомат сложный)
```

Альтернатива — eslint с правилом `no-unused-vars`:
```bash
npx eslint server/services/db.js server/routes/messenger.js server/services/ws.js src/context/MessengerContext.jsx 2>&1 | grep -i "unused\|no-unused"
```

Expected: ноль unused imports/vars в изменённых файлах.

- [x] **Step 5: Проверить, что нет «осиротевших» обработчиков на клиенте**

В `src/context/MessengerContext.jsx` после изменений Task 8 — удостовериться, что:
- Нет дублей `setChats` на одно и то же событие.
- Нет старых TODO/закомментированных блоков, оставленных «на всякий случай».

```bash
grep -n "TODO\|FIXME\|XXX\|// old\|// deprecated" src/context/MessengerContext.jsx
```
Expected: новых таких комментариев не добавилось. Старые, не связанные с планом, не трогаем.

- [x] **Step 6: Проверить интерфейс UI — ни одной новой кнопки**

```bash
git diff main -- src | grep -E "Button|onClick|<button" | head -20
```
Expected: НИ ОДНОГО нового UI-элемента в diff. Изменения только в логике (`MessengerContext.jsx`). Если случайно появилось — откатить.

- [x] **Step 7: Final diff review**

```bash
git diff main --stat
git log main..HEAD --oneline
```
Expected: список изменённых файлов соответствует File map в начале плана. Каждый коммит — атомарный.

- [x] **Step 8: Commit (если были удаления)**

```bash
git add -A
git status
# если есть удаления:
git commit -m "chore(messenger): remove dead code after denormalization"
```
Если удалять было нечего — пропустить коммит, это нормально.

---

## Done — критерии приёмки слоя 1

### Производительность и корректность
- [ ] `GET /api/chats` отвечает одним запросом без `LATERAL` (проверить через `EXPLAIN ANALYZE`).
- [ ] При reload / реконнекте WS превью в списке чатов отражает последнее сообщение **без открытия чата**.
- [ ] `p95(/api/chats) < 250ms` на dev-данных.

### Все verify зелёные
- [ ] `verify:messenger-chat-preview` зелёный.
- [ ] `verify:messenger-chat-list-perf` зелёный.
- [ ] `verify:messenger-chat-preview-sync` зелёный.
- [ ] Все остальные существующие `verify:messenger-*` зелёные (регрессии нет).

### Constraint №1 — Никакого мёртвого кода
- [x] Task 12 пройден: нет неиспользуемых функций / импортов / закомментированных блоков, появившихся в этом плане.
- [x] Старые SQL-паттерны с `LEFT JOIN LATERAL` для last message удалены полностью.
- [x] Никаких дублирующих helper'ов (нет `loadLastMessageSnapshot` — переиспользовали `getLastMessageForChat`).

### Constraint №2 — Никаких новых UI-элементов
- [x] `git diff main -- src` не показывает новых `<button>`, `onClick`, тостов, индикаторов, пунктов меню.
- [ ] Никаких новых пользовательских действий — всё обновляется автоматически под капотом.

### Constraint №3 — Полный функционал работает
Все 18 пунктов Task 11 пройдены:
- [ ] Текст, голос, файлы, изображения отправляются и отображаются в превью.
- [ ] Push-уведомления приходят как раньше.
- [ ] Reply, mentions, pins, receipts работают.
- [ ] Edit обновляет превью только когда это последнее сообщение.
- [ ] Delete-for-all, delete-for-self, bulk delete корректно пересчитывают превью.
- [ ] Forward работает.
- [ ] System-сообщения не попадают в превью.
- [ ] Multi-device sync работает.
- [ ] Sync после оффлайна обновляет превью без клика по чату.
- [ ] Создание нового чата работает (NULL last_message_at сортируется правильно).
- [ ] Reset / удаление аккаунта (если есть) — без ошибок БД.

## После слоя 1 — что становится возможным

- Слой 2 (pts + getDifference) теперь имеет on-chat snapshot для возврата diff'а быстрее.
- Слой 3 (Dexie + reactive UI) получит готовый `chat.last_message` снапшот при первом hydrate.

---

## Self-review checklist (не для исполнителя — для автора плана)

- [x] Все sub-задачи спека покрыты: schema, backfill, helper, write paths (insert/edit/delete), read path, sync payload, client replay, dead-code audit, full regression.
- [x] Нет placeholder'ов «TBD», «similar to», «add validation» — везде конкретный SQL/JS.
- [x] Имена функций и колонок согласованы: `applyChatLastMessage`, `getLastMessageForChat` (переиспользована, НЕ дубль), `last_message_*` колонки, `payload.lastMessage` ключ.
- [x] Hide-for-user edge case покрыт в Task 6 (fallback в getChatsByUser) и Task 7 Step 1 (fallback в getLastMessageForChat) — одна логика.
- [x] System-сообщения (`msg_type='system'`) исключены из обновления last_message в Task 4 и Task 3 helper.
- [x] Каждый Task заканчивается commit'ом.
- [x] Smoke-тесты дают expected output.
- [x] Constraint №1 (no dead code): Task 12 явно ищет unused exports/imports.
- [x] Constraint №2 (no new UI): Task 12 Step 6 проверяет diff на новые кнопки.
- [x] Constraint №3 (no functional regression): Task 11 — 18 пунктов покрывают все фичи мессенджера.

⚠️ Места риска:
1. **Task 7 — переписали `getLastMessageForChat`.** Контракт сохранён (та же сигнатура и возврат), но внутренняя SQL изменилась. Если где-то полагались на тонкости старого ordering — может всплыть. Митигация: smoke в Task 7 Step 2.
2. **Task 4 — транзакционность.** `applyChatLastMessage` вызывается внутри транзакции insertMessage (с client_message_id). Если в будущем кто-то вынесет insertMessage наружу — нужно не забыть applyChatLastMessage. Документация через комментарий в helper'е.
3. **Task 12 Step 4 — eslint.** Если eslint в проекте не настроен или конфиг старый — проверка unused imports может не сработать. Тогда — ручной grep.
