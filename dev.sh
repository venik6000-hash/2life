#!/usr/bin/env bash
set -e

# Load .env so POSTGRES_PASSWORD is available in this shell
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Dev DB runs on port 5434 to avoid conflicts with other projects
export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5434/2life"

# Stop production server/frontend containers so port 3001 is free for local nodemon
echo "Stopping production containers (freeing port 3001)..."
docker compose stop server frontend 2>/dev/null || true

echo "Starting dev database..."
docker compose -f docker-compose.dev.yml up -d

echo "Waiting for PostgreSQL to be ready..."
until docker compose -f docker-compose.dev.yml exec -T db pg_isready -U postgres -d 2life -q; do
  sleep 1
done
echo "PostgreSQL is ready."

# Install server deps if needed
if [ ! -d server/node_modules ]; then
  echo "Installing server dependencies..."
  npm --prefix server install
fi

# Run Vite and nodemon in parallel
npx concurrently \
  --names "vite,server" \
  --prefix-colors "cyan,yellow" \
  "vite" \
  "npm --prefix server run dev"
