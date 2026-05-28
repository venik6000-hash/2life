# 2life Dashboard Architecture

## 1. Цель архитектуры
- Быстрое понимание проекта новым разработчиком.
- Четкие зоны ответственности файлов.
- Простое масштабирование без переписывания ядра.

## 2. Верхнеуровневая схема

```
src/main.jsx
  └─ src/App.jsx
       ├─ AuthProvider          ← JWT-аутентификация
       │    └─ (если не авторизован) → LoginScreen
       │    └─ (авторизован)
       │         ├─ ThemeProvider
       │         ├─ EditorProvider
       │         └─ DashboardProvider
       │              └─ MessengerProvider
       │                   └─ src/dashboard.jsx   ← оркестратор
       │                        ├─ DashboardShell / DashboardHeader
       │                        ├─ Sidebar (components)
       │                        ├─ <активная секция> (sections/*)
       │                        └─ ModalsSection
```

- `src/context/AuthContext.jsx` — JWT-токен, пользователь, права, `authFetch`.
- `src/context/ThemeContext.jsx` — тёмная/светлая тема, объект цветов `$`.
- `src/context/EditorContext.jsx` — глобальный inline-редактор `Ed`.
- `src/context/DashboardContext.jsx` — клиенты, этапы, автосохранение, патч-логика.
- `src/context/MessengerContext.jsx` — shared server-encrypted messenger state, WebSocket, REST sync, offline queue, local cache.
- `/app/messenger` — mobile PWA surface for clients and employees.
- `src/sections/*` — оркестраторы бизнес-разделов: данные, эффекты, обработчики, сборка UI из компонентов.
- `src/components/*` — все визуальные поверхности и компонентные стили, включая одноразовые UI-блоки разделов и общие примитивы.
- `src/utils/*` — чистые утилиты и вычисления.
- `src/data/*` — справочники и шаблоны.
- `server/` — API, PostgreSQL, импорт Excel, бэкапы, реалтайм (SSE + WebSocket).

## 3. Поток данных

1. `AuthContext` при старте проверяет токен через `GET /api/auth/me`.
2. Если токен валиден — рендерится `DashboardContext`, который загружает клиентов/врачей через `authFetch`.
3. Оркестратор (`dashboard.jsx`) выбирает активную секцию по `activeSectionId`.
4. Секция получает данные этапа и функции обновления (`uS` / `uC`), меняет только свою область.
5. `DashboardContext` вычисляет дифф (`buildPatchOps` + `deepEqual`) и отправляет только изменённые поля (debounce 800 мс).
6. SSE (`GET /api/events?ticket=...`) доставляет изменения остальным открытым вкладкам в реальном времени.

## 4. Разделы дашборда (`SECTIONS` в DashboardContext)

| id              | Иконка | Название    | Компонент              |
|-----------------|--------|-------------|------------------------|
| `overview`      | ◉      | Обзор       | `Overview.jsx`         |
| `questionnaire` | 📋     | Анкета      | `Questionnaire.jsx`    |
| `nutrition`     | 🥗     | Питание     | `Nutrition.jsx`        |
| `menu`          | ☰      | Меню        | `Menu.jsx`             |
| `protocol`      | 💊     | Протокол    | `Protocol.jsx`         |
| `injections`    | 💉     | Инъекции    | `Injections.jsx`       |
| `analytics`     | 📊     | Анализы     | `Analytics.jsx`        |
| `lab`           | 🔬     | Направление | `LabOrder.jsx`         |
| `journal`       | 📓     | Журнал      | `Journal.jsx`          |
| `messenger`     | 💬     | Мессенджер  | `Messenger.jsx`        |
| `admin`         | —      | Админка     | `AdminSection.jsx`     |

> `admin` не входит в `SECTIONS` (нет в сайдбаре) — рендерится напрямую, Header скрыт.

## 5. Серверный слой (`server/`)

