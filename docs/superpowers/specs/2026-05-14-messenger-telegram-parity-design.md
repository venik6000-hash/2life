# Messenger Telegram-parity — Sub-project A (Design Spec)

**Дата:** 2026-05-14
**Область:** мессенджер (мобилка + ноутбук + сервер + БД)
**Sub-project:** A — низкорисковые аддитивные улучшения
**Sub-projects B, C:** темы в чатах, реакции/голосовые/mute/превью/форматирование — отдельные циклы

## 1. Цель и неприкосновенные инварианты

### 1.1 Что делаем

Добавляем в существующий мессенджер 7 функциональных групп, делающих его ближе к Telegram по UX:

1. Мобильное контекстное меню сообщений (long-press)
2. Multi-select сообщений и bulk-операции
3. Ответ на сообщение (reply-to) с цитатой и переходом к оригиналу
4. Закрепление сообщений в двух режимах: «для всех» (до 5 на чат) и «для себя» (до 5 личных закладок)
5. Soft pre-prompt модалка для запроса push при первом входе + iOS install banner
6. Доработка вкладки настроек (display_name, тема, размер шрифта, смена пароля, активные устройства)
7. Поиск по сообщениям — в текущем чате и глобально по доступным чатам
8. @-упоминания пользователей чата

Все изменения работают **и на мобильной, и на настольной версии**.

### 1.2 Что НЕ делаем

- Темы внутри чата (Telegram forum topics) — Sub-project B
- Реакции, голосовые, mute, превью ссылок, форматирование текста, `@all`/`@everyone` — Sub-project C
- Поиск по именам файлов и именам участников — отложено (только текст в Sub-project A)
- Mention-push, пробивающий mute — отложено вместе с появлением mute (Sub-project C)
- Аватары в настройках — отложено
- Изменение криптоконтура — категорически не трогаем

### 1.3 Инварианты (что не должно сломаться)

- **БД совместимость:** ни одно существующее поле/таблица не переименовывается, не удаляется и не меняет тип. Все миграции — `ADD COLUMN` / `CREATE TABLE` / `CREATE INDEX` через `try/catch` (паттерн уже используется в `initSchema()`).
- **Push продолжает работать** ровно как сейчас: `messengerPush.js`, `messenger_devices`, VAPID, `public/sw.js` не трогаются. Pre-prompt — это новый UI **до** вызова существующей `enableNotifications()`.
- **Шифрование** (`messengerCrypto.js`, AES-256-GCM, `encrypted_text`, `encrypted_meta`) не меняется.
- **Существующие WebSocket события** (`new_message`, `message_edited`, `message_deleted_all`, `message_deleted_self`, `receipts_update`, `participant_added`, `participant_removed`, `chat_created`) — не переименовываются и не меняют payload.
- **Существующие REST-эндпоинты** работают как раньше (только опционально расширяются дополнительными полями body).
- **Старые клиенты в IndexedDB-кэше** (`messengerCache.js`) корректно отображают новые сообщения; новые поля у старых сообщений — пустые.
- **Существующая логика прав** (`canAccessChat`, `requireParticipant`, `chatAccessSync.js`) не меняется.

## 2. Изменения в БД

### 2.1 Новые колонки в `messages`

| Колонка | Тип | Дефолт | Назначение |
|---|---|---|---|
| `pinned_at` | `TIMESTAMPTZ` | `NULL` | Если NOT NULL — сообщение закреплено для всех в чате; значение = время закрепления. Не храним `pinned_by` (по решению пользователя). |
| `reply_to_message_id` | `INTEGER REFERENCES messages(id) ON DELETE SET NULL` | `NULL` | ID сообщения-оригинала, на которое это сообщение является ответом. Каскадного удаления нет — при удалении оригинала ссылка обнуляется, в UI цитата показывает «Сообщение удалено». |

### 2.2 Новая таблица `message_pinned_for_users`

Личные закладки. **Точная копия паттерна `message_hidden_for_users`** (которая уже используется для «удалить у себя»).

```sql
CREATE TABLE IF NOT EXISTS message_pinned_for_users (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, message_id)
);
```

### 2.3 Индексы

