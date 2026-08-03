#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="$repo_root/.github/workflows/deploy.yml"
deploy="$repo_root/deploy.sh"
compose="$repo_root/docker-compose.yml"

grep -Eq '^[[:space:]]+envs:.*CARD_INTEREST_HMAC_SECRET' "$workflow"
grep -Fq 'CARD_INTEREST_HMAC_SECRET: ${{ secrets.CARD_INTEREST_HMAC_SECRET }}' "$workflow"
grep -Fq 'require_env CARD_INTEREST_HMAC_SECRET "${CARD_INTEREST_HMAC_SECRET:-}"' "$deploy"
grep -Fq 'upsert_env .env CARD_INTEREST_HMAC_SECRET "$CARD_INTEREST_HMAC_SECRET"' "$deploy"
grep -Fq 'CARD_INTEREST_HMAC_SECRET: ${CARD_INTEREST_HMAC_SECRET}' "$compose"

require_line="$(grep -nF 'require_env CARD_INTEREST_HMAC_SECRET "${CARD_INTEREST_HMAC_SECRET:-}"' "$deploy" | head -1 | cut -d: -f1)"
truncate_line="$(grep -nF ': > .env' "$deploy" | head -1 | cut -d: -f1)"

if (( require_line >= truncate_line )); then
  echo "CARD_INTEREST_HMAC_SECRET must be validated before .env is replaced" >&2
  exit 1
fi

echo "card-interest secret deployment contract: PASS"