### Точка входа: `index.js`
- Запускает Express на порту 3001.
- При старте: `initSchema()` → `initDefaultAdmin()` → `initDefaultRoles()` → `initDefaultDeficitPresets()`.
- Подключает роутеры: `auth`, `clients`, `doctors`, `import`, `admin`, `messenger`, `menu`, `analyticsFiles`.
- Запускает авто-бэкап (`startAutoBackup`).
- Поднимает WebSocket сервер (`/ws`) через `services/ws.js`.

### Хранилище: PostgreSQL
- `services/db.js` — `pg.Pool`, DDL-схема, все SQL-запросы.
- Таблицы: `users`, `doctors`, `clients`, `stages`, `analytics_categories`, `analytics_markers`, `analytics_values`, `analytics_files`, `journal_entries` (legacy, см. ниже), `journal_items`, `journal_comments`, `journal_checklist_template_items`, `journal_notification_deliveries`, `protocol_revisions`, `nutrition_revisions`, `activity_log`, `roles`, `role_sections`, `role_permissions`, `reference_data`, `client_assignments`, `dishes`, `client_weekly_menus`, `client_menu_items`, `user_public_keys`, `chats`, `chat_participants`, `messages`, `message_hidden_for_users`, `message_receipts`, `chat_files`.
- Журнал: `journal_entries` — legacy таблица заметок по этапу; новый CRM-журнал хранится в `journal_items` (задачи/события/заметки, soft delete), `journal_comments` (треды), `journal_checklist_template_items` (admin-шаблон чек-листа стадии), `journal_notification_deliveries` (дедупликация push). Скрипт `server/scripts/verifyJournalBackfill.js` мигрирует legacy записи в `journal_items` как заметки (идемпотентно).
- `DATABASE_URL` (env) или `postgresql://postgres:postgres@localhost:5432/2life` по умолчанию.

### Роуты (`routes/`)

| Файл                | Префикс                                                                 | Назначение                                                           |
|---------------------|-------------------------------------------------------------------------|----------------------------------------------------------------------|
| `auth.js`           | `/api/auth`, `/api/admin/users`                                         | Login, logout, `/me`, смена пароля, тикеты SSE/WS, admin-управление пользователями |
| `clients.js`        | `/api/clients`                                                          | CRUD клиентов и этапов, SSE-поток                                    |
| `doctors.js`        | `/api/doctors`                                                          | Список врачей для UI + bulk-сохранение реестра (admin)               |
| `import.js`         | `/api/import-questionnaire`, `/api/import-analytics`                   | Загрузка Excel (анкета, анализы)                                     |
| `admin.js`          | `/api/admin`                                                            | Роли, права, справочники, CRUD врачей, активность, статистика        |
| `messenger.js`      | `/api/chats`, `/api/messenger`, `/api/users`                            | Чаты (клиентские и внутренние), участники, сообщения, файлы, sync, устройства и push-подписки |
| `menu.js`           | `/api/menu`, `/api/clients/:clientId/menu`                             | База блюд и недельные меню клиентов                                  |
| `analyticsFiles.js` | `/api/clients/:clientId/analytics-files`                               | Загрузка, метаданные и скачивание файлов анализов (PDF/изображения)  |
| `journal.js`        | `/api/clients/:clientId/journal*`, `/api/journal/badges`, `/api/admin/journal/checklist-template*` | CRM-журнал: список/CRUD задач, событий, заметок и комментариев; badge-счётчики; admin-шаблон чек-листа; инициализация чек-листа этапа |

### Сервисы (`services/`)

