#!/usr/bin/env bash
# ==============================================================
# Smart deploy — Docker Compose'ning o'zi qaysi servis o'zgarganini
# aniqlaydi va faqat shularni qayta yaratadi.
#
# Strategiya:
#   1. .env CI secret'laridan yoziladi (har deploy'da yangilanadi)
#   2. GHCR login
#   3. Barcha image'lar pull qilinadi (idempotent — yangimi yo'qmi, docker o'zi biladi)
#   4. `docker compose up -d` chaqiriladi:
#        - image SHA o'zgargan kontaynerlar recreate
#        - config (env/volume/command) o'zgargan kontaynerlar recreate
#        - boshqalar tinch qoladi (no-op)
#
# Manual override:
#   FORCE_ALL=1 bash deploy.sh  → hamma narsa qayta yaratiladi
# ==============================================================
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

cd "${DEPLOY_PATH:-/opt/efbazaar}"

FORCE_ALL="${FORCE_ALL:-0}"

# ─── Helpers ────────────────────────────────────────────────────────────────

upsert_env() {
  local file="$1" key="$2" val="$3"
  [[ -f "$file" ]] || : > "$file"
  KEY="$key" VAL="$val" awk '
    BEGIN { k=ENVIRON["KEY"]; v=ENVIRON["VAL"]; seen=0 }
    $0 ~ "^"k"=" { print k"="v; seen=1; next }
    { print }
    END { if (!seen) print k"="v }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

assert_safe_for_env() {
  local key="$1" val="$2"
  if [[ "$val" == *'$'* ]]; then
    echo "!! $key contains '\$' — docker-compose will interpolate it. Use a value without \$." >&2
    exit 1
  fi
}

require_env() {
  local key="$1" val="$2"
  if [[ -z "$val" ]]; then
    echo "!! $key must be configured" >&2
    return 1
  fi
}

# ─── Sync .env from CI secrets ──────────────────────────────────────────────
write_env() {
  require_env CARD_INTEREST_HMAC_SECRET "${CARD_INTEREST_HMAC_SECRET:-}"
  require_env INTERNAL_API_SECRET "${INTERNAL_API_SECRET:-}"
  assert_safe_for_env CARD_INTEREST_HMAC_SECRET "$CARD_INTEREST_HMAC_SECRET"
  assert_safe_for_env INTERNAL_API_SECRET "$INTERNAL_API_SECRET"
  echo "==> Writing .env from CI secrets"
  : > .env

  upsert_env .env IMAGE_REGISTRY   "${IMAGE_REGISTRY:-ghcr.io}"
  upsert_env .env IMAGE_NAMESPACE  "${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}"
  upsert_env .env IMAGE_TAG        "${IMAGE_TAG:-latest}"

  upsert_env .env POSTGRES_USER     efbazaar
  if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
    assert_safe_for_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
    upsert_env .env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  fi
  upsert_env .env POSTGRES_HOST              postgres
  upsert_env .env POSTGRES_PORT              5432
  upsert_env .env AUTH_DB_NAME               auth_db
  upsert_env .env MARKETPLACE_DB_NAME        marketplace_db
  upsert_env .env RECOMMENDATION_DB_NAME     recommendation_db
  upsert_env .env TRADE_DB_NAME              trade_db
  upsert_env .env PAYMENT_DB_NAME            payment_db

  upsert_env .env REDIS_HOST                 redis
  upsert_env .env REDIS_PORT                 6379
  if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    assert_safe_for_env REDIS_PASSWORD "$REDIS_PASSWORD"
    upsert_env .env REDIS_PASSWORD "$REDIS_PASSWORD"
  fi

  upsert_env .env KAFKA_BOOTSTRAP_SERVERS    kafka:9092

  if [[ -n "${JWT_SECRET:-}" ]]; then
    assert_safe_for_env JWT_SECRET "$JWT_SECRET"
    upsert_env .env JWT_SECRET "$JWT_SECRET"
  fi
  upsert_env .env JWT_ACCESS_TOKEN_TTL_MINUTES   15
  upsert_env .env JWT_REFRESH_TOKEN_TTL_DAYS     30
  upsert_env .env CARD_INTEREST_HMAC_SECRET "$CARD_INTEREST_HMAC_SECRET"

  upsert_env .env TELEGRAM_BOT_TOKEN          "${TELEGRAM_BOT_TOKEN:-}"
  upsert_env .env TELEGRAM_BOT_USERNAME       "${TELEGRAM_BOT_USERNAME:-}"
  upsert_env .env TELEGRAM_GROUP_CHAT_ID      "${TELEGRAM_GROUP_CHAT_ID:-}"
  upsert_env .env TELEGRAM_TOPIC_LOGS         "${TELEGRAM_TOPIC_LOGS:-6}"
  upsert_env .env TELEGRAM_TOPIC_REGISTRATION "${TELEGRAM_TOPIC_REGISTRATION:-4}"
  upsert_env .env TELEGRAM_TOPIC_MEDIA        "${TELEGRAM_TOPIC_MEDIA:-2}"
  # No default: an unset payments topic means "do not announce", and a wrong
  # number would put user ids into somebody else's thread.
  upsert_env .env TELEGRAM_TOPIC_PAYMENTS     "${TELEGRAM_TOPIC_PAYMENTS:-}"
  upsert_env .env TELEGRAM_TOPIC_EMAIL        "${TELEGRAM_TOPIC_EMAIL:-}"
  upsert_env .env TELEGRAM_WEBHOOK_URL        "${TELEGRAM_WEBHOOK_URL:-}"
  upsert_env .env TELEGRAM_WEBHOOK_SECRET     "${TELEGRAM_WEBHOOK_SECRET:-}"

  # humo-userbot — MTProto *user* session credentials (my.telegram.org).
  # TELEGRAM_API_ID / TELEGRAM_API_HASH are required Settings fields with no
  # default: left blank the container crash-loops at import instead of
  # starting a client that could never authenticate.
  upsert_env .env TELEGRAM_API_ID             "${TELEGRAM_API_ID:-}"
  upsert_env .env TELEGRAM_API_HASH           "${TELEGRAM_API_HASH:-}"
  upsert_env .env HUMO_SOURCE_CHAT            "${HUMO_SOURCE_CHAT:-humocardbot}"

  upsert_env .env MEDIA_MIN_FILES         1
  upsert_env .env MEDIA_MAX_FILES         6
  upsert_env .env MEDIA_MAX_FILE_SIZE_MB  5
  upsert_env .env MEDIA_ALLOWED_TYPES     "image/jpeg,image/png,image/webp,image/heic,image/heif"

  upsert_env .env SPRING_PROFILES_ACTIVE  docker
  upsert_env .env APP_BASE_URL            "${APP_BASE_URL:-}"

  upsert_env .env NGINX_HTTP_PORT         "${NGINX_HTTP_PORT:-80}"
  upsert_env .env NGINX_HTTPS_PORT        "${NGINX_HTTPS_PORT:-443}"

  # Google OAuth — ID token flow uses only client_id (audience check on backend,
  # browser GIS init on frontend). Client secret is NOT needed for this flow.
  upsert_env .env GOOGLE_CLIENT_ID        "${GOOGLE_CLIENT_ID:-}"

  # Server-to-server shared secret. nginx injects it as X-Internal-Secret on
  # /api/tournaments/** (Chempionat-X header-auth), and auth/marketplace guard
  # their /internal/** with it. Blank → header-auth fail-closed. Must equal
  # Chempionat-X's EFBAZAAR_INTERNAL_SECRET.
  upsert_env .env INTERNAL_API_SECRET "$INTERNAL_API_SECRET"

  chmod 600 .env
  echo "==> .env written ($(wc -l < .env) lines)"
}

# ─── Sync ops-bot (host-level systemd service) ──────────────────────────────
#
# ops-bot host'da systemd ostida ishlaydi — docker'sizdan tashqarida.
# `sudo bash infra/ops-bot/install.sh` bilan bir marta qo'lda o'rnatilgan bo'lishi shart.
# Har deploy'da bu funksiya:
#   1. .env fayl'ni CI secretlaridan yozadi
#   2. systemd unit yangilangan bo'lsa /etc/systemd/system'ga ko'chiradi
#   3. servisni restart qiladi
sync_ops_bot() {
  local dir="infra/ops-bot"
  local env_file="$dir/.env"
  local svc="efbazaar-ops-bot.service"
  local unit_src="$dir/ops-bot.service"
  local unit_dst="/etc/systemd/system/$svc"

  if [[ ! -f "$unit_src" ]]; then
    echo "==> $unit_src topilmadi — ops-bot deploy o'tkazib yuborildi"
    return 0
  fi

  # 1. .env yozish (CI env'dan)
  echo "==> Writing $env_file from CI secrets"
  : > "$env_file"
  upsert_env "$env_file" OPS_BOT_TOKEN          "${OPS_BOT_TOKEN:-}"
  upsert_env "$env_file" TELEGRAM_GROUP_CHAT_ID "${TELEGRAM_GROUP_CHAT_ID:-}"
  upsert_env "$env_file" TELEGRAM_TOPIC_LOGS    "${TELEGRAM_TOPIC_LOGS:-6}"
  upsert_env "$env_file" TELEGRAM_TOPIC_HEALTH  "${TELEGRAM_TOPIC_HEALTH:-}"
  upsert_env "$env_file" CONTAINER_PREFIX       "efbazaar-"
  chmod 600 "$env_file"

  # OPS_BOT_TOKEN yo'q bo'lsa — deploy'ni davom ettiramiz, lekin ops-botni jimlashamiz
  if [[ -z "${OPS_BOT_TOKEN:-}" ]]; then
    echo "==> OPS_BOT_TOKEN bo'sh — ops-bot restart'i o'tkazib yuborildi"
    return 0
  fi

  # 2. Systemd unit yangimi — /etc/systemd/system'dagi bilan solishtiramiz
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "==> systemd yo'q — ops-bot restart o'tkazib yuborildi (dev muhitmi?)"
    return 0
  fi

  local reload_needed=0
  if [[ ! -f "$unit_dst" ]] || ! cmp -s "$unit_src" "$unit_dst"; then
    echo "==> ops-bot.service o'zgargan — /etc/systemd'ga ko'chirilyapti"
    sudo cp "$unit_src" "$unit_dst"
    reload_needed=1
  fi
  if [[ "$reload_needed" == "1" ]]; then
    sudo systemctl daemon-reload
  fi

  # 3. Restart — .env, script, yoki unit o'zgargan bo'lishi mumkin. Har deploy'da restart
  #    qilaverish xavfsizroq (idempotent). ops-bot stateless.
  echo "==> Restarting $svc"
  sudo systemctl restart "$svc"
  sleep 2
  sudo systemctl is-active "$svc" || {
    echo "!! ops-bot ishga tushmadi — journalctl ko'ring: journalctl -u $svc -n 50"
    return 1
  }
  echo "==> ops-bot ✓"
}

# ─── Sync backup timer (systemd oneshot + timer) ─────────────────────────
#
# Har deploy'da:
#   1. .env yoziladi (secretlardan)
#   2. Unit fayllar yangilangan bo'lsa ko'chiriladi + daemon-reload
#   3. Timer restart qilinadi (o'zgargan OnCalendar effektiv bo'lishi uchun)
sync_backup() {
  local dir="infra/backup"
  local env_file="$dir/.env"
  local svc="efbazaar-backup.service"
  local tmr="efbazaar-backup.timer"

  if [[ ! -f "$dir/$tmr" ]]; then
    return 0
  fi

  # 1. .env
  echo "==> Writing $env_file from CI secrets"
  : > "$env_file"
  upsert_env "$env_file" OPS_BOT_TOKEN          "${OPS_BOT_TOKEN:-}"
  upsert_env "$env_file" TELEGRAM_GROUP_CHAT_ID "${TELEGRAM_GROUP_CHAT_ID:-}"
  upsert_env "$env_file" TELEGRAM_TOPIC_BACKUPS "${TELEGRAM_TOPIC_BACKUPS:-}"
  upsert_env "$env_file" TELEGRAM_TOPIC_HEALTH  "${TELEGRAM_TOPIC_HEALTH:-}"
  upsert_env "$env_file" BACKUP_PASSPHRASE      "${BACKUP_PASSPHRASE:-}"
  upsert_env "$env_file" POSTGRES_CONTAINER     "efbazaar-postgres"
  upsert_env "$env_file" POSTGRES_USER          "${POSTGRES_USER:-efbazaar}"
  upsert_env "$env_file" BACKUP_ROOT            "/var/backups/efbazaar"
  chmod 600 "$env_file"

  if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
    echo "==> BACKUP_PASSPHRASE bo'sh — backup timer restart o'tkazib yuborildi"
    return 0
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    return 0
  fi

  # 2. Unit fayllarni sync qilamiz
  local reload_needed=0
  for u in "$svc" "$tmr"; do
    if [[ ! -f "/etc/systemd/system/$u" ]] || ! cmp -s "$dir/$u" "/etc/systemd/system/$u"; then
      echo "==> $u o'zgargan — /etc/systemd'ga ko'chirilyapti"
      sudo cp "$dir/$u" "/etc/systemd/system/$u"
      reload_needed=1
    fi
  done
  if [[ "$reload_needed" == "1" ]]; then
    sudo systemctl daemon-reload
    sudo systemctl restart "$tmr"
  fi

  sudo systemctl is-active "$tmr" >/dev/null 2>&1 || {
    echo "!! backup timer active emas — journalctl -u $tmr ko'ring"
    return 1
  }
  echo "==> backup timer ✓"
}

# ─── GHCR login ─────────────────────────────────────────────────────────────
ghcr_login() {
  if [[ -z "${GH_TOKEN:-}" || -z "${GH_ACTOR:-}" ]]; then
    echo "==> GH_TOKEN/GH_ACTOR not set — skipping GHCR login (public images only)"
    return 0
  fi
  echo "==> Logging into GHCR as $GH_ACTOR"
  echo "$GH_TOKEN" | docker login ghcr.io -u "$GH_ACTOR" --password-stdin
}

# ─── DB password sync ───────────────────────────────────────────────────────
sync_db_password() {
  if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
    echo "==> POSTGRES_PASSWORD not provided — skipping role password sync"
    return 0
  fi

  echo "==> Waiting for postgres to accept connections"
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  echo "==> Syncing postgres role 'efbazaar' password from secret"
  local escaped_pw="${POSTGRES_PASSWORD//\'/\'\'}"
  docker compose exec -T postgres \
    psql -U efbazaar -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER USER \"efbazaar\" WITH PASSWORD '$escaped_pw';"
  echo "==> DB password sync OK"
}

# ─── DB creation helper ─────────────────────────────────────────────────────
# postgres' MULTIPLE_DATABASES init script only fires on a fresh data volume,
# so on this long-lived server we create per-service databases ourselves if
# missing. Idempotent, safe to run every deploy. Shared by trade_bootstrap
# and payment_bootstrap.
# ─────────────────────────────────────────────────────────────────────────────
ensure_db() {
  local db_name="$1"

  # Only proceed with DB creation if postgres is running.
  if ! docker compose ps --services --filter status=running | grep -q '^postgres$'; then
    echo "!! postgres not running — skipping $db_name check"
    return 0
  fi

  # `psql -lqt` lists databases; column 1 is the name. Trim whitespace + grep exact.
  if docker compose exec -T postgres psql -U efbazaar -lqt 2>/dev/null \
       | awk -F'|' '{gsub(/ /,"",$1); print $1}' \
       | grep -qx "$db_name"; then
    return 0
  fi

  echo "==> Creating $db_name (missing — first-run bootstrap)"
  docker compose exec -T postgres createdb -U efbazaar "$db_name"
}

# ─── Trade-service bootstrap ────────────────────────────────────────────────
# Idempotent, first-run bootstrap for trade-service. Safe to run every deploy.
#
#   1. master_key (32 raw bytes, base64) — used to derive AES-256-GCM keys for
#      PAN, CVV, and mailbox-password at-rest encryption. Generated ONCE per
#      environment; rotating it makes all previously-encrypted data unreadable.
#   2. trade_db — see ensure_db above.
# ─────────────────────────────────────────────────────────────────────────────
trade_bootstrap() {
  local key_file="infra/secrets/master_key"
  local trade_db="${TRADE_DB_NAME:-trade_db}"

  if [[ ! -s "$key_file" ]]; then
    echo "==> Generating $key_file (first-run bootstrap)"
    mkdir -p "$(dirname "$key_file")"
    chmod 700 "$(dirname "$key_file")"
    openssl rand -base64 32 > "$key_file"
    echo "!! NEW master_key generated at $key_file"
    echo "!! Back this file up NOW. Rotating it destroys previously-encrypted data."
  fi

  # File mode 0644 (owner rw, others r) so Docker's tmpfs mount at
  # /run/secrets/master_key is world-readable inside the container, letting
  # the non-root `app` user read it. The containing directory is 0700 so
  # only root can even list it on the host — the file's mode matters only
  # for the docker-daemon-mediated mount, not for host visibility.
  chmod 644 "$key_file"
  chmod 700 "$(dirname "$key_file")" 2>/dev/null || true

  ensure_db "$trade_db"
}

# ─── Payment-service bootstrap ──────────────────────────────────────────────
# Idempotent, first-run bootstrap for payment-service. Safe to run every
# deploy.
#
#   payment_db — see ensure_db above. payment-service reuses trade-service's
#   master_key (already provisioned by trade_bootstrap), so no secret
#   handling is needed here.
# ─────────────────────────────────────────────────────────────────────────────
payment_bootstrap() {
  local payment_db="${PAYMENT_DB_NAME:-payment_db}"

  ensure_db "$payment_db"
}

# ─── Smart-admin-worker bootstrap ──────────────────────────────────────────
# Writes mailcow_api_key from the CI-injected env var (same pattern as
# master_key). If the env var is empty we leave any existing file untouched
# so operators can still bootstrap manually — but a missing file without a
# secret is a hard error, mirroring the previous behaviour.
# Safe to run every deploy; idempotent.
# ────────────────────────────────────────────────────────────────────────────
sa_worker_bootstrap() {
  local key_file="infra/secrets/mailcow_api_key"
  mkdir -p "$(dirname "$key_file")"
  chmod 700 "$(dirname "$key_file")" 2>/dev/null || true

  if [[ -n "${MAILCOW_API_KEY:-}" ]]; then
    # Content changed? Rewrite; otherwise no-op to avoid noisy mtime updates.
    if [[ ! -f "$key_file" ]] || ! printf '%s' "$MAILCOW_API_KEY" | cmp -s - "$key_file"; then
      echo "==> Writing $key_file from CI secret"
      printf '%s' "$MAILCOW_API_KEY" > "$key_file"
    fi
  else
    echo "==> MAILCOW_API_KEY not set in env — keeping existing $key_file (if any)"
  fi

  if [[ ! -s "$key_file" ]]; then
    echo "ERROR: $key_file is missing. Set MAILCOW_API_KEY as a CI secret, or generate one in Mailcow admin (Configuration → Access → API) and write it to that file, one line, no quotes."
    return 1
  fi

  # File mode 0644 — same rationale as master_key: docker's tmpfs mount at
  # /run/secrets/mailcow_api_key is world-readable inside the container so the
  # non-root app user can read it; the containing directory is 0700 so only
  # root can list it on the host.
  chmod 644 "$key_file"
  chmod 700 "$(dirname "$key_file")" 2>/dev/null || true
}

# ─── Diff: qaysi kontaynerlar recreate bo'ladi (informational only) ─────────
report_changes() {
  echo "==> Checking which services have image/config changes"
  # docker compose up --dry-run faqat compose v2.22+
  if docker compose up -d --dry-run 2>&1 | grep -E "Recreate|Create|Start" | sed 's/^/    /'; then
    :
  else
    echo "    (dry-run unsupported on this compose version — skipping preview)"
  fi
}

# Read one variable from a container without writing its value to the deploy log.
container_env_value() {
  local container="$1" key="$2"
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" \
    | awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }'
}

verify_internal_api_secret() {
  local trade_secret payment_secret
  trade_secret="$(container_env_value efbazaar-trade INTERNAL_API_SECRET)"
  payment_secret="$(container_env_value efbazaar-payment INTERNAL_API_SECRET)"

  if [[ -z "$trade_secret" || -z "$payment_secret" ]]; then
    echo "!! INTERNAL_API_SECRET missing from trade-service or payment-service" >&2
    return 1
  fi
  if [[ "$trade_secret" != "$payment_secret" ]]; then
    echo "!! trade/payment INTERNAL_API_SECRET mismatch" >&2
    return 1
  fi
  echo "==> trade/payment INTERNAL_API_SECRET present and matching"
}

# ─── Main flow ──────────────────────────────────────────────────────────────

write_env
ghcr_login

echo "==> Pulling latest images (idempotent — only changed layers downloaded)"
docker compose pull

# Postgres'ni alohida ko'taramiz parol sync uchun.
docker compose up -d postgres
sync_db_password
trade_bootstrap
payment_bootstrap
sa_worker_bootstrap

# Force-all override
RECREATE_FLAG=""
if [[ "$FORCE_ALL" == "1" ]]; then
  echo "==> FORCE_ALL=1 — recreating ALL services regardless of changes"
  RECREATE_FLAG="--force-recreate"
fi

# Docker compose o'zi qaror qiladi:
# - image SHA o'zgargan → recreate
# - config (env/volume/command) o'zgargan → recreate
# - boshqalar — tinch qoladi
echo "==> docker compose up -d (smart recreate)"
docker compose up -d --remove-orphans $RECREATE_FLAG
verify_internal_api_secret

# Nginx config validatsiya (agar nginx ishlaganda)
if docker compose ps --services --filter status=running | grep -q '^nginx$'; then
  echo "==> Validating nginx config"
  docker compose exec -T nginx nginx -t || true
fi

echo "==> Pruning dangling images"
docker image prune -f >/dev/null || true

# Host-level ops-bot (systemd) — infra/ops-bot/ o'zgarsa restart, .env qayta yozadi
sync_ops_bot || echo "!! ops-bot sync failed (non-fatal)"
sync_backup  || echo "!! backup sync failed (non-fatal)"

echo "==> Done."
docker compose ps