| Индекс | Назначение |
|---|---|
| `idx_msg_chat_pinned` ON `messages(chat_id, pinned_at)` WHERE `pinned_at IS NOT NULL` | Pin-bar открывается мгновенно (топ-5 закреплённых в чате) |
| `idx_msg_reply_to` ON `messages(reply_to_message_id)` WHERE `reply_to_message_id IS NOT NULL` | Поиск ответов на конкретное сообщение (для каскадов и UI) |
| `idx_mpf_user` ON `message_pinned_for_users(user_id)` | Личные закрепления пользователя |

### 2.4 Поиск — без изменений в схеме

Поскольку сообщения хранятся как `encrypted_text` (AES-256-GCM), полнотекстовый индекс PostgreSQL не применим. Поиск реализуется через декрипт-и-скан на сервере в памяти, с пагинацией. Для типичных объёмов клиники (чаты до 10K сообщений) — приемлемая производительность.

### 2.5 Порядок применения миграций в `services/db.js::initSchema()`

```
try { ALTER TABLE messages ADD COLUMN pinned_at TIMESTAMPTZ } catch (_) {}
try { ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL } catch (_) {}
try { CREATE TABLE IF NOT EXISTS message_pinned_for_users (...) } catch (_) {}
try { CREATE INDEX IF NOT EXISTS idx_msg_chat_pinned ON messages(chat_id, pinned_at) WHERE pinned_at IS NOT NULL } catch (_) {}
try { CREATE INDEX IF NOT EXISTS idx_msg_reply_to ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL } catch (_) {}
try { CREATE INDEX IF NOT EXISTS idx_mpf_user ON message_pinned_for_users(user_id) } catch (_) {}
```

## 3. Серверный слой

### 3.1 Новые HTTP-эндпоинты

Все защищены `requireAuth()` + `requireParticipant(chatId)`. Размещаются в `server/routes/messenger.js`.

| Метод | Путь | Назначение | Тело | Ответ |
|---|---|---|---|---|
| `POST` | `/api/chats/:id/messages/:messageId/pin` | Закрепить для всех | — | `200` или `409 PIN_LIMIT_REACHED` (если уже 5 закреплённых) |
| `DELETE` | `/api/chats/:id/messages/:messageId/pin` | Снять закрепление для всех | — | `200` |
| `POST` | `/api/chats/:id/messages/:messageId/pin-for-me` | Личное закрепление | — | `200` или `409 PERSONAL_PIN_LIMIT_REACHED` (если у пользователя в этом чате уже 5) |
| `DELETE` | `/api/chats/:id/messages/:messageId/pin-for-me` | Снять личное закрепление | — | `200` |
| `GET` | `/api/chats/:id/pinned` | Получить топ-5 pin-for-all для чата | — | `[{ messageId, pinnedAt }, ...]` |
| `GET` | `/api/chats/:id/pinned-for-me` | Получить мои личные закрепления в чате | — | `[{ messageId, pinnedAt }, ...]` |
| `POST` | `/api/chats/:id/messages/bulk-delete` | Атомарное bulk-удаление | `{ ids: number[], scope: "self" \| "all" }` | `200` или `403 BULK_DELETE_FORBIDDEN` (если в наборе есть чужие при `scope=all` и пользователь не admin) |
| `POST` | `/api/chats/:id/messages/bulk-forward` | Bulk-пересылка в другой чат | `{ ids: number[], targetChatId: number }` | `200 { forwarded: number }` |
| `GET` | `/api/chats/:id/messages/search` | Поиск в чате | query: `q`, `limit=50`, `before=<msgId>` | `{ matches: [{ messageId, snippet }] }` |
| `GET` | `/api/messenger/search` | Глобальный поиск по доступным чатам | query: `q`, `limit=50` | `{ groups: [{ chatId, chatTitle, matches: [{ messageId, snippet }] }] }` |
| `GET` | `/api/messenger/devices` | Список моих устройств с push-подпиской | — | `[{ id, userAgent, lastSeenAt, registeredAt }]` |

### 3.2 Расширения существующих эндпоинтов