| Файл                 | Назначение                                                                        |
|----------------------|-----------------------------------------------------------------------------------|
| `db.js`              | PostgreSQL Pool + все SQL-функции                                                 |
| `clientStore.js`     | Бизнес-логика работы с клиентами поверх db                                        |
| `storage.js`         | Файловая система: пути, ensureDir, sameJson                                       |
| `backup.js`          | Авто-бэкап БД по расписанию                                                       |
| `logger.js`          | Запись действий в таблицу `activity_log`                                          |
| `permissions.js`     | Получение прав роли (`getPermissionsForRole`)                                     |
| `setup.js`           | Инициализация дефолтных данных при первом запуске                                 |
| `sse.js`             | Server-Sent Events: `addConnection`, `broadcast`                                  |
| `sseTickets.js`      | Одноразовые SSE-тикеты (30 сек) для browser EventSource-аутентификации           |
| `ws.js`              | WebSocket-хаб мессенджера: маршрутизация событий по участникам                   |
| `wsTickets.js`       | Одноразовые WS-тикеты (30 сек) для browser WebSocket-аутентификации              |
| `tokenBlacklist.js`  | In-memory JWT blacklist для серверного logout; записи авто-очищаются по TTL токена |
| `chatAccessSync.js`  | Синхронизация состава `chat_participants` по правам доступа к клиентам |
| `messengerCrypto.js` | Серверное AES-256-GCM шифрование/дешифрование сообщений и файлов мессенджера |
| `messengerPush.js`   | Web Push отправка: `sendPushToUsers` (общий путь доставки) + `sendPrivateMessagePush` для сообщений мессенджера. Используется и журналом, и мессенджером. |
| `messengerReset.js`  | Guarded reset только таблиц мессенджера и `server/uploads/chat`. Журнальные таблицы защищены префиксом `journal` в allowlist. |
| `journalStore.js`    | CRM-журнал: CRUD `journal_items`/`journal_comments`, badge-счётчики, шаблон чек-листа, дедупликация push, идемпотентный backfill legacy `journal_entries`. Переводит между stage_num (frontend) и stages.id (DB) внутренне. |
| `journalNotifications.js` | Планировщик уведомлений журнала: дневной дайджест ~9:00 и точные напоминания при наступлении due_date+due_time, через `sendPushToUsers`. |
| `clientAccess.js`    | Разделяемый `canAccessClient(user, clientId)` для роутов клиентов и журнала. |

### Middleware (`middleware/`)
- `auth.js`:
- `requireAuth(role?)` — проверка JWT, опциональная проверка роли.
- `requirePermission(permissionId)` — проверка action-права (`create_client`, `delete_client`, `import_data`).
- `requireSectionRead(sectionId)` / `requireSectionWrite(sectionId)` — проверка read/write по разделу.
- `requireAnySectionRead()` / `requireAnySectionWrite()` — агрегированная проверка доступа хотя бы к одному разделу.

## 6. Аутентификация и права

- JWT хранится в `localStorage` (`dash_token`), передаётся через `Authorization: Bearer`.
- JWT содержит `jti` (уникальный ID) — используется для инвалидации при logout через `tokenBlacklist.js`.
- `AuthContext` предоставляет `authFetch` — обёртка над `fetch` с токеном.
- Роли: `admin` + кастомные. Права задаются в `role_sections` (read/write по разделу) и `role_permissions`.
- `AdminSection` доступна только роли `admin`.

### Эндпоинты аутентификации (`/api/auth`)

| Метод | Путь | Назначение |
|-------|------|-----------|
| `POST` | `/api/auth/login` | Вход; возвращает JWT + `permissions`. Rate-limit: 5 попыток/мин с одного IP+логина |
| `POST` | `/api/auth/logout` | Серверная инвалидация токена через `tokenBlacklist`; клиент должен удалить `dash_token` |
| `GET`  | `/api/auth/me` | Проверка токена; возвращает `{ user, permissions }` |
| `POST` | `/api/auth/sse-ticket` | Одноразовый тикет (30 сек) для открытия SSE-соединения |
| `POST` | `/api/auth/ws-ticket` | Одноразовый тикет (30 сек) для открытия WebSocket-соединения |
| `POST` | `/api/auth/change-password` | Смена своего пароля; активный мессенджер не требует E2E-перешифровки при смене пароля |

### 6.1 Где хранятся role configs

