#!/usr/bin/env bash
# ==============================================================
# efBazaar DB backup — host'da systemd timer sifatida o'rnatadi.
#
# BIR MAROTABA (serverni birinchi tayyorlashda) qo'lda:
#   cd /opt/efbazaar
#   sudo bash infra/backup/install.sh
#
# Quyidagilarni qiladi:
#   1. Zaruriy CLI'larni tekshiradi (openssl, jq, curl, tar, gzip — barchasi
#      standart Debian/Ubuntu paketlari)
#   2. efbazaar-backup.service va efbazaar-backup.timer'ni /etc/systemd/system'ga
#   3. Deploy user uchun scoped sudoers rule (start-restart-status faqat shu unit uchun)
#   4. daemon-reload + enable timer
# ==============================================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SVC="efbazaar-backup.service"
UNIT_TMR="efbazaar-backup.timer"
SUDOERS_PATH="/etc/sudoers.d/efbazaar-backup"

if [[ $EUID -ne 0 ]]; then
    echo "❌ root sifatida ishga tushiring: sudo bash $0"
    exit 1
fi

DEPLOY_USER="${1:-${SUDO_USER:-}}"
if [[ -z "$DEPLOY_USER" || "$DEPLOY_USER" == "root" ]]; then
    DEPLOY_USER=""
fi

# ─── 1. Deps ────────────────────────────────────────────────────────────
echo "==> Checking deps: openssl, jq, curl, tar, gzip"
missing=()
for bin in openssl jq curl tar gzip; do
    command -v "$bin" >/dev/null 2>&1 || missing+=("$bin")
done
if [[ ${#missing[@]} -gt 0 ]]; then
    echo "   Installing: ${missing[*]}"
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update && apt-get install -y "${missing[@]}"
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y "${missing[@]}"
    else
        echo "❌ Package manager topilmadi. Qo'lda o'rnating: ${missing[*]}"
        exit 1
    fi
fi

# ─── 2. Backup root dir ─────────────────────────────────────────────────
BACKUP_ROOT="/var/backups/efbazaar"
mkdir -p "$BACKUP_ROOT"/{daily,weekly,monthly,yearly}
chmod 700 "$BACKUP_ROOT"

# ─── 3. Systemd units ───────────────────────────────────────────────────
echo "==> Installing systemd units"
cp "$SRC_DIR/$UNIT_SVC" "/etc/systemd/system/$UNIT_SVC"
cp "$SRC_DIR/$UNIT_TMR" "/etc/systemd/system/$UNIT_TMR"
chmod 644 "/etc/systemd/system/$UNIT_SVC" "/etc/systemd/system/$UNIT_TMR"

# ─── 4. Sudoers rule ────────────────────────────────────────────────────
if [[ -n "$DEPLOY_USER" ]]; then
    SYSTEMCTL_BIN="$(command -v systemctl)"
    CP_BIN="$(command -v cp)"
    echo "==> Writing sudoers rule for '$DEPLOY_USER'"
    cat > "$SUDOERS_PATH" <<EOF
# efBazaar DB backup — CI deploy user'ga faqat shu servis va timer'ni
# boshqarishga passwordsiz ruxsat.
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN restart $UNIT_TMR
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN reload $UNIT_TMR
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN status $UNIT_TMR
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN status $UNIT_TMR --no-pager
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN is-active $UNIT_TMR
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN daemon-reload
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN start $UNIT_SVC
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN status $UNIT_SVC
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN status $UNIT_SVC --no-pager
$DEPLOY_USER ALL=(root) NOPASSWD: $CP_BIN /opt/efbazaar/infra/backup/$UNIT_SVC /etc/systemd/system/$UNIT_SVC
$DEPLOY_USER ALL=(root) NOPASSWD: $CP_BIN /opt/efbazaar/infra/backup/$UNIT_TMR /etc/systemd/system/$UNIT_TMR
EOF
    chmod 440 "$SUDOERS_PATH"
    visudo -c -f "$SUDOERS_PATH" || { rm -f "$SUDOERS_PATH"; echo "❌ sudoers invalid"; exit 1; }
fi

# ─── 5. Enable timer ────────────────────────────────────────────────────
echo "==> daemon-reload + enable timer"
systemctl daemon-reload
systemctl enable --now "$UNIT_TMR"

echo
echo "================================================================"
echo "  ✓ backup install tugadi"
echo "================================================================"
echo "  Timer status: systemctl list-timers $UNIT_TMR"
echo "  Manual run:   sudo systemctl start $UNIT_SVC"
echo "  Live logs:    journalctl -u $UNIT_SVC -f"
echo "  Backups at:   $BACKUP_ROOT"
echo "  Sud (CI):     ${DEPLOY_USER:-root} passwordless start/status"
echo "================================================================"
