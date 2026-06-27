#!/usr/bin/env bash
# Selective redeploy — runs on server, invoked by CD workflow.
#
# Bu pull-based deploy: image lar GHCR'da CI tomonidan build qilingan.
# Server faqat docker pull qiladi va kontaynerlarni qayta yaratadi.
#
# Usage:
#   AUTH=1 MARKETPLACE=1 BOT=1 ... bash deploy.sh
#   FORCE_ALL=1 bash deploy.sh
set -euo pipefail

# Non-interactive SSH (GitHub Actions) doesn't source ~/.bashrc — set PATH.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

cd "${DEPLOY_PATH:-/opt/efbazaar}"

AUTH="${AUTH:-0}"
MARKETPLACE="${MARKETPLACE:-0}"
RECOMMENDATION="${RECOMMENDATION:-0}"
BOT="${BOT:-0}"
FRONTEND="${FRONTEND:-0}"
NGINX="${NGINX:-0}"
COMPOSE="${COMPOSE:-0}"
FORCE_ALL="${FORCE_ALL:-0}"

# FORCE_ALL=1 yoki COMPOSE=1 → barcha (default profile) servislar qayta yaratiladi.
# NOTE: recommendation-service `extra` profile'da — default'da o'tkazib yuboriladi.
if [[ "$COMPOSE" == "1" || "$FORCE_ALL" == "1" ]]; then
  echo "==> COMPOSE/FORCE_ALL — marking all default-profile services for redeploy"
  AUTH=1
  MARKETPLACE=1
  BOT=1
  FRONTEND=1
  NGINX=1
  COMPOSE=1   # restart_service'da --force-recreate qilinishi uchun
fi

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

  # Image source — defaults bo'lsa /opt/efbazaar/docker-compose.yml ichida
  upsert_env .env IMAGE_REGISTRY   "${IMAGE_REGISTRY:-ghcr.io}"
  upsert_env .env IMAGE_NAMESPACE  "${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}"
  upsert_env .env IMAGE_TAG        "${IMAGE_TAG:-latest}"

  # Postgres
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

  # Redis
  upsert_env .env REDIS_HOST                 redis
  upsert_env .env REDIS_PORT                 6379
  if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    assert_safe_for_env REDIS_PASSWORD "$REDIS_PASSWORD"
    upsert_env .env REDIS_PASSWORD "$REDIS_PASSWORD"
  fi

  # Kafka
  upsert_env .env KAFKA_BOOTSTRAP_SERVERS    kafka:9092

  # JWT
  if [[ -n "${JWT_SECRET:-}" ]]; then
    assert_safe_for_env JWT_SECRET "$JWT_SECRET"
    upsert_env .env JWT_SECRET "$JWT_SECRET"
  fi
  upsert_env .env JWT_ACCESS_TOKEN_TTL_MINUTES   15
  upsert_env .env JWT_REFRESH_TOKEN_TTL_DAYS     30

  # Telegram
  upsert_env .env TELEGRAM_BOT_TOKEN          "${TELEGRAM_BOT_TOKEN:-}"
  upsert_env .env TELEGRAM_BOT_USERNAME       "${TELEGRAM_BOT_USERNAME:-}"
  upsert_env .env TELEGRAM_GROUP_CHAT_ID      "${TELEGRAM_GROUP_CHAT_ID:-}"
  upsert_env .env TELEGRAM_TOPIC_LOGS         "${TELEGRAM_TOPIC_LOGS:-6}"
  upsert_env .env TELEGRAM_TOPIC_REGISTRATION "${TELEGRAM_TOPIC_REGISTRATION:-4}"
  upsert_env .env TELEGRAM_TOPIC_MEDIA        "${TELEGRAM_TOPIC_MEDIA:-2}"
  upsert_env .env TELEGRAM_WEBHOOK_URL        "${TELEGRAM_WEBHOOK_URL:-}"

  # Media
  upsert_env .env MEDIA_MIN_FILES         1
  upsert_env .env MEDIA_MAX_FILES         6
  upsert_env .env MEDIA_MAX_FILE_SIZE_MB  5
  upsert_env .env MEDIA_ALLOWED_TYPES     "image/jpeg,image/png,image/webp"

  upsert_env .env SPRING_PROFILES_ACTIVE  docker
  upsert_env .env APP_BASE_URL            "${APP_BASE_URL:-}"

  # Host ports — server'da port band bo'lsa, NGINX_HTTP_PORT='8090' bering.
  upsert_env .env NGINX_HTTP_PORT         "${NGINX_HTTP_PORT:-80}"
  upsert_env .env NGINX_HTTPS_PORT        "${NGINX_HTTPS_PORT:-443}"

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