- Конфигурация ролей хранится в PostgreSQL:
- `roles` — список ролей (`name`, `display_name`, `is_system`).
- `role_sections` — доступ к разделам (`can_read`, `can_write`).
- `role_permissions` — action-права (`create_client`, `delete_client`, `import_data`).
- Для пользователя итоговые права формируются в `server/services/permissions.js` (`getPermissionsForRole`).

### 6.2 Что возвращает `/api/auth/me` в `permissions`

- `GET /api/auth/me` возвращает:
- `{ ok: true, user, permissions }`.
- Формат `permissions`:

```json
{
  "sections": {
    "overview": { "read": true, "write": true },
    "questionnaire": { "read": true, "write": false }
  },
  "canDeleteClient": false,
  "canCreateClient": true,
  "canImportData": false,
  "isAdmin": false
}
```

- Для роли `admin` объект всегда с полным доступом ко всем секциям и действиям (независимо от записей в `role_sections` / `role_permissions`).

### 6.3 Политика UI для `read` / `write` (реализовано)

- Нет `read` → раздел не попадает в `visibleSections` и не отображается в sidebar.
- Есть `read`, но нет `write` → раздел отображается в read-only режиме.
- Read-only реализован на уровне компонентов секций: данные видны, но действия изменения скрыты или заблокированы.
- Раздел `admin` не входит в обычный список секций и рендерится отдельно только для `user.role === "admin"`.

### 6.4 Доступ к клиентам и привязка врача (персистентно в БД)

- `users.all_clients_access` — полный доступ ко всем клиентам без выдачи роли `admin`.
- `client_assignments` — точечные назначения клиентов конкретным пользователям.
- `doctors.user_id` — привязка сущности врача к аккаунту пользователя.
- При сохранении клиента в `routes/clients.js` вызывается `autoAssignDoctors`, который добавляет назначения на основе врачей, указанных в этапах клиента.
- Проверка доступа к клиенту централизована в `canAccessClient`: `admin` или `all_clients_access` или назначение в `client_assignments`.
- Для мессенджера включена серверная синхронизация `chat_participants` по клиентским правам: изменение `all_clients_access`, `client_assignments` и создание чата автоматически выравнивают состав участников.

### 6.5 Сохранение прав ролей (fix)

- Endpoint `PUT /api/admin/roles/:id/sections` поддерживает частичные обновления секций.
- Если в payload у секции передан только один флаг (`read` или `write`), второй берётся из текущего состояния в БД и не сбрасывается в `false`.

## 7. Реалтайм синхронизация

- Клиентские разделы дашборда: `POST /api/auth/sse-ticket` → `GET /api/events?ticket=...` (SSE, одноразовый тикет, TTL 30 сек).
- Мессенджер: `POST /api/auth/ws-ticket` → `ws://.../ws?ticket=...` (WebSocket, одноразовый тикет, TTL 30 сек).
- События мессенджера: `new_message`, `message_edited`, `message_deleted_all`, `message_deleted_self`, `receipts_update`, `participant_added`, `participant_removed`, `chat_created`.
- Сообщение, отправленное одним участником, доставляется всем участникам чата (включая отправителя для multi-device).
- Тикеты однократного использования хранятся в памяти (`sseTickets.js` / `wsTickets.js`); после потребления удаляются немедленно.

## 8. Границы ответственности

- **`dashboard.jsx`**: выбор активной секции, wiring layout-компонентов, модалок и PDF-печати. Shell/header/sidebar visuals живут в `components/*`.
- **`sections/*`**: поведение конкретного раздела: state, effects, handlers, mutations, вычисления для UI. Секции собирают компоненты, но не владеют визуальной косметикой.
- **`components/*`**: визуальная граница приложения. Цвета, padding, radius, typography, borders, shadows и internal spacing принадлежат компонентам; внешний код управляет ими через семантические props. Layout между компонентами задаётся через `Wrapper` и layout-props.
- **`context/*`**: общий state, синхронизация с API, CRUD-операции. Без детального JSX разделов.
- **`services/*`**: всё общение с БД и файловой системой. Без HTTP-специфики (это в routes).
- **`routes/*`**: HTTP-слой: валидация входа, вызов сервисов, формат ответа.

