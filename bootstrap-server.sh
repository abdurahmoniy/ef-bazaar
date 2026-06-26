#!/usr/bin/env bash
# ==============================================================
# efBazaar — Fresh server bootstrap script
#
# Yangi (toza) Ubuntu/Debian droplet'ni deploy uchun tayyorlaydi:
#   - swap, sysctl tuning (2GB RAM uchun)
#   - Docker + Compose plugin
#   - efbazaar useri (docker guruhida, sudo'siz)
#   - SSH deploy key (GitHub Actions uchun)
#   - UFW firewall
#   - /opt/efbazaar + git clone
#
# ROOT sifatida ishga tushiring:
#   curl -fsSL <raw-url>/bootstrap-server.sh | sudo bash
# yoki:
#   sudo bash bootstrap-server.sh
#
# Env override misol:
#   APP_PASSWORD='strong_pw' GITHUB_USER='abdurahmoniy' sudo -E bash bootstrap-server.sh
# ==============================================================
set -euo pipefail

# ─── Config (env override mumkin) ───────────────────────────────────────────
APP_USER="${APP_USER:-efbazaar}"
APP_DIR="${APP_DIR:-/opt/efbazaar}"
REPO_URL="${REPO_URL:-https://github.com/abdurahmoniy/ef-bazaar.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
NGINX_HTTP_PORT="${NGINX_HTTP_PORT:-8090}"
NGINX_HTTPS_PORT="${NGINX_HTTPS_PORT:-8443}"

# Optional — set to skip prompts
APP_PASSWORD="${APP_PASSWORD:-}"          # interactive prompt if empty
GITHUB_USER="${GITHUB_USER:-}"            # if set, imports SSH keys from https://github.com/<user>.keys
EXTRA_PUBKEY="${EXTRA_PUBKEY:-}"          # raw pubkey string to add

DEPLOY_KEY_NAME="${DEPLOY_KEY_NAME:-efbazaar_deploy}"
DEPLOY_KEY_DIR="/root/.ssh"
DEPLOY_KEY_PATH="$DEPLOY_KEY_DIR/$DEPLOY_KEY_NAME"

# ─── Helpers ────────────────────────────────────────────────────────────────
log()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!! \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mXX \033[0m %s\n' "$*" >&2; exit 1; }

sysctl_set() {
  local key="$1" val="$2"
  local file="/etc/sysctl.d/99-efbazaar.conf"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
  sysctl -w "${key}=${val}" >/dev/null
}

# ─── Preconditions ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root (use sudo)."
. /etc/os-release 2>/dev/null || true
[[ "${ID:-}" =~ ^(ubuntu|debian)$ ]] || warn "Untested OS: ${ID:-unknown}. Continuing anyway."

# ─── 1. System update + base packages ───────────────────────────────────────
log "Updating apt & installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  git ufw htop unzip jq tzdata

# ─── 2. Swap + sysctl ───────────────────────────────────────────────────────
if [[ ! -f /swapfile ]]; then
  log "Creating ${SWAP_SIZE_GB}G swap file at /swapfile"
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  if ! grep -q '^/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
else
  log "Swap file already exists — skipping"
fi

log "Applying sysctl tuning (swappiness, overcommit)"
sysctl_set vm.swappiness 10
sysctl_set vm.overcommit_memory 1     # Redis: silently saved bgsave warning'ni o'chiradi
sysctl_set net.core.somaxconn 1024

# ─── 3. Docker + Compose plugin ─────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker CE + Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${ID} $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker already installed — $(docker --version)"
fi

# Configure Docker daemon for memory-constrained host
DAEMON_JSON=/etc/docker/daemon.json
if [[ ! -f $DAEMON_JSON ]] || ! grep -q '"log-opts"' "$DAEMON_JSON"; then
  log "Configuring /etc/docker/daemon.json (log rotation)"
  cat > "$DAEMON_JSON" <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65535,
      "Soft": 65535
    }
  }
}
JSON
  systemctl restart docker
fi

# ─── 4. Create app user ─────────────────────────────────────────────────────
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "Creating user '$APP_USER'"
  adduser --disabled-password --gecos "" "$APP_USER"
else
  log "User '$APP_USER' already exists"
fi
usermod -aG docker "$APP_USER"

# Password
if [[ -n "$APP_PASSWORD" ]]; then
  log "Setting password for '$APP_USER' from APP_PASSWORD env"
  echo "${APP_USER}:${APP_PASSWORD}" | chpasswd
else
  log "Set password for '$APP_USER' (used for 'su - $APP_USER' from root):"
  passwd "$APP_USER"
fi

# ─── 5. SSH keys ────────────────────────────────────────────────────────────
SSH_DIR="/home/$APP_USER/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$SSH_DIR"
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"
chown "$APP_USER:$APP_USER" "$AUTH_KEYS"

# Generate deploy keypair for GitHub Actions if absent
if [[ ! -f "$DEPLOY_KEY_PATH" ]]; then
  log "Generating deploy SSH keypair at $DEPLOY_KEY_PATH (ed25519, no passphrase)"
  install -d -m 700 "$DEPLOY_KEY_DIR"
  ssh-keygen -t ed25519 -N "" -C "efbazaar-deploy@$(hostname)" -f "$DEPLOY_KEY_PATH" >/dev/null
else
  log "Deploy keypair already exists at $DEPLOY_KEY_PATH"
