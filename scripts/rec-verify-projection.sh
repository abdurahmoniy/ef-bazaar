#!/usr/bin/env bash
# Replay'dan keyin: marketplace manbasi va recommendation projection'i qatorlar soni bo'yicha.
# Farq bo'lsa 1 bilan chiqadi. Faqat o'qiydi.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DB="${MARKETPLACE_DB_NAME:-marketplace_db}"
DST_DB="${RECOMMENDATION_DB_NAME:-recommendation_db}"
PG_CONTAINER="${PG_CONTAINER:-efbazaar-postgres}"

q() { docker exec -i "$PG_CONTAINER" sh -c "psql -U \"\$POSTGRES_USER\" -d $1 -tAc \"$2\"" || echo "?"; }

check() {
  local name="$1" left="$2" right="$3"
  local status="OK"
  if [[ ! "$left" =~ ^[0-9]+$ || ! "$right" =~ ^[0-9]+$ ]]; then
    status="XATO (so'rov bajarilmadi)"; FAILED=1
  elif [[ "$left" != "$right" ]]; then
    status="FARQ"; FAILED=1
  fi
  printf '%-22s marketplace=%-8s recommendation=%-8s %s\n' "$name" "$left" "$right" "$status"
}

FAILED=0
check "e'lonlar (jami)"   "$(q "$SRC_DB" "SELECT count(*) FROM listings")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM listings_view")"
check "e'lonlar (ACTIVE)" "$(q "$SRC_DB" "SELECT count(*) FROM listings WHERE status = 'ACTIVE'")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM listings_view WHERE status = 'ACTIVE'")"
check "e'lon kartalari"   "$(q "$SRC_DB" "SELECT count(*) FROM listing_cards")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM listing_cards_view")"
check "like'lar"          "$(q "$SRC_DB" "SELECT count(*) FROM listing_likes")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM user_likes WHERE liked")"
echo "kartalar (cards_view): $(q "$DST_DB" "SELECT count(*) FROM cards_view")"
exit "$FAILED"