## 9. Соглашения по именам

- Явные имена в оркестраторе: `activeSectionId`, `currentClient`, `currentStage`, `printSectionToPdf`.
- Короткие алиасы (`st`, `cl`, `uS`, `$`) сохраняются для совместимости с существующими контрактами.
- Функции-рендеры секций: `renderOverviewSection`, `renderAnalyticsSection`, ...
- Новую секцию регистрировать в `sectionRenderers` (dashboard.jsx) и `SECTIONS` (DashboardContext).

## 10. Масштабирование

- При росте секции делить на: `src/sections/Section.jsx` для state/effects/actions + плоские `src/components/Section*.jsx` для UI.
- Не создавать локальные компоненты внутри `sections/` и не прокидывать косметические `style`/`className` override-props. Если нужен новый внешний вид, добавлять семантический prop компонента или отдельный компонент.
- Новый роут: добавить файл в `routes/`, подключить в `index.js`.
- Новая роль/право: через `AdminSection` → `/api/admin/roles`.

## 11. Быстрая навигация

| Хочу изменить…                  | Куда идти                                       |
|---------------------------------|-------------------------------------------------|
| Структуру экрана / layout       | `src/dashboard.jsx`, `src/components/DashboardShell.jsx`, `src/components/DashboardHeader.jsx`, sidebar-компоненты |
| Поведение конкретного раздела   | `src/sections/<Section>.jsx`                    |
| UI конкретного раздела          | `src/components/<Section...>.jsx`               |
| Глобальное состояние            | `src/context/DashboardContext.jsx`              |
| Тему                            | `src/context/ThemeContext.jsx`, `src/styles/`   |
| Логин / права пользователей     | `src/context/AuthContext.jsx`, `server/routes/auth.js` |
| Импорт Excel                    | `server/routes/import.js`, `server/parsers/`  |
| API клиентов                    | `server/routes/clients.js`                     |
| Схему БД                        | `server/services/db.js` (функция `initSchema`) |
| Реалтайм карточек (SSE)         | `server/services/sse.js`                       |
| Реалтайм мессенджера (WS)       | `server/services/ws.js`, `src/utils/websocket.js` |
| Криптоконтур мессенджера        | `server/services/messengerCrypto.js`, `src/utils/messengerApi.js` |
| UI мессенджера                  | `src/sections/Messenger.jsx`, `src/mobile/*`, `src/context/MessengerContext.jsx` |
| Роли и права (UI)               | `src/components/AdminSectionPanel.jsx`, `src/sections/AdminSection.jsx` |
| Файлы анализов (загрузка/просмотр) | `src/components/AnalyticsFilesPanel.jsx`, `src/sections/Analytics.jsx`, `server/routes/analyticsFiles.js` |
| Синхронизация участников чатов  | `server/services/chatAccessSync.js`                   |
| Push-уведомления мессенджера    | `server/services/messengerPush.js`, `public/sw.js`    |

## 12. Section -> API Mapping

### 12.1 API-эндпоинты по разделам

