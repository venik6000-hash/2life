#!/usr/bin/env bash
set -e

# ─── Цвета ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
error()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ─── Docker ──────────────────────────────────────────────────────────────────
if ! docker info &>/dev/null 2>&1; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    info "Запускаю Docker Desktop..."
    open -a Docker
    printf "${CYAN}▸ Жду Docker${NC}"
    until docker info &>/dev/null 2>&1; do sleep 1; printf "."; done
    echo
  else
    error "Docker не запущен. Запустите: sudo systemctl start docker"
  fi
fi
success "Docker запущен"

# ─── .env ────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env создан из примера — задайте секреты и запустите снова:"
    echo
    echo "  nano .env   # или любой редактор"
    echo
    echo "  Обязательно поменять:"
    echo "    POSTGRES_PASSWORD=<пароль БД>"
    echo "    JWT_SECRET=<минимум 64 случайных символа>"
    echo "    ADMIN_PASSWORD=<пароль администратора>"
    echo
    echo "  Сгенерировать JWT_SECRET:"
    echo "    node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    echo
    exit 0
  else
    error ".env не найден и .env.example тоже отсутствует"
  fi
fi
success ".env найден"

# ─── Запуск ───────────────────────────────────────────────────────────────────
info "Собираю и запускаю сервисы (db + server + frontend)..."
docker compose up -d --build

# ─── URL ─────────────────────────────────────────────────────────────────────
PORT=$(grep -E '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" | xargs)
PORT=${PORT:-80}

if [ "$PORT" = "80" ]; then
  URL="http://localhost"
else
  URL="http://localhost:${PORT}"
fi

echo
success "Готово! Войдите в браузере:"
echo
echo -e "  ${GREEN}${URL}${NC}"
echo
echo "  Логин/пароль из .env: ADMIN_USERNAME / ADMIN_PASSWORD"
echo
echo "  Статус контейнеров:  docker compose ps"
echo "  Логи сервера:        docker compose logs -f server"
echo "  Остановить:          docker compose down"
