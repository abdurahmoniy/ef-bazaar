#!/usr/bin/env bash
# Bir xil player filtri uchun marketplace va recommendation natijasini solishtiradi (ID to'plami).
# Tartib ataylab solishtirilmaydi: marketplace teng ballarni created_at bilan, recommendation
# value_score bilan ajratadi (B rejasi, P2).
#
#   scripts/rec-compare-match.sh '<efhubId>:<playerId>:N' ['<efhubId>:<playerId>:P' ...] [-s 4]
#
# Kerak: curl, jq. Default host https://efbazaar.uz (BASE_URL bilan o'zgartiriladi).
set -euo pipefail

BASE_URL="${BASE_URL:-https://efbazaar.uz}"
STRICTNESS=4
CARDS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s) STRICTNESS="$2"; shift 2 ;;
    *)  CARDS+=("$1"); shift ;;
  esac
done
[[ ${#CARDS[@]} -gt 0 ]] || { echo "kamida bitta matchCard kerak" >&2; exit 2; }

QS="matchStrictness=$STRICTNESS"
for c in "${CARDS[@]}"; do QS+="&matchCard=$(jq -rn --arg v "$c" '$v|@uri')"; done

market=$(curl -fsS "$BASE_URL/api/marketplace/v1/listings?$QS&size=1000" | jq -r '.content[].id' | sort)
rec=$(curl -fsS "$BASE_URL/api/rec/v1/match?$QS" | jq -r '.ids[]' | sort)

echo "marketplace: $(printf '%s' "$market" | grep -c . || true)  recommendation: $(printf '%s' "$rec" | grep -c . || true)"
if diff <(printf '%s\n' "$market") <(printf '%s\n' "$rec") >/dev/null; then
  echo "OK — ID to'plamlari bir xil"
else
  echo "FARQ (< faqat marketplace, > faqat recommendation):"
  diff <(printf '%s\n' "$market") <(printf '%s\n' "$rec") || true
  exit 1
fi