| Эндпоинт | Расширение |
|---|---|
| `POST /api/chats/:id/messages` | В body добавляются опциональные поля `replyToMessageId: number \| null` и `mentionedUserIds: number[]`. Сервер валидирует, что `replyToMessageId` ссылается на сообщение **этого же чата**. `mentionedUserIds` валидируется как подмножество участников чата. Оба поля упаковываются: `replyToMessageId` идёт в отдельную колонку `messages.reply_to_message_id`, `mentionedUserIds` — в `encrypted_meta` JSON. |
| `PATCH /api/auth/me` (**новый эндпоинт**, в `routes/auth.js`) | Позволяет аутентифицированному пользователю менять собственный `display_name` (max 80 символов, trim). Реализуется поверх существующего `UPDATE users SET display_name` (паттерн уже используется в admin-роутах). Existing endpoint для смены пароля (`/api/auth/change-password`) остаётся как есть. |

### 3.3 Существующие эндпоинты — без изменений

`PATCH /api/chats/:id/messages/:messageId` (редактирование одного), `DELETE /api/chats/:id/messages/:messageId` (удаление одного с `scope=self|all`) — работают как раньше. Мобильное контекстное меню вызывает их же.

### 3.4 Новые WebSocket-события

| Событие | Payload | Когда | Кому |
|---|---|---|---|
| `message_pinned` | `{ chatId, messageId, pinnedAt }` | После `POST /pin` | Всем участникам чата |
| `message_unpinned` | `{ chatId, messageId }` | После `DELETE /pin` | Всем участникам чата |

Личные закрепления через WS **не рассылаются** — синхронизация между устройствами одного пользователя идёт через `messenger_sync_events` (`createSyncEvent(pool, { ... eventType: "personal_pin_added" | "personal_pin_removed" })`).

### 3.5 Расширение payload существующего `new_message`

В payload добавляется опциональное поле `mentionedUserIds: number[]` (если есть упоминания). Старые клиенты поле проигнорируют — обратная совместимость сохранена.

### 3.6 Правила доступа

- **Закрепить/открепить для всех:** любой участник чата.
- **Личные закрепления:** только сам пользователь (своя `user_id`).
- **Bulk-delete с `scope=all`:** атомарная проверка `existing.sender_id === req.user.id || req.user.role === "admin"` для **каждого** сообщения в наборе. Если хотя бы одно сообщение чужое и пользователь не admin — отклоняем **весь** запрос с `403 BULK_DELETE_FORBIDDEN` и `deniedIds: number[]`. Никаких частичных применений.
- **Bulk-delete с `scope=self`:** разрешено для любого набора в своих чатах.
- **Поиск в чате (`/chats/:id/messages/search`):** только если пользователь — участник чата (`requireParticipant`).
- **Глобальный поиск (`/messenger/search`):** сервер сам ограничивает выборку чатами, где `user_id` пользователя есть в `chat_participants`. Клиентская роль (`viewer`) увидит только свой единственный чат, что даёт ту же выборку что и in-chat поиск.

### 3.7 Реализация поиска

```
SELECT m.id, m.chat_id, m.encrypted_text, m.encrypted_meta, m.created_at
  FROM messages m
  JOIN chat_participants cp ON cp.chat_id = m.chat_id
 WHERE cp.user_id = $userId
   AND m.deleted_for_all = false
   AND m.id NOT IN (SELECT message_id FROM message_hidden_for_users WHERE user_id = $userId)
 ORDER BY m.created_at DESC
 LIMIT $batchSize OFFSET $offset
```

Затем в Node.js: расшифровываем `encrypted_text`, проверяем case-insensitive `includes(query)`, собираем snippet (до 80 символов вокруг совпадения). Завершаем при наборе `limit` совпадений или исчерпании. Для in-chat варианта добавляется `AND m.chat_id = $chatId`. Декриптор переиспользуется из `messengerCrypto.js`.

## 4. Клиентский слой (UI)

### 4.1 Структура изменений