# ─── Pull + restart helpers ─────────────────────────────────────────────────
pull_services() {
  local svcs=("$@")
  if [ ${#svcs[@]} -eq 0 ]; then return 0; fi
  echo "==> Pulling images in parallel: ${svcs[*]}"
  docker compose pull "${svcs[@]}"
}

restart_service() {
  local svc="$1"
  local recreate=""
  [[ "$COMPOSE" == "1" ]] && recreate="--force-recreate"
  echo "==> Restarting $svc (--no-deps)"
  docker compose up -d --no-deps $recreate "$svc"
}

# ─── DB password sync ───────────────────────────────────────────────────────
sync_db_password() {
  if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
    echo "==> POSTGRES_PASSWORD not provided — skipping role password sync"
    return 0
  fi

  if ! docker compose ps --services --filter status=running | grep -q '^postgres$'; then
    echo "==> postgres not running — starting it for password sync"
    docker compose up -d postgres
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
  # Postgres image POSTGRES_USER=efbazaar bilan boshlanadi — 'postgres' roli yo'q.
  # Local socket (pg_hba: trust) orqali efbazaar superuser sifatida ulanamiz.
  docker compose exec -T postgres \
    psql -U efbazaar -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER USER \"efbazaar\" WITH PASSWORD '$escaped_pw';"
  echo "==> DB password sync OK"
}

# ─── Main flow ──────────────────────────────────────────────────────────────

write_env
ghcr_login

# Always pull infra images (idempotent, fast). Boshlash uchun postgres/redis/kafka shart.
echo "==> Ensuring infra services are up"
docker compose up -d postgres redis kafka

# Postgres running bo'lsa — parolni sync qilamiz.
if docker compose ps --services --filter status=running 2>/dev/null | grep -q '^postgres$'; then
  sync_db_password
fi

# Collect dirty services (faqat o'zgargan/force qilingan).
dirty=()
[[ "$AUTH"           == "1" ]] && dirty+=(auth-service)
[[ "$MARKETPLACE"    == "1" ]] && dirty+=(marketplace-service)
[[ "$RECOMMENDATION" == "1" ]] && dirty+=(recommendation-service)
[[ "$BOT"            == "1" ]] && dirty+=(bot)
[[ "$FRONTEND"       == "1" ]] && dirty+=(frontend)
[[ "$NGINX"          == "1" ]] && dirty+=(nginx)

pull_services "${dirty[@]}"

# Restart in dependency order.
[[ "$AUTH"           == "1" ]] && restart_service auth-service
[[ "$MARKETPLACE"    == "1" ]] && restart_service marketplace-service
[[ "$RECOMMENDATION" == "1" ]] && restart_service recommendation-service
[[ "$BOT"            == "1" ]] && restart_service bot
[[ "$FRONTEND"       == "1" ]] && restart_service frontend

# nginx bind-mounted conf — force recreate
if [[ "$NGINX" == "1" ]]; then
  echo "==> Recreating nginx to pick up latest bind-mounted config"
  docker compose up -d --no-deps --force-recreate nginx
  echo "==> Validating nginx config inside container"
  docker compose exec -T nginx nginx -t
fi

echo "==> Pruning dangling images"
docker image prune -f >/dev/null || true

echo "==> Done."
docker compose ps
