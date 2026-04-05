# 2life Dashboard v3

Веб-приложение для ведения карт клиентов 2life.

Текущая версия работает на:
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
- Контейнеризация: Docker Compose (`frontend` + `server` + `db`)

Подробная архитектура: `ARCHITECTURE.md`.

Короткий журнал изменений (1 строка на изменение): `CHANGELOG_ONE_LINE.md`.

## RBAC (роли и права)

- Конфиг ролей хранится в PostgreSQL: `roles`, `role_sections`, `role_permissions`.
- Итоговые права роли собираются сервером в `server /services/permissions.js`.
- `GET /api/auth/me` возвращает `{ ok, user, permissions }`, где `permissions` имеет вид:

```json
{
  "sections": {
    "overview": { "read": true, "write": true }
  },
  "canDeleteClient": false,
  "canCreateClient": true,
  "canImportData": false,
  "isAdmin": false
}
```

- Для `admin` сервер всегда возвращает полный доступ ко всем разделам и действиям.
- Если у роли нет `read` по разделу — раздел не отображается в боковом меню.
- Если у роли есть `read`, но нет `write` — раздел виден в режиме только просмотра (read-only), без возможности редактирования.
- Для `PATCH /api/clients/:id` включён строгий atomic-режим: если есть запрещённые поля, отклоняется весь запрос (`PATCH_FORBIDDEN_PATHS`).
- Для `PUT /api/clients/:id` сервер проверяет затронутые секции и отклоняет запрос при отсутствии `write` (`PUT_FORBIDDEN_SECTIONS`).
- В `PUT /api/admin/roles/:id/sections` исправлено частичное сохранение прав: при изменении одного флага (`read` или `write`) второй не сбрасывается.
- Админ-панель видит только пользователь с ролью `admin`; пользователи с `all_clients_access` получают доступ ко всем клиентам, но не к админке.

## Доступ к клиентам и привязка врача

- Привязка врача к аккаунту хранится в БД: `doctors.user_id`.
- Назначения клиентов пользователям хранятся в `client_assignments`.
- При сохранении клиента сервер автоматически назначает доступ связанным врачам (по имени врача в этапах).
- Дополнительно есть флаг `users.all_clients_access` — полный доступ ко всем клиентам без роли `admin`.
- Админка показывает актуальный список клиентов, назначенных выбранному пользователю.

## Что такое `package.json` и `package-lock.json`

В проекте это не «данные приложения», а технические файлы npm:
- `package.json` — список зависимостей и npm-скриптов (`dev`, `build`, `start` и т.д.).
- `package-lock.json` — точные версии зависимостей, чтобы у всех ставилось одинаково.

Почему их две пары:
- В корне (`/`) — для frontend.
- В папке `server ` — для backend.

Зачем это нужно:
- одинаковая установка пакетов у всех разработчиков и на CI;
- предсказуемые сборки и деплой;
- понимание стека проекта

## Быстрый старт (рекомендуется): Docker

### 1. Подготовить `.env`

Скопируйте пример и задайте значения:

```bash
cp .env.example .env
```

Минимально обязательно поменять:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ADMIN_PASSWORD`

### 2. Запустить все сервисы

```bash
docker compose up -d --build
```

После запуска приложение доступно на:
- `http://localhost:${PORT}` (по умолчанию `http://localhost:80`)

### 3. Войти под админом

Дефолтный логин/пароль берутся из `.env`:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

## Что поднимает Docker Compose

- `db` — PostgreSQL 16
- `server` — API на Node.js (порт внутри сети Docker: `3001`)
- `frontend` — Nginx, раздача React и проксирование `/api/*` на `server`

Постоянные данные:
- `postgres_data` — данные PostgreSQL
- `server_data` — SQL-бэкапы PostgreSQL (`pg_dump`)

## Локальная разработка без Docker

### Требования

- Node.js 20+
- PostgreSQL 16+

### 1. Запуск backend

```bash
cd "server "
npm install
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/2life"
export JWT_SECRET="change-me"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="admin123"
npm start
```

### 2. Запуск frontend (во втором терминале)

```bash
cd /path/to/2life-dashboard
npm install
npm run dev
```

Frontend в dev-режиме откроется на `http://localhost:3000`.

## Деплой на VPS/выделенный сервер

Базовый сценарий:
1. Установить Docker + Docker Compose Plugin на сервер.
2. Скопировать проект.
3. Создать `.env` с безопасными секретами.
4. Выполнить `docker compose up -d --build`.
5. Привязать домен к IP сервера.
6. Настроить HTTPS (например, через reverse proxy + Let's Encrypt).

Для серверов в РФ процесс тот же, если на сервере доступны Docker-образы и DNS.

## Production checklist

- Задать сильные значения `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`.
- Использовать HTTPS (TLS) перед выдачей доступа сотрудникам.
- Ограничить внешние порты (обычно только `80/443`).
- Настроить регулярные внешние бэкапы (не только локальный Docker volume).
- Периодически обновлять образы и зависимости.

## Полезные команды

```bash
# Статус контейнеров
docker compose ps

# Логи
docker compose logs -f server
docker compose logs -f frontend
docker compose logs -f db

# Перезапуск после изменений
docker compose up -d --build

# Остановка
docker compose down
```

## Важно про путь `server `

Папка backend в проекте называется `server ` (с пробелом в конце).  
В shell-командах используйте кавычки: `cd "server "`.