| Раздел          | Чтение | Запись |
|-----------------|--------|--------|
| `overview`      | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId`, `PUT /api/clients/:clientId` |
| `questionnaire` | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId`, `POST /api/import-questionnaire` |
| `nutrition`     | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `menu`          | `GET /api/menu/dishes`, `GET /api/clients/:clientId/menu` | `POST/PATCH/DELETE /api/menu/dishes/*`, `POST/PATCH/DELETE /api/clients/:clientId/menu/items/*`, `POST /api/clients/:clientId/menu/copy` |
| `protocol`      | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `injections`    | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `analytics`     | `GET /api/clients`, `GET /api/clients/:clientId`, `GET /api/clients/:clientId/analytics-files` | `PUT /api/clients/:clientId/analytics`, `POST /api/import-analytics`, `POST/PATCH/DELETE /api/clients/:clientId/analytics-files/*`, `GET /api/clients/:clientId/analytics-files/:id/download` |
| `lab`           | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `journal`       | `GET /api/clients/:clientId/journal`, `GET /api/journal/badges`, `GET /api/admin/journal/checklist-template` (admin) | `POST /api/clients/:clientId/journal/items`, `PATCH/DELETE /api/clients/:clientId/journal/items/:itemId`, `POST /api/clients/:clientId/journal/items/:itemId/comments`, `POST /api/clients/:clientId/journal/stages/:stageId/checklist/initialize`, `POST/PATCH/DELETE /api/admin/journal/checklist-template/*` (admin) |
| `messenger`     | `GET /api/chats`, `GET /api/chats/:id/messages`, `GET /api/chats/:id/files/:fileId`, `GET /api/messenger/sync` | `POST /api/chats`, `POST /api/chats/:id/messages`, `POST /api/chats/:id/files`, `PATCH/DELETE /api/chats/:id/messages/:messageId`, `POST /api/chats/:id/read`, `POST/DELETE /api/chats/:id/participants/*`, `POST/DELETE /api/messenger/devices/*` |

### 12.2 Field mapping для `PATCH /api/clients/:clientId`

- `overview`:
- `name`, `shortName`, `dob`, `age`, `sex`, `avatar`, `color`
- `stages[*].title`, `stages[*].subtitle`, `stages[*].doctor`, `stages[*].doctorRole`
- `stages[*].dateStart`, `stages[*].dateEnd`, `stages[*].status`
- `stages[*].email`, `stages[*].phone`, `stages[*].city`
- `stages[*].height`, `stages[*].weightCurrent`, `stages[*].weightGoal`, `stages[*].bmi`, `stages[*].waist`
- `stages[*].tasks`, `stages[*].syndromes`, `stages[*].diagnoses`, `stages[*].deficits`, `stages[*].autoDeficitSelection`
- `questionnaire`: `stages[*].questionnaire`
- `nutrition`: `stages[*].nutrition`, `stages[*].nutritionRevisions`
- `protocol`: `stages[*].protocolRevisions`
- `injections`: `stages[*].injectionSchedule`
- `lab`: `stages[*].labOrderSelected`, `stages[*].labOrderGroupOrder`
- ~~`journal`: `stages[*].journal`~~ — выведено из общего PATCH-гейта; CRM-журнал использует выделенные роуты `/api/clients/:clientId/journal/*` (см. 12.1). Legacy `stages[*].journal` в payload игнорируется новым кодом, мигрируется через `verifyJournalBackfill.js`.

Примечание: `analytics` отделён в специализированный endpoint `PUT /api/clients/:clientId/analytics`, поэтому не должен проходить через общий PATCH-гейт итерации 4.

Примечание: `menu` не хранится внутри JSON клиента и не проходит через общий `PATCH /api/clients/:clientId`. База блюд хранится в `dishes`, недельные меню — в `client_weekly_menus`, позиции меню — в `client_menu_items` со ссылкой на `dish_id` и индивидуальными правками конкретного клиента.

### 12.3 Политика блокировок PATCH/PUT (реализовано)

- Если в `PATCH` встречается путь поля из секции без `write`, сервер отклоняет **весь** запрос.
- Частичное применение патча не используется (atomic fail-fast).
- Формат ошибок:
- `403 PATCH_FORBIDDEN_PATHS` + `deniedPaths`
- `400 PATCH_UNKNOWN_PATHS` + `unknownPaths`
- Для `PUT /api/clients/:clientId` сервер вычисляет затронутые секции и отклоняет запрос при отсутствии `write` в любой из них (`403 PUT_FORBIDDEN_SECTIONS`).

## 13. One-Line Log

- Файл: `CHANGELOG_ONE_LINE.md`.
- Назначение: короткая хронология изменений в формате «1 строка = 1 изменение».
- Формат записи: `YYYY-MM-DD | область | изменение`.