fi

# Authorize deploy pubkey for the app user
DEPLOY_PUB=$(cat "${DEPLOY_KEY_PATH}.pub")
if ! grep -qxF "$DEPLOY_PUB" "$AUTH_KEYS"; then
  echo "$DEPLOY_PUB" >> "$AUTH_KEYS"
fi

# Import keys from GitHub if requested
if [[ -n "$GITHUB_USER" ]]; then
  log "Importing SSH keys for GitHub user '$GITHUB_USER'"
  if keys=$(curl -fsSL "https://github.com/${GITHUB_USER}.keys"); then
    while IFS= read -r k; do
      [[ -z "$k" ]] && continue
      grep -qxF "$k" "$AUTH_KEYS" || echo "$k" >> "$AUTH_KEYS"
    done <<< "$keys"
  else
    warn "Failed to fetch keys from GitHub for '$GITHUB_USER' — skipping"
  fi
fi

# Extra pubkey
if [[ -n "$EXTRA_PUBKEY" ]]; then
  grep -qxF "$EXTRA_PUBKEY" "$AUTH_KEYS" || echo "$EXTRA_PUBKEY" >> "$AUTH_KEYS"
fi

chown "$APP_USER:$APP_USER" "$AUTH_KEYS"

# ─── 6. Firewall ────────────────────────────────────────────────────────────
log "Configuring UFW firewall (allow 22, $NGINX_HTTP_PORT, $NGINX_HTTPS_PORT)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow "${NGINX_HTTP_PORT}/tcp" comment 'efBazaar nginx HTTP'
ufw allow "${NGINX_HTTPS_PORT}/tcp" comment 'efBazaar nginx HTTPS'
ufw --force enable

# ─── 7. App dir + git clone ─────────────────────────────────────────────────
log "Preparing $APP_DIR"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Cloning $REPO_URL → $APP_DIR (branch: $REPO_BRANCH)"
  sudo -u "$APP_USER" git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
else
  log "Repo already cloned — pulling latest"
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$REPO_BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
fi

# ─── 8. Summary ─────────────────────────────────────────────────────────────
SERVER_IP=$(curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DEPLOY_PRIVATE=$(cat "$DEPLOY_KEY_PATH")

cat <<EOF


╔══════════════════════════════════════════════════════════════╗
║  efBazaar server bootstrap COMPLETE                          ║
╠══════════════════════════════════════════════════════════════╣
║  User:        $APP_USER (docker group, no sudo)
║  App dir:     $APP_DIR
║  Server IP:   $SERVER_IP
║  Swap:        ${SWAP_SIZE_GB}G at /swapfile
║  Firewall:    22, $NGINX_HTTP_PORT, $NGINX_HTTPS_PORT open
║  Docker:      $(docker --version | cut -d',' -f1)
╚══════════════════════════════════════════════════════════════╝

────────────────────────────────────────────────────────────────
 1) GITHUB → SETTINGS → SECRETS AND VARIABLES → ACTIONS
    Quyidagilarni qo'shing (Repository secrets):
────────────────────────────────────────────────────────────────

  DEPLOY_HOST            = $SERVER_IP
  DEPLOY_USER            = $APP_USER
  DEPLOY_PATH            = $APP_DIR
  DEPLOY_PORT            = 22
  NGINX_HTTP_PORT        = $NGINX_HTTP_PORT
  NGINX_HTTPS_PORT       = $NGINX_HTTPS_PORT

  POSTGRES_PASSWORD      = <strong random — openssl rand -base64 24>
  REDIS_PASSWORD         = <strong random>
  JWT_SECRET             = <openssl rand -base64 48>
  APP_BASE_URL           = http://$SERVER_IP:$NGINX_HTTP_PORT
  TELEGRAM_BOT_TOKEN     = 8837882150:AAHhwAU45DZSz-0kRiho5TBrMF71NcivUUk
  TELEGRAM_BOT_USERNAME  = EfBazaarBot
  TELEGRAM_GROUP_CHAT_ID = -1004444164596
  TELEGRAM_TOPIC_LOGS    = 6
  TELEGRAM_TOPIC_REGISTRATION = 4
  TELEGRAM_TOPIC_MEDIA   = 2
  TELEGRAM_WEBHOOK_URL   = (bo'sh — long-polling, yoki https://your-domain/bot/webhook)

────────────────────────────────────────────────────────────────
 2) DEPLOY_SSH_KEY (GitHub Actions ushbu kalit bilan SSH qiladi)
────────────────────────────────────────────────────────────────
   QUYIDAGI BLOKNI to'liq nusxa oling va GitHub Secret nomi
   DEPLOY_SSH_KEY ga joylashtiring (BEGIN/END qatorlar bilan):

$DEPLOY_PRIVATE

────────────────────────────────────────────────────────────────
 3) Test (lokaldan):
────────────────────────────────────────────────────────────────
   ssh -i ~/.ssh/efbazaar_deploy $APP_USER@$SERVER_IP "docker ps"

 4) GitHub'da CI — Build & Push images workflow'sini Run qiling.
    Build success bo'lgach, deploy avtomatik ishga tushadi.

EOF

warn "Yuqoridagi DEPLOY_SSH_KEY xavfsiz joylashtirilgach, terminal historysi tozalashni o'ylab ko'ring:"
warn "  history -c && rm -f ~/.bash_history"
