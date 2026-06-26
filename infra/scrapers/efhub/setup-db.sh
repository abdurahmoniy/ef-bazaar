#!/bin/bash
# ==============================================================
# efbazaar DB ni yaratadi va schema'ni qo'llaydi.
# Postgres container ishlab turishi shart.
#   docker compose up -d postgres
# ==============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SCHEMA="$PROJECT_ROOT/infra/postgres/efbazaar/V1__init_player_cards.sql"
DB_NAME="${EFBAZAAR_DB_NAME:-efbazaar}"
CONTAINER="${POSTGRES_CONTAINER:-efbazaar-postgres}"

# .env dan POSTGRES_USER ni olamiz
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a; . "$PROJECT_ROOT/.env"; set +a
fi
PG_USER="${POSTGRES_USER:-efbazaar}"

echo "==> Creating '$DB_NAME' database (if not exists)..."
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $DB_NAME"

echo "==> Applying schema..."
docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$DB_NAME" < "$SCHEMA"

echo "==> Done. Tables:"
docker exec "$CONTAINER" psql -U "$PG_USER" -d "$DB_NAME" -c "\dt"
