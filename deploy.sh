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

# ─── Sync .env from CI secrets ──────────────────────────────────────────────
write_env() {
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

  upsert_env .env TELEGRAM_BOT_TOKEN          "${TELEGRAM_BOT_TOKEN:-}"
  upsert_env .env TELEGRAM_BOT_USERNAME       "${TELEGRAM_BOT_USERNAME:-}"
  upsert_env .env TELEGRAM_GROUP_CHAT_ID      "${TELEGRAM_GROUP_CHAT_ID:-}"
  upsert_env .env TELEGRAM_TOPIC_LOGS         "${TELEGRAM_TOPIC_LOGS:-6}"
  upsert_env .env TELEGRAM_TOPIC_REGISTRATION "${TELEGRAM_TOPIC_REGISTRATION:-4}"
  upsert_env .env TELEGRAM_TOPIC_MEDIA        "${TELEGRAM_TOPIC_MEDIA:-2}"
  upsert_env .env TELEGRAM_WEBHOOK_URL        "${TELEGRAM_WEBHOOK_URL:-}"

  upsert_env .env MEDIA_MIN_FILES         1
  upsert_env .env MEDIA_MAX_FILES         6
  upsert_env .env MEDIA_MAX_FILE_SIZE_MB  5
  upsert_env .env MEDIA_ALLOWED_TYPES     "image/jpeg,image/png,image/webp"

  upsert_env .env SPRING_PROFILES_ACTIVE  docker
  upsert_env .env APP_BASE_URL            "${APP_BASE_URL:-}"

  upsert_env .env NGINX_HTTP_PORT         "${NGINX_HTTP_PORT:-80}"
  upsert_env .env NGINX_HTTPS_PORT        "${NGINX_HTTPS_PORT:-443}"

  # Google OAuth — ID token flow uses only client_id (audience check on backend,
  # browser GIS init on frontend). Client secret is NOT needed for this flow.
  upsert_env .env GOOGLE_CLIENT_ID        "${GOOGLE_CLIENT_ID:-}"

  chmod 600 .env
  echo "==> .env written ($(wc -l < .env) lines)"
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

# ─── Main flow ──────────────────────────────────────────────────────────────

write_env
ghcr_login

echo "==> Pulling latest images (idempotent — only changed layers downloaded)"
docker compose pull

# Postgres'ni alohida ko'taramiz parol sync uchun.
docker compose up -d postgres
sync_db_password

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

# Nginx config validatsiya (agar nginx ishlaganda)
if docker compose ps --services --filter status=running | grep -q '^nginx$'; then
  echo "==> Validating nginx config"
  docker compose exec -T nginx nginx -t || true
fi

echo "==> Pruning dangling images"
docker image prune -f >/dev/null || true

echo "==> Done."
docker compose ps
