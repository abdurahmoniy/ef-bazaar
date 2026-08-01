#!/bin/bash
# ==============================================================
# efbazaar DB ni yaratadi va schema'ni qo'llaydi.
# Postgres container ishlab turishi shart.
#   docker compose up -d postgres
# ==============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SCHEMA_DIR="$PROJECT_ROOT/infra/postgres/efbazaar"
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

# Har bir V*.sql idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS), shuning
# uchun Flyway kerak emas — skriptni istalgan vaqtda qayta ishga tushirsa bo'ladi.
# Tartib muhim: `sort -V` V2 ni V10 dan oldin qo'yadi.
for schema_file in $(ls "$SCHEMA_DIR"/V*.sql | sort -V); do
    echo "==> Applying $(basename "$schema_file")..."
    docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$schema_file"
done

echo "==> Done. Tables:"
docker exec "$CONTAINER" psql -U "$PG_USER" -d "$DB_NAME" -c "\dt"