| Файл | Изменение |
|---|---|
| `src/context/MessengerContext.jsx` | Добавляются методы: `pinForAll`, `unpinForAll`, `pinForMe`, `unpinForMe`, `bulkDelete`, `bulkForward`, `searchInChat`, `searchGlobal`, `setReplyTarget`, `clearReplyTarget`, `updateDisplayName`, `setFontSize`, `setTheme` (пробрасывает в `ThemeContext`), `getDevices`, `revokeDevice`. Состояние: `pinnedForAll[chatId]`, `pinnedForMe[chatId]`, `replyTarget[chatId]`, `selectionMode`, `selectedIds`. WS-обработчики `message_pinned`/`message_unpinned`. |
| `src/components/MessengerContextMenu.jsx` | Добавляются пункты: «Ответить», «Закрепить для всех / Открепить», «Закрепить для себя / Открепить лично», «Копировать», «Выбрать». Старые пункты не трогаем. |
| `src/components/MessageBubble.jsx` | Рендер цитаты сверху пузыря (если `reply_to_message_id` есть). Подсветка `@upon mentioned` для `mentionedUserIds`. Cостояние «выбрано» (визуальный чекбокс) в режиме multi-select. |
| `src/components/MessengerChatWindow.jsx` (десктоп) | Pin-bar сверху чата (под шапкой). Action-bar в режиме multi-select. Иконка лупы → in-chat поиск (заменяет шапку на строку поиска). Reply-preview над input. Mention popover при наборе `@`. |
| `src/components/MessengerChatList.jsx` | Иконка лупы в шапке → глобальный поиск. Значок `@` рядом со счётчиком непрочитанных, если среди непрочитанных есть упоминание. |
| `src/components/MessengerShell.jsx` | Иконка шестерёнки в шапке → выдвижная панель «Настройки» справа. |
| `src/mobile/MobileChatThread.jsx` | Long-press (через `pointerdown` + `setTimeout` 400мс) → контекстное меню. Pin-bar, reply-preview, action-bar в режиме multi-select, mention popover. Long-press отменяется при `pointermove` (порог 8px) и `pointerup`. |
| `src/mobile/MobileChatList.jsx` | Иконка лупы → глобальный поиск (отдельный экран). Значок `@` для упоминаний. |
| `src/mobile/MobileMessengerShell.jsx` | Шестерёнка в шапке → экран настроек. |
| `src/mobile/MobileMessengerSettings.jsx` | **Полная переработка:** display_name, тема, размер шрифта, смена пароля, активные устройства, очистить кэш, выйти. |
| `src/mobile/MobileSearchScreen.jsx` (новый) | Экран глобального поиска с группировкой по чатам. |
| `src/mobile/MobileChatSearchOverlay.jsx` (новый) | Поверх треда — строка поиска + навигация вверх/вниз по результатам. |
| `src/components/MessengerPushPrompt.jsx` (новый) | Soft pre-prompt модалка для разрешения уведомлений. |
| `src/components/MessengerIosInstallBanner.jsx` (новый) | iOS install banner с инструкцией добавить на главный экран. |
| `src/components/MessengerMentionPicker.jsx` (новый) | Popover со списком участников чата для `@`. Используется и на десктопе, и на мобиле. |
| `src/components/MessengerPinBar.jsx` (новый) | Полоса с закреплённым сообщением сверху чата (используется в обеих оболочках). |
| `src/utils/messengerCache.js` | Кэшируем новые поля `pinned_at`, `reply_to_message_id`, mentions из `encrypted_meta`. |
| `src/utils/pushSubscription.js` | Не трогаем — pre-prompt вызывает существующую функцию через `enableNotifications()` в контексте. |

### 4.2 Поведение контекстного меню (мобилка + десктоп)

Меню формируется динамически по флагам сообщения:

| Пункт | Условие отображения |
|---|---|
| Ответить | Всегда (если сообщение не удалено) |
| Переслать | Всегда (если не удалено) |
| Закрепить для всех | Сообщение ещё не `pinned_at` AND в чате < 5 закреплённых |
| Открепить (для всех) | Сообщение `pinned_at` IS NOT NULL |
| Закрепить для себя | Нет записи в `message_pinned_for_users` для текущего пользователя AND у пользователя в этом чате < 5 личных закреплений |
| Убрать из своих закладок | Есть запись |
| Копировать текст | Сообщение текстовое |
| Редактировать | Своё текстовое не удалённое сообщение |
| Удалить у себя | Всегда |
| Удалить у всех | Своё сообщение OR admin |
| Выбрать | Всегда — переход в режим multi-select |

### 4.3 Multi-select поведение