## 14. Messenger Snapshot (2026-05-07)

### 14.1 Доменная модель

**Чаты (`chats`)**
- Клиентский чат: `client_id` ссылается на карточку клиента.
- Внутренний чат: `is_internal = true`, `client_id = NULL` — чат между сотрудниками без привязки к клиенту.
- `icon` — emoji-иконка чата (только у внутренних чатов).

**Участники (`chat_participants`)**
- `role_in_chat`: `owner` / `member`.
- `encrypted_chat_key` — совместимый legacy-мост; активный flow больше не требует клиентских E2E chat-ключей.
- `is_pinned` — закрепление чата у конкретного участника.

**Сообщения (`messages`)**
- `encrypted_text`, `encrypted_meta`, `msg_type`, `file_id` — активные поля серверного шифрования; `ciphertext`/`iv` оставлены только как legacy compatibility alias в SQL-ответах.
- `edited_at` — время последнего редактирования (NULL если не редактировалось).
- `deleted_for_all` / `deleted_for_all_at` / `deleted_by` — удаление у всех участников.

**Остальные таблицы**
- Персональное скрытие: `message_hidden_for_users` (удаление "у себя").
- Подтверждения чтения: `message_receipts` (`last_read_message_id`), UI-статус "✓✓".
- Файлы: `chat_files` + бинарный `.enc` файл на диске (`server/uploads/chat`).

**Пользователи**
- `users.display_name` — отображаемое имя (при пустом значении используется `username`).
- `user_public_keys` сохранена для совместимости со старым E2E-flow, но не участвует в активной отправке/чтении сообщений.

### 14.2 Криптоконтур

Messenger uses server-side AES-256-GCM encryption. Old E2E key bundles are no longer part of the active messenger flow.

- Клиент отправляет/получает plain payload через REST/WS, а сервер шифрует `messages.encrypted_text`, `messages.encrypted_meta` и файлы перед записью.
- `MESSENGER_ENCRYPTION_SECRET` — обязательный production-секрет минимум 32 символа.
- Password change больше не требует перешифровки E2E-bundle.
- Push payload не содержит текст сообщения; уведомление открывает `/app/messenger`.

**Синхронизация доступа** (`server/services/chatAccessSync.js`):
- При изменении прав пользователя (роль, `all_clients_access`, `client_assignments`) сервер автоматически добавляет / удаляет участника из чатов.

**Локальный cache/offline**:
- `src/utils/messengerCache.js` хранит последние 30 дней сообщений, открытые файлы и pending queue в IndexedDB с user-scoped ключами.
- `src/context/MessengerContext.jsx` восстанавливает pending-сообщения после перезагрузки и повторяет отправку после reconnect/online.

### 14.3 Ограничения и права (клиентская роль)

- Роль `viewer` отображается как "Клиент"; совместимость с `client` сохранена в `permissions.js`.
- Для клиентской роли принудительно оставлен доступ только к разделу `messenger` (миграция в `initSchema`).
- Клиент **не может**: создавать чаты, добавлять участников, получать список всех аккаунтов (`GET /api/users` вернёт 403).
- Клиент **может**: видеть только чаты, где он участник; писать, отправлять файлы/фото, редактировать и удалять свои сообщения.

### 14.4 Внутренние чаты (is_internal)

- Создаются без привязки к клиенту: `{ isInternal: true }` в запросе `POST /api/chats`.
- Только владелец чата (`role_in_chat = 'owner'`) и admin могут изменять `title` и `icon`.
- Синхронизация участников по правам клиентов **не применяется** — состав управляется вручную.

### 14.5 UX-функции мессенджера

