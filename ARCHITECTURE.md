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
- `src/context/MessengerContext.jsx` — E2E-ключи, WS-соединение, чаты/сообщения/файлы.
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
6. SSE (`GET /api/events`) доставляет изменения остальным открытым вкладкам в реальном времени.

## 4. Разделы дашборда (`SECTIONS` в DashboardContext)

| id              | Иконка | Название    | Компонент              |
|-----------------|--------|-------------|------------------------|
| `overview`      | ◉      | Обзор       | `Overview.jsx`         |
| `questionnaire` | 📋     | Анкета      | `Questionnaire.jsx`    |
| `nutrition`     | 🥗     | Питание     | `Nutrition.jsx`        |
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
- Подключает роутеры: `auth`, `clients`, `doctors`, `import`, `admin`, `messenger`.
- Запускает авто-бэкап (`startAutoBackup`).
- Поднимает WebSocket сервер (`/ws`) через `services/ws.js`.

### Хранилище: PostgreSQL
- `services/db.js` — `pg.Pool`, DDL-схема, все SQL-запросы.
- Таблицы: `users`, `doctors`, `clients`, `stages`, `analytics_categories`, `analytics_markers`, `analytics_values`, `journal_entries`, `protocol_revisions`, `nutrition_revisions`, `activity_log`, `roles`, `role_sections`, `role_permissions`, `reference_data`, `client_assignments`.
- `DATABASE_URL` (env) или `postgresql://postgres:postgres@localhost:5432/2life` по умолчанию.

### Роуты (`routes/`)

| Файл         | Префикс          | Назначение                                      |
|--------------|------------------|-------------------------------------------------|
| `auth.js`    | `/api/auth`, `/api/admin/users` | Login, `/me`, смена своего пароля, admin-управление пользователями |
| `clients.js` | `/api/clients`   | CRUD клиентов и этапов, SSE-поток               |
| `doctors.js` | `/api/doctors`   | Список врачей для UI + bulk-сохранение реестра (admin) |
| `import.js`  | `/api/import-questionnaire`, `/api/import-analytics` | Загрузка Excel (анкета, анализы) |
| `admin.js`   | `/api/admin`     | Роли, права, справочники, CRUD врачей, активность, статистика |
| `messenger.js` | `/api/chats`, `/api/crypto`, `/api/users` | Чаты, участники, сообщения, файлы, ключи E2E |

### Сервисы (`services/`)

| Файл             | Назначение                                              |
|------------------|---------------------------------------------------------|
| `db.js`          | PostgreSQL Pool + все SQL-функции                       |
| `clientStore.js` | Бизнес-логика работы с клиентами поверх db              |
| `storage.js`     | Файловая система: пути, ensureDir, sameJson             |
| `backup.js`      | Авто-бэкап БД по расписанию                            |
| `logger.js`      | Запись действий в таблицу `activity_log`                |
| `permissions.js` | Получение прав роли (`getPermissionsForRole`)           |
| `setup.js`       | Инициализация дефолтных данных при первом запуске       |
| `sse.js`         | Server-Sent Events: `addConnection`, `broadcast`        |
| `ws.js`          | WebSocket-хаб мессенджера: маршрутизация событий по участникам |
| `wsTickets.js`   | Одноразовые WS-тикеты (30 сек) для browser WebSocket-аутентификации |

### Middleware (`middleware/`)
- `auth.js`:
- `requireAuth(role?)` — проверка JWT, опциональная проверка роли.
- `requirePermission(permissionId)` — проверка action-права (`create_client`, `delete_client`, `import_data`).
- `requireSectionRead(sectionId)` / `requireSectionWrite(sectionId)` — проверка read/write по разделу.
- `requireAnySectionRead()` / `requireAnySectionWrite()` — агрегированная проверка доступа хотя бы к одному разделу.

## 6. Аутентификация и права

- JWT хранится в `localStorage` (`dash_token`), передаётся через `Authorization: Bearer`.
- `AuthContext` предоставляет `authFetch` — обёртка над `fetch` с токеном.
- Роли: `admin` + кастомные. Права задаются в `role_sections` (read/write по разделу) и `role_permissions`.
- `AdminSection` доступна только роли `admin`.

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