**Вход в режим:**
- Мобилка: из контекстного меню → «Выбрать»; первое сообщение сразу выделено.
- Десктоп: контекстное меню → «Выбрать», ИЛИ Shift+клик / Ctrl+клик по сообщению.

**Режим:**
- Шапка чата заменяется на action-bar: «← Отмена · Выбрано: N · [🗑️] [↗]»
- Tap (мобилка) или клик (десктоп) — toggle выделения.
- Скролл и чтение работают как обычно.

**Удаление пачкой:**
- Нажатие [🗑️] → диалог: «Удалить N сообщений: [У себя] [У всех] [Отмена]».
- «У себя» — `POST /bulk-delete` с `scope=self`. Всегда успешно.
- «У всех» — `POST /bulk-delete` с `scope=all`. Если в наборе есть чужие сообщения и пользователь не admin — сервер возвращает `403`, клиент показывает toast: «Нельзя удалить чужие сообщения у всех. Снимите выделение с N чужих или используйте "У себя"». Подсвечивает в селекции чужие.

**Пересылка пачкой:**
- Нажатие [↗] → открыть существующий `MessengerForwardModal` с пачкой `ids`. После выбора чата — `POST /bulk-forward`.

**Выход:**
- Кнопка отмены, ESC (десктоп), системная кнопка «назад» (мобилка).

### 4.4 Reply (ответ)

**Запуск:**
- Контекстное меню → «Ответить» → `setReplyTarget(chatId, message)`.
- Над input появляется **reply-preview**: левая полоска акцентным цветом, имя автора оригинала, 1-2 строки текста (или иконка 📎 + имя файла, или 🖼️ + миниатюра первого фото из бандла), крестик ×.

**Отправка:**
- `POST /api/chats/:id/messages` с `body.replyToMessageId = original.id`.
- Сервер сохраняет в `messages.reply_to_message_id`.
- Через WS приходит `new_message` с полями оригинала (опционально может ехать денормализованный `replyTo: { id, senderId, snippet, mediaType }` для быстрого рендера без отдельного запроса).

**Отображение:**
- В пузыре-ответе сверху — компактная цитата того же формата что reply-preview.
- Клик по цитате → плавный скролл к оригиналу + кратковременная подсветка (300мс).
- Если оригинал не найден локально (старое сообщение не загружено) — запрашиваем у сервера, прыгаем.
- Если оригинал удалён у всех (`reply_to_message_id` стал NULL через `ON DELETE SET NULL`) — цитата серым, текст «Сообщение удалено».

### 4.5 Pin-bar

**Размещение:** под шапкой чата, выше списка сообщений. Высота ~44px. Скрывается, если в чате нет pin-for-all.

**Содержимое:**
- Слева: иконка 📌, текст последнего закреплённого (одна строка, ellipsis).
- Справа: счётчик «1/N», если N > 1; кнопка ✕ открепить (доступна для всех, как и закрепление).

**Поведение:**
- Клик по полосе → скролл к pinned-сообщению + лёгкая подсветка пузыря. При повторных кликах — листает по pinned (как Telegram).
- Pin-for-all состояние подгружается при открытии чата через `GET /chats/:id/pinned` + обновляется по WS `message_pinned`/`message_unpinned`.

**Личные закрепления:**
- Доступ к списку:
  - Десктоп: пункт «Мои закладки» в выпадающем меню чата (в шапке `MessengerChatWindow`).
  - Мобилка: long-press на чат в списке `MobileChatList` → пункт «Закладки» в action-sheet.
- Открывает оверлей/панель со списком сообщений-закладок. Клик → переход к сообщению.

### 4.6 Поиск

**В чате:**
- Иконка лупы в шапке открытого чата → шапка заменяется на строку поиска (с фокусом).
- При вводе — debounce 300мс, запрос `GET /chats/:id/messages/search?q=...`.
- Результаты подсвечивают совпадения прямо в треде. Кнопки «↑↓» переходят по результатам.
- ESC или ✕ — закрыть поиск, вернуть шапку.

