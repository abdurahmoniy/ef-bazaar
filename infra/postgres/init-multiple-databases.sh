#!/bin/bash
# ==============================================================
# Postgres init script — bir necha DB yaratadi (har servisga bitta).
# Docker postgres image avtomatik /docker-entrypoint-initdb.d/ ichidagi
# .sh va .sql fayllarni birinchi marta ishga tushganda bajaradi.
# ==============================================================
set -e
set -u

create_db_if_not_exists() {
    local db=$1
    echo "  Creating database '$db' (if not exists)..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        SELECT 'CREATE DATABASE $db'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
        create_db_if_not_exists "$db"
    done
    echo "Multiple databases created."
fi