- Клиентские разделы дашборда: `GET /api/events` (SSE) для синхронизации карточек клиентов.
- Мессенджер: `GET /api/auth/ws-ticket` → `ws://.../ws?ticket=...` (WebSocket).
- События мессенджера: `new_message`, `message_edited`, `message_deleted_all`, `message_deleted_self`, `receipts_update`, `participant_added`, `participant_removed`, `chat_created`.
- Сообщение, отправленное одним участником, доставляется всем участникам чата (включая отправителя для multi-device).

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
| Крипто-утилиты мессенджера      | `src/utils/crypto.js`, `src/utils/cryptoSession.js` |
| UI мессенджера                  | `src/components/Messenger*.jsx`, `src/sections/Messenger.jsx`, `src/context/MessengerContext.jsx` |
| Роли и права (UI)               | `src/components/AdminSectionPanel.jsx`, `src/sections/AdminSection.jsx` |

## 12. Section -> API Mapping

### 12.1 API-эндпоинты по разделам

| Раздел          | Чтение | Запись |
|-----------------|--------|--------|
| `overview`      | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId`, `PUT /api/clients/:clientId` |
| `questionnaire` | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId`, `POST /api/import-questionnaire` |
| `nutrition`     | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `protocol`      | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `injections`    | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `analytics`     | `GET /api/clients`, `GET /api/clients/:clientId` | `PUT /api/clients/:clientId/analytics`, `POST /api/import-analytics` |
| `lab`           | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `journal`       | `GET /api/clients`, `GET /api/clients/:clientId` | `PATCH /api/clients/:clientId` |
| `messenger`     | `GET /api/chats`, `GET /api/chats/:id/messages`, `GET /api/chats/:id/files/:fileId` | `POST /api/chats`, `POST /api/chats/:id/messages`, `POST /api/chats/:id/files`, `PATCH/DELETE /api/chats/:id/messages/:messageId`, `POST /api/chats/:id/read`, `POST/DELETE /api/chats/:id/participants/*` |

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
- `journal`: `stages[*].journal`

Примечание: `analytics` отделён в специализированный endpoint `PUT /api/clients/:clientId/analytics`, поэтому не должен проходить через общий PATCH-гейт итерации 4.

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

## 14. Messenger Snapshot (2026-04-14)

### 14.1 Доменная модель
- Один чат привязан к одной карточке клиента: `chats.client_id`.
- Участники: `chat_participants` (`owner`/`member`) + `encrypted_chat_key` для каждого участника.
- Сообщения: `messages` (`ciphertext`, `iv`, `msg_type`, `file_id`, `edited_at`, `deleted_for_all`).
- Персональное скрытие: `message_hidden_for_users` (удаление "у себя").
- Подтверждения чтения: `message_receipts` (`last_read_message_id`), UI-статус "✓✓".
- Файлы: `chat_files` + бинарный `.enc` файл на диске (`server/uploads/chat`).
- Публичные ключи пользователей: `user_public_keys`.

### 14.2 Криптоконтур (frontend)
- `src/utils/crypto.js`: ECDH P-256 (identity), AES-KW (обёртка ключа чата), AES-GCM (сообщения/файлы).
- Приватный identity key шифруется паролем пользователя (PBKDF2 + AES-GCM) и хранится на сервере только в зашифрованном виде.
- Сервер не расшифровывает содержимое сообщений/файлов; хранит ciphertext + iv и зашифрованные blob.

### 14.3 Ограничения и права (клиентская роль)
- Роль `viewer` отображается как "Клиент"; совместимость с `client` сохранена в `permissions.js`.
- Для клиентской роли принудительно оставлен доступ только к разделу `messenger` (миграция в `initSchema`).
- Клиент не может: создавать чаты, добавлять участников, получать список всех аккаунтов (`GET /api/users` вернёт 403).
- Клиент может: видеть только чаты, где он участник; писать, отправлять файлы/фото, редактировать и удалять свои сообщения.

### 14.4 UX-функции мессенджера
- Контекстное меню сообщения: переслать, редактировать (только text), удалить у себя/у всех.
- Пакетная отправка файлов: grouped bundles; для фото — максимум 10 фото в одном сообщении.
- Если отправлено >10 фото, формируются несколько сообщений-бандлов (пример: 14 = 10 + 4).
- Фото-бандлы отображаются как адаптивная сетка превью (без имён фото), файлы — списком с именами.
- Overlay просмотр фото: открытие без скачивания, навигация клавишами `ArrowLeft/ArrowRight` и кнопками.
