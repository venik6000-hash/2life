# 2life Dashboard

Веб-приложение для ведения карт клиентов 2life.

**Стек:** React + Vite · Node.js + Express · PostgreSQL · Docker Compose · Nginx

---

## Быстрый старт

### Первый запуск

```bash
./start.sh
```

Скрипт сам запустит Docker (macOS), проверит `.env` и поднимет все сервисы.
Если `.env` ещё не создан — скрипт создаст его из примера и покажет, что заполнить.

**После настройки `.env` запустите снова:**

```bash
./start.sh
```

Откроется на **http://localhost** (или на порту из `PORT=` в `.env`).
Войдите под логином из `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

---

### Что делает `./start.sh`

1. Запускает Docker, если он не запущен (macOS: открывает Docker Desktop)
2. Проверяет наличие `.env`, при необходимости создаёт из примера
3. Выполняет `docker compose up -d --build`
4. Печатает адрес, логин и полезные команды

---

### Обновление (после `git pull`)

```bash
git pull && docker compose up -d --build
```

База данных обновляется автоматически при старте сервера — все изменения схемы аддитивны (`CREATE TABLE IF NOT EXISTS`), данные не затрагиваются.

---

## Что поднимает Docker Compose

| Сервис     | Роль                              | Порт на хосте       |
|------------|-----------------------------------|---------------------|
| `db`       | PostgreSQL 16                     | —                   |
| `server`   | Node.js API                       | `127.0.0.1:3001`    |
| `frontend` | Nginx (React + проксирование API) | `${PORT:-80}`       |

**Volumes:**
- `postgres_data` — данные PostgreSQL (не удаляются при перезапуске)
- `server_data` — SQL-бэкапы, загруженные файлы

---

## Локальная разработка без Docker

Требования: Node.js 20+, PostgreSQL 16+.

Можно поднять только БД через Docker и работать с сервером/фронтендом нативно:

```bash
# 1. Только база данных
docker compose -f docker-compose.dev.yml up -d

# 2. Backend (отдельный терминал)
cd server
npm install
cp ../.env .env   # или задайте переменные вручную
npm run dev

# 3. Frontend (отдельный терминал)
npm install
npm run dev       # http://localhost:3000
```

---

## Полезные команды

```bash
# Статус контейнеров
docker compose ps

# Логи в реальном времени
docker compose logs -f server
docker compose logs -f frontend

# Перезапуск после изменений кода
docker compose up -d --build

# Остановить всё (данные сохраняются)
docker compose down

# Удалить данные БД (необратимо!)
docker compose down -v
```

---

## Деплой на VPS

1. Установить Docker + Docker Compose Plugin
2. Склонировать репозиторий
3. Создать `.env` с безопасными секретами (см. `.env.example`)
4. `docker compose up -d --build`
5. Настроить reverse proxy + HTTPS (nginx / Caddy + Let's Encrypt)

**Production checklist:**
- Сильные пароли в `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`
- HTTPS перед выдачей доступа сотрудникам
- Внешние бэкапы (не только Docker volume)
- Закрыть все порты, кроме 80/443

---

## Структура проекта

```
├── src/                # React-фронтенд
├── server/             # Node.js API
│   ├── routes/         # Express-маршруты
│   ├── services/       # БД, хранилище, бэкап
│   └── uploads/        # Загружаемые файлы (чат, анализы)
├── docker-compose.yml      # Production
├── docker-compose.dev.yml  # Только БД для разработки
├── start.sh            # Быстрый старт
└── .env.example        # Шаблон переменных окружения
```

Подробная архитектура: [`ARCHITECTURE.md`](ARCHITECTURE.md)
