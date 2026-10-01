#!/usr/bin/env bash
# marketplace_db.dream_teams → recommendation_db.dream_teams.
#
# Takrorlansa zararsiz: bir foydalanuvchi uchun YANGIROQ updated_at g'olib.
# B deploy'dan keyin bir marta, C (frontend) deploy'idan oldin yana bir marta
# ishga tushiriladi — oradagi o'zgarishlar ham o'tadi.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DB="${MARKETPLACE_DB_NAME:-marketplace_db}"
DST_DB="${RECOMMENDATION_DB_NAME:-recommendation_db}"
PG_CONTAINER="${PG_CONTAINER:-efbazaar-postgres}"

read -r -d '' SCRIPT <<'SH' || true
set -eu
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$SRC_DB" \
  -c "\copy (SELECT id, user_id, name, formation, slots, created_at, updated_at FROM dream_teams) TO STDOUT WITH CSV" \
| psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DST_DB" \
  -c "CREATE TEMP TABLE incoming (LIKE dream_teams)" \
  -c "\copy incoming FROM STDIN WITH CSV" \
  -c "INSERT INTO dream_teams SELECT * FROM incoming
      ON CONFLICT (user_id) DO UPDATE
         SET id = EXCLUDED.id, name = EXCLUDED.name, formation = EXCLUDED.formation,
             slots = EXCLUDED.slots, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
       WHERE dream_teams.updated_at < EXCLUDED.updated_at" \
  -c "SELECT (SELECT count(*) FROM incoming) AS marketplace_rows, (SELECT count(*) FROM dream_teams) AS recommendation_rows"
SH

docker exec -i -e SRC_DB="$SRC_DB" -e DST_DB="$DST_DB" "$PG_CONTAINER" sh -c "$SCRIPT"
