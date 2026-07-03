#!/usr/bin/env bash
# ==============================================================
# ops-bot ni host'da systemd service sifatida o'rnatadi.
#
# BIR MAROTABA (serverni birinchi tayyorlashda) qo'lda:
#   cd /opt/efbazaar
#   sudo bash infra/ops-bot/install.sh
#
# Quyidagilarni qiladi:
#   1. python3 + requests borligini tekshiradi (yo'q bo'lsa o'rnatadi)
#   2. ops-bot.service ni /etc/systemd/system/ ga ko'chiradi
#   3. Deploy user uchun passwordsiz `systemctl restart efbazaar-ops-bot`
#      va shu kabi buyruqlarga sudoers.d ruxsat yaratadi (CI/CD deploy'i
#      sudo talab qilmasin uchun).
#   4. daemon-reload + enable (start emas — .env yo'q bo'lishi mumkin, CI keyin ko'taradi)
#
# .env fayl deploy user'ning egaligida bo'ladi (repo ichida, /opt/efbazaar/infra/ops-bot/.env)
# va CI har deploy'da qayta yozadi.
# ==============================================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SRC_DIR/.env"
UNIT_NAME="efbazaar-ops-bot.service"
UNIT_PATH="/etc/systemd/system/$UNIT_NAME"
SUDOERS_PATH="/etc/sudoers.d/efbazaar-ops-bot"

if [[ $EUID -ne 0 ]]; then
    echo "❌ root sifatida ishga tushiring: sudo bash $0"
    exit 1
fi

# Deploy uchun sudoers'ga qo'shiladigan user — sudo bilan chaqirsangiz SUDO_USER,
# aks holda skript argument sifatida oling.
DEPLOY_USER="${1:-${SUDO_USER:-}}"
if [[ -z "$DEPLOY_USER" || "$DEPLOY_USER" == "root" ]]; then
    echo "⚠  Deploy user root bo'lsa sudoers rule kerak emas — CI to'g'ridan-to'g'ri systemctl chaqira oladi."
    DEPLOY_USER=""
fi

# ─── 1. Python + requests ──────────────────────────────────────────────
echo "==> Checking python3 + requests"
if ! command -v python3 >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update && apt-get install -y python3 python3-requests
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y python3 python3-requests
    else
        echo "❌ Package manager topilmadi. python3 + requests'ni qo'lda o'rnating."
        exit 1
    fi
fi
if ! python3 -c "import requests" 2>/dev/null; then
    if command -v apt-get >/dev/null 2>&1; then
        apt-get install -y python3-requests
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y python3-requests
    else
        pip3 install requests --break-system-packages 2>/dev/null || pip3 install requests
    fi
fi

# ─── 2. Systemd unit ────────────────────────────────────────────────────
echo "==> Installing systemd unit"
cp "$SRC_DIR/ops-bot.service" "$UNIT_PATH"
chmod 644 "$UNIT_PATH"

# ─── 3. Sudoers rule (deploy user uchun) ────────────────────────────────
if [[ -n "$DEPLOY_USER" ]]; then
    # systemctl va cp real yo'lini aniqlaymiz (distro'ga qarab /bin yoki /usr/bin).
    SYSTEMCTL_BIN="$(command -v systemctl)"
    CP_BIN="$(command -v cp)"
    if [[ -z "$SYSTEMCTL_BIN" || -z "$CP_BIN" ]]; then
        echo "❌ systemctl yoki cp topilmadi"
        exit 1
    fi
    echo "==> Writing sudoers rule for '$DEPLOY_USER' (passwordless systemctl for ops-bot)"
    cat > "$SUDOERS_PATH" <<EOF
# efBazaar ops-bot — CI deploy user'ga faqat shu servisni restart qilishga
# passwordsiz ruxsat. Boshqa hech qanday sudo hukuki berilmagan.
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN restart $UNIT_NAME
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN reload $UNIT_NAME
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN status $UNIT_NAME
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN status $UNIT_NAME --no-pager
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN daemon-reload
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN is-active $UNIT_NAME
$DEPLOY_USER ALL=(root) NOPASSWD: $CP_BIN /opt/efbazaar/infra/ops-bot/ops-bot.service $UNIT_PATH
EOF
    chmod 440 "$SUDOERS_PATH"
    visudo -c -f "$SUDOERS_PATH" || { echo "❌ sudoers rule invalid — removing"; rm -f "$SUDOERS_PATH"; exit 1; }
fi

# ─── 4. Systemd daemon-reload + enable ──────────────────────────────────
echo "==> daemon-reload + enable (start deferred until .env is present)"
systemctl daemon-reload
systemctl enable "$UNIT_NAME"

if [[ -f "$ENV_FILE" ]] && grep -q '^OPS_BOT_TOKEN=..*$' "$ENV_FILE"; then
    echo "==> .env mavjud — servisni ham ishga tushiraman"
    systemctl restart "$UNIT_NAME"
    sleep 2
    systemctl status "$UNIT_NAME" --no-pager -l | head -20 || true
else
    echo
    echo "⚠  $ENV_FILE hali bo'sh — CI deploy uni yozib, servisni ishga tushiradi."
fi

echo
echo "================================================================"
echo "  ✓ ops-bot install tugadi"
echo "================================================================"
echo "  Live logs:   journalctl -u $UNIT_NAME -f"
echo "  Status:      systemctl status $UNIT_NAME"
echo "  Restart:     sudo systemctl restart $UNIT_NAME"
[[ -n "$DEPLOY_USER" ]] && echo "  CI restart:  $DEPLOY_USER passwordless sudo systemctl restart $UNIT_NAME"
echo "================================================================"