**Глобальный поиск:**
- Десктоп: лупа в шапке `MessengerChatList`.
- Мобилка: отдельный экран `MobileSearchScreen` (открывается из шапки `MobileChatList`).
- Результаты группируются по чатам: «Чат: Иванов Иван — 3 совпадения», раскрытие — список сниппетов. Клик → переход в чат + скролл к сообщению + подсветка.
- Кнопка «Показать ещё» при наличии большего числа результатов (пагинация по `before`).

**Декрипт на сервере** — описан в 3.7. Snippet формируется на сервере с маркерами совпадений (например, `…это будет ответ на <em>привет</em> от Ивана…`) и приходит уже расшифрованным.

### 4.7 @-упоминания

**Ввод:**
- При наборе `@` в input (и `mobileChatThread`, и `MessengerChatWindow`) — открывается popover `MessengerMentionPicker` со списком участников чата (исключая себя). Фильтрация по мере ввода (по `display_name` + `username`, case-insensitive).
- Выбор стрелками / тапом / Enter → вставка `@DisplayName ` (с пробелом). Сохраняется маркер в локальном состоянии input: позиция + userId.

**Отправка:**
- На отправке клиент парсит текст, собирает `mentionedUserIds: number[]`, передаёт в body `POST /messages`.
- Сервер валидирует, что `mentionedUserIds` — подмножество участников чата.
- Сервер пакует массив в `encrypted_meta.mentionedUserIds`.

**Отображение:**
- В пузыре `@DisplayName` рендерится акцентным цветом (как ссылка, но без действия в Sub-project A).
- Сопоставление текста ↔ userId: по приходу `new_message` клиент берёт `mentionedUserIds` из payload и подсвечивает фрагменты текста, совпадающие с `@${displayName}` для этих ID. Это устойчиво к смене `display_name` после отправки (по userId).

**Индикатор упоминания в списке чатов:**
- Если среди непрочитанных сообщений чата есть хоть одно с `mentionedUserIds.includes(myUserId)` — в строке чата рядом со счётчиком отображается значок `@`.
- При локальной обработке непрочитанных (которая уже есть в `MessengerContext`) — добавляется параллельный счётчик упоминаний.

### 4.8 Push pre-prompt + iOS banner

**Pre-prompt модалка (`MessengerPushPrompt.jsx`):**
- Render-условия (объединённые):
  - `'Notification' in window`
  - `'serviceWorker' in navigator`
  - `Notification.permission === "default"`
  - `localStorage.getItem("messenger_push_prompt_seen") !== "true"`
  - НЕ iOS Safari вне PWA (для iOS — банер вместо модалки)
- Кнопки:
  - «Включить» → `await enableNotifications()` → `localStorage.setItem("messenger_push_prompt_seen", "true")` → закрыть.
  - «Не сейчас» → `localStorage.setItem("messenger_push_prompt_seen", "true")` → закрыть. **Повторно не показываем.**

**iOS install banner (`MessengerIosInstallBanner.jsx`):**
- Render-условия:
  - `/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream`
  - `window.navigator.standalone !== true` AND `!window.matchMedia('(display-mode: standalone)').matches`
  - `localStorage.getItem("messenger_ios_install_banner_dismissed") !== "true"`
- Содержимое: тонкая полоса снизу (над safe-area) с текстом «Добавьте приложение на главный экран для уведомлений. ⬆ → "На экран Домой"» и кнопкой ×.
- Закрытие → `localStorage.setItem("messenger_ios_install_banner_dismissed", "true")`. Может появиться снова только если юзер очистит site data.
- После установки PWA и следующего захода — баннер не рендерится (условие `standalone` истинно), отрабатывает обычный pre-prompt.

### 4.9 Настройки

**Мобилка (`MobileMessengerSettings.jsx`):**

Секции (карточки), в порядке отображения:

1. **Профиль** — поле «Отображаемое имя» с `BlurInput`-стилем, сохраняет на blur через `PATCH /api/auth/me { displayName }`.
2. **Уведомления** — статус (использует существующие лейблы `notificationLabel`), кнопка «Включить уведомления» (если ещё не enabled).
3. **Внешний вид** — радио-выбор темы (Системная / Светлая / Тёмная), радио-выбор размера шрифта (S / M / L). Сохраняем в localStorage; размер шрифта прокидываем в `MessageBubble` через CSS-переменную или prop.
4. **Безопасность** — «Сменить пароль» (открывает модалку с текущим/новым/подтверждением, дёргает существующий `POST /api/auth/change-password`); «Активные устройства» (список из `GET /api/messenger/devices` с кнопкой ⊖ → `DELETE /api/messenger/devices/:id`).
5. **Данные** — «Очистить кэш» (как сейчас), «Выйти» (как сейчас).