- Контекстное меню сообщения: переслать, редактировать (только text), удалить у себя / у всех.
- Закрепление чата: `is_pinned` у участника — закреплённые чаты всплывают в топ списка.
- Пакетная отправка файлов: grouped bundles; для фото — максимум 10 фото в одном сообщении.
- Если отправлено >10 фото, формируются несколько сообщений-бандлов (пример: 14 = 10 + 4).
- Фото-бандлы отображаются как адаптивная сетка превью (без имён фото), файлы — списком с именами.
- Overlay просмотр фото: открытие без скачивания, навигация клавишами `ArrowLeft/ArrowRight` и кнопками.

## 15. Journal CRM Snapshot (2026-05-28)

### 15.1 Доменная модель

- `journal_items` — единая таблица задач/событий/заметок: `type IN ('task','event','note')`, `status IN ('open','in_progress','waiting_client','done','cancelled')`. Note всегда `status='done'`. Soft delete (`deleted_at`, `deleted_by`, `delete_reason`). Поля `due_date DATE` + `due_time TIME`, `assignee_user_id` или `is_team_task`, `priority`, JSON `metadata_json`, FK на `clients(id) CASCADE`, `stages(id) SET NULL`, `journal_checklist_template_items(id) SET NULL`.
- `journal_comments` — треды комментариев к item-у, FK CASCADE на item.
- `journal_checklist_template_items` — admin-управляемый шаблон чек-листа; новые этапы инициализируются из активных пунктов через `POST .../checklist/initialize`. Soft delete через `active=false`.
- `journal_notification_deliveries` — `UNIQUE(user_id, kind, delivery_key)` для дедупликации push: `kind='digest'` (key=YYYY-MM-DD), `kind='exact'` (key=`itemId:date:time`).

### 15.2 Stage ID translation

Frontend видит `stage.id` как 1, 2, 3… (это `stages.stage_num`, см. `clientStore.js`). Внутри `journal_items.stage_id` хранится реальный `stages.id` (PK). Хранилище `journalStore.js` транслирует туда/обратно: helper `resolveStageDbId(clientId, stageNum)` для входа, JOIN на `stages` с возвратом `stage_num` для выхода. Роуты и UI работают только в стейдж-нумерации фронтенда.

### 15.3 Permissions

- Раздел `journal` подчиняется обычному `role_sections` (`requireSectionRead/Write("journal")`).
- Дополнительно — `canAccessClient(user, clientId)` (extracted в `services/clientAccess.js`).
- Admin-only роуты шаблона: `requireAuth("admin")` без section gate.
- Backfill `role_sections` for `journal` идёт при `initSchema()` для апгрейдов с pre-journal БД (`viewer` остаётся без доступа).

### 15.4 Push reminders

Используется общий путь доставки `messengerPush.sendPushToUsers({ userIds, title, body, url })`, тот же, что у мессенджера. Планировщик `startJournalNotificationScheduler` (5-минутный интервал, immediate tick):

- `runJournalExactReminders` — каждый тик: ищет открытые task/event с прошедшим due_date+due_time, шлёт push с URL `/?cid=<id>&sec=journal`, пишет delivery для дедупа.
- `runJournalDigest` — раз в день при `hours===9 && minutes<5`: per-user `На сегодня и просрочено: N`, URL `/`.

Service worker (`public/sw.js`) роутит клики по `payload.url`; messenger fallback `/app/messenger` сохранён.

### 15.5 Verify scripts

- `npm run verify:journal-rules` — pure JS helpers.
- `npm run verify:journal-frontend-static` — статические проверки UI/API wrapper.
- `npm run verify:journal-notifications` — статические проверки сервиса+sw.
- `npm --prefix server run smoke:journal-store` — DB smoke (нужен живой PG).
- `npm --prefix server run verify:journal-backfill` — миграция legacy (нужен живой PG).
- `npm --prefix server run verify:messenger-reset` — guard включает все journal-таблицы.
- `npm run verify:journal-api` / `verify:journal-checklist` — runtime API smoke (нужны env: `JOURNAL_TEST_TOKEN`, `JOURNAL_ADMIN_TOKEN`, `JOURNAL_TEST_CLIENT_ID`, `JOURNAL_TEST_STAGE_ID`).
