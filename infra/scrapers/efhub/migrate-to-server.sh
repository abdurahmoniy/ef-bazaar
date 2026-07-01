#!/bin/bash
# ==============================================================
# Lokal efbazaar DB'ni serverga ko'chiradi (bir martalik seed).
#
# Foydalanish:
#   SERVER=user@example.com ./migrate-to-server.sh
#
# Steplar:
#   1. Lokal'da pg_dump (faqat data, schema serverda alohida qo'llaymiz)
#   2. scp orqali server'ga jo'natamiz
#   3. Server'da schema qo'llanmagan bo'lsa — qo'llaymiz
#   4. pg_restore orqali data'ni yuklaymiz
# ==============================================================
set -euo pipefail

: "${SERVER:?SERVER env var kerak (masalan: SERVER=user@example.com)}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-efbazaar-postgres}"
REMOTE_CONTAINER="${REMOTE_CONTAINER:-efbazaar-postgres}"
DB_NAME="${EFBAZAAR_DB_NAME:-efbazaar}"
DB_USER="${POSTGRES_USER:-efbazaar}"
DUMP_FILE="/tmp/efbazaar_cards_$(date +%Y%m%d_%H%M).dump"

echo "==> [local] pg_dump (data only: bigtime, epic, showtime)"
docker exec "$LOCAL_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --data-only \
    --table=bigtime --table=epic --table=showtime \
    -F c -f "$DUMP_FILE"
docker cp "$LOCAL_CONTAINER:$DUMP_FILE" "$DUMP_FILE"

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "==> dump created: $DUMP_FILE ($SIZE)"

echo "==> [transfer] scp -> $SERVER:/tmp/"
scp "$DUMP_FILE" "$SERVER:/tmp/"

REMOTE_DUMP="/tmp/$(basename "$DUMP_FILE")"
echo "==> [remote] copying into container & restore"
ssh "$SERVER" "set -e
    echo '  -> ensure DB & schema exist'
    docker exec $REMOTE_CONTAINER psql -U $DB_USER -d postgres -tc \
        \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" | grep -q 1 \
        || docker exec $REMOTE_CONTAINER psql -U $DB_USER -d postgres -c \"CREATE DATABASE $DB_NAME\"

    echo '  -> applying schema (idempotent CREATE IF NOT EXISTS)'
    docker exec -i $REMOTE_CONTAINER psql -U $DB_USER -d $DB_NAME \
        < /opt/ef-bazaar/infra/postgres/efbazaar/V1__init_player_cards.sql || true

    echo '  -> copying dump into container'
    docker cp $REMOTE_DUMP $REMOTE_CONTAINER:$REMOTE_DUMP

    echo '  -> pg_restore (data only, disable triggers)'
    docker exec $REMOTE_CONTAINER pg_restore -U $DB_USER -d $DB_NAME \
        --data-only --disable-triggers --no-owner \
        $REMOTE_DUMP

    echo '  -> row counts:'
    docker exec $REMOTE_CONTAINER psql -U $DB_USER -d $DB_NAME -c \
        \"SELECT 'bigtime' AS t, count(*) FROM bigtime UNION ALL SELECT 'epic', count(*) FROM epic UNION ALL SELECT 'showtime', count(*) FROM showtime;\"
"

echo "==> Done. Cleanup local dump? (rm $DUMP_FILE)"
