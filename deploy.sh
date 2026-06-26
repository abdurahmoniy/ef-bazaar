#!/usr/bin/env bash
# Selective redeploy — runs on server, invoked by CD workflow.
# Usage:
#   AUTH=1 MARKETPLACE=1 BOT=1 ... bash deploy.sh
#   FORCE_ALL=1 bash deploy.sh   (rebuild everything)
set -euo pipefail

# Non-interactive SSH (GitHub Actions) doesn't source ~/.bashrc, so docker/git
# may be missing from PATH. Set a sane PATH explicitly.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# Force BuildKit so Dockerfiles can use cache mounts (--mount=type=cache,...).
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

cd "${DEPLOY_PATH:-/opt/efbazaar}"

AUTH="${AUTH:-0}"
MARKETPLACE="${MARKETPLACE:-0}"
RECOMMENDATION="${RECOMMENDATION:-0}"
BOT="${BOT:-0}"
FRONTEND="${FRONTEND:-0}"
NGINX="${NGINX:-0}"
COMPOSE="${COMPOSE:-0}"

# If compose/env changed, every build-owning service needs a refresh.
if [[ "$COMPOSE" == "1" ]]; then
  echo "==> compose/env changed — marking all app services for redeploy"
  AUTH=1
  MARKETPLACE=1
  RECOMMENDATION=1
  BOT=1
  FRONTEND=1
  NGINX=1
fi

# ─── Helpers ────────────────────────────────────────────────────────────────

# Update-or-append a key=value pair in an env-style file. Uses awk so the
# value is written as a literal — avoids sed pitfalls with &, |, /, \ in
# secrets, and avoids interpreting backslash escapes.
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

# Build all dirty services in a SINGLE compose invocation. BuildKit then
# schedules them in parallel — much faster than sequential `compose build`.
build_all() {
  local svcs=("$@")
  if [ ${#svcs[@]} -eq 0 ]; then return 0; fi
  echo "==> Building services in parallel: ${svcs[*]}"
  docker compose build --progress=plain "${svcs[@]}"
}

rebuild() {
  local svc="$1"
  local recreate=""
  [[ "$COMPOSE" == "1" ]] && recreate="--force-recreate"
  echo "==> Restarting $svc (--no-deps, keeps postgres/redis/kafka untouched)"
  docker compose up -d --no-deps $recreate "$svc"
}

# Reject characters that docker-compose would interpolate in .env values.
# A literal '$' triggers ${VAR} expansion at compose-parse time.
assert_safe_for_env() {
  local key="$1" val="$2"
  if [[ "$val" == *'$'* ]]; then
    echo "!! $key contains '\$' — docker-compose will interpolate it. Use a value without \$." >&2
    exit 1
  fi
}

# ─── Sync .env from CI secrets ──────────────────────────────────────────────
#
# Every deploy rewrites .env so password rotations / topic ID changes etc.
# take effect on the next compose restart of dependent services.
write_env() {
  echo "==> Writing .env from CI secrets"
  : > .env

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

  # JWT (auth-service)
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

  # Media uploads
  upsert_env .env MEDIA_MIN_FILES         1
  upsert_env .env MEDIA_MAX_FILES         6
  upsert_env .env MEDIA_MAX_FILE_SIZE_MB  5
  upsert_env .env MEDIA_ALLOWED_TYPES     "image/jpeg,image/png,image/webp"

  # App
  upsert_env .env SPRING_PROFILES_ACTIVE  docker
  upsert_env .env APP_BASE_URL            "${APP_BASE_URL:-}"

  chmod 600 .env
  echo "==> .env written ($(wc -l < .env) lines)"
}

# ─── Sync the live postgres role password ──────────────────────────────────
#
# The password baked into the postgres data volume is set ONCE on first init
# and ignores later .env changes. After rotating POSTGRES_PASSWORD in CI
# secrets, the running role still has the old value. We ALTER USER inside the
# live container so the volume password matches the new secret.
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
  docker compose exec -T postgres \
    psql -U postgres -v ON_ERROR_STOP=1 \
      -c "DO \$\$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'efbazaar') THEN
              CREATE ROLE \"efbazaar\" WITH LOGIN PASSWORD '$escaped_pw';
            ELSE
              ALTER USER \"efbazaar\" WITH PASSWORD '$escaped_pw';
            END IF;
          END \$\$;"
  echo "==> DB password sync OK"
}

# ─── Main flow ──────────────────────────────────────────────────────────────

write_env

# If postgres is already running, sync its role password to the new .env
# value before app services try to connect with stale credentials.
if docker compose ps --services --filter status=running 2>/dev/null | grep -q '^postgres$'; then
  sync_db_password
fi

# Collect dirty services into a single build invocation (parallel via BuildKit).
dirty=()
[[ "$AUTH"           == "1" ]] && dirty+=(auth-service)
[[ "$MARKETPLACE"    == "1" ]] && dirty+=(marketplace-service)
[[ "$RECOMMENDATION" == "1" ]] && dirty+=(recommendation-service)
[[ "$BOT"            == "1" ]] && dirty+=(bot)
[[ "$FRONTEND"       == "1" ]] && dirty+=(frontend)
[[ "$NGINX"          == "1" ]] && dirty+=(nginx)

build_all "${dirty[@]}"

# Restart in dependency order (auth before others — they use /verify).
[[ "$AUTH"           == "1" ]] && rebuild auth-service
[[ "$MARKETPLACE"    == "1" ]] && rebuild marketplace-service
[[ "$RECOMMENDATION" == "1" ]] && rebuild recommendation-service
[[ "$BOT"            == "1" ]] && rebuild bot
[[ "$FRONTEND"       == "1" ]] && rebuild frontend

# nginx reads config from bind-mounted file. After git reset/pull, nginx.conf
# may be replaced atomically (new inode), so plain `up -d` can keep serving
# the old mounted inode. Always force-recreate nginx to rebind updated config.
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