**Десктоп:** шестерёнка в шапке `MessengerShell` → выдвижная панель справа (с использованием тех же секций, скомпонованных в колонку).

## 5. Безопасность миграции и план отката

### 5.1 Чек-лист безопасности

- ✓ Все DDL аддитивные.
- ✓ Все ALTER завёрнуты в `try/catch` (паттерн уже принятый).
- ✓ Бэкап `services/backup.js` не требует изменений (бэкапит всю БД).
- ✓ Существующие WS события не меняют формат.
- ✓ Существующие REST эндпоинты не меняют формат (только добавляют опциональные поля в body).
- ✓ Push-флоу не трогается, только добавляется UI-шаг перед `enableNotifications()`.
- ✓ Криптоконтур не трогается.
- ✓ Старые клиенты в IndexedDB-кэше работают (новые поля просто пустые).

### 5.2 План отката

`git revert` коммитов достаточно:
- Новые колонки в БД остаются пустыми и не мешают старому коду.
- Новые таблицы остаются неиспользуемыми.
- Старый код не знает о новых эндпоинтах и WS-событиях.
- Никаких операций удаления / переноса данных делать не нужно.

### 5.3 Verify-скрипты

В дополнение к существующим (`scripts/verifyMessengerUnread.mjs`, `scripts/verifyMessengerPushClient.mjs`) добавляются:

| Скрипт | Что проверяет |
|---|---|
| `verifyMessengerPin.mjs` | Pin/unpin, лимит 5 на чат, лимит 5 личных, реалтайм-обновление через WS |
| `verifyMessengerReply.mjs` | Reply на текст/файл/фото, scroll-to-original, поведение при `ON DELETE SET NULL` |
| `verifyMessengerBulk.mjs` | Bulk-delete с разрешёнными и запрещёнными ID — атомарный отказ; bulk-forward |
| `verifyMessengerSearch.mjs` | In-chat и глобальный поиск, кейсы с пунктуацией, регистром, юникодом |
| `verifyMessengerMention.mjs` | `@`-парсинг при отправке, валидация участников, сохранение в `encrypted_meta`, отображение |
| `verifyMessengerSettings.mjs` | `PATCH /api/auth/me`, `GET/DELETE /api/messenger/devices` |

Запускаются перед коммитом и в CI.

## 6. План выкатки

Sub-project A выполняется одним планом с волнами (wave-based parallelization). Деления по фазам внутри Sub-project A нет — выкатываем атомарно:

**Wave 1 (можно параллельно, нет зависимостей):**
- Миграции БД + индексы
- `MessengerPushPrompt`, `MessengerIosInstallBanner` (UI без зависимостей от схемы)
- `MobileMessengerSettings` переработка (UI)

**Wave 2 (требует Wave 1):**
- Серверные эндпоинты pin/unpin (для-всех и для-себя), bulk-delete, bulk-forward, search в-чате и глобальный
- Расширение `POST /messages` (reply, mentions)
- WS-события `message_pinned`/`message_unpinned`

**Wave 3 (требует Wave 2):**
- Клиентский `MessengerContext` методы
- `MessengerPinBar`, `MessengerMentionPicker` компоненты
- Расширение `MessengerContextMenu`, `MessageBubble`

**Wave 4 (требует Wave 3):**
- Long-press на `MobileChatThread`, multi-select режим, reply-preview, mention popover
- Поиск-overlay и search-screen
- Pin-bar в обоих оболочках
- Расширение `MessengerChatList` (значок @, лупа)

**Wave 5 (после всего):**
- Verify-скрипты
- Manual QA на iOS Safari (вне PWA → банер), Android Chrome (PWA → pre-prompt), десктоп Chrome/Safari

## 7. Открытые вопросы

Нет — все спорные моменты разрешены в брейншторме. Если возникнут при детальном планировании — добавляются в этот файл.
