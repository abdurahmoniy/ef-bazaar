#!/usr/bin/env bash
# ==============================================================
# efBazaar DB backup — host-level, systemd timer chaqiradi.
#
# Nima qiladi:
#   1. docker exec efbazaar-postgres pg_dumpall  (barcha DB + rollar)
#   2. gzip -9 (siqadi)
#   3. openssl aes-256-cbc -pbkdf2 (BACKUP_PASSPHRASE bilan shifrlaydi)
#   4. Telegram TELEGRAM_TOPIC_BACKUPS'ga curl sendDocument
#   5. Local retention:
#        daily/  (7 fayl)  → 7 kundan eskilari weekly/<YYYY-Www>.tar
#        weekly/ (4 tar)   → 4 haftadan eskilari monthly/<YYYY-MM>.tar
#        monthly/(12 tar)  → 12 oydan eskilari yearly/<YYYY>.tar
#        yearly/ (∞)
#   6. Xatolik bo'lsa TELEGRAM_TOPIC_HEALTH'ga qizil alert
#
# Env fayl: /opt/efbazaar/infra/backup/.env  (CI deploy'da yoziladi)
#   TELEGRAM_BOT_TOKEN=<ops bot>  (loglar kabi ops-bot'ning tokeni)
#   TELEGRAM_GROUP_CHAT_ID
#   TELEGRAM_TOPIC_BACKUPS       — backup fayl bu topikga tushadi
#   TELEGRAM_TOPIC_HEALTH        — xato bo'lsa alert bu topikga
#   BACKUP_PASSPHRASE            — AES-256 uchun (uzun random)
#   POSTGRES_CONTAINER=efbazaar-postgres
#   POSTGRES_USER=efbazaar
#   BACKUP_ROOT=/var/backups/efbazaar
# ==============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a; . "$ENV_FILE"; set +a
fi

# ─── Config with sensible defaults ────────────────────────────────────
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-efbazaar-postgres}"
POSTGRES_USER="${POSTGRES_USER:-efbazaar}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/efbazaar}"

BOT_TOKEN="${OPS_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
CHAT_ID="${TELEGRAM_GROUP_CHAT_ID:-}"
TOPIC_BACKUPS="${TELEGRAM_TOPIC_BACKUPS:-}"
TOPIC_HEALTH="${TELEGRAM_TOPIC_HEALTH:-}"
PASSPHRASE="${BACKUP_PASSPHRASE:-}"

TS="$(date -u +%Y%m%d-%H%M%S)"
STAMP="$(date -u +%Y-%m-%d)"
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"
YEARLY_DIR="$BACKUP_ROOT/yearly"

DAILY_FILE="$DAILY_DIR/$STAMP.sql.gz.enc"

# ─── Helpers ──────────────────────────────────────────────────────────
send_telegram_document() {
    local file="$1" caption="$2" topic="$3"
    [[ -z "$BOT_TOKEN" || -z "$CHAT_ID" ]] && { echo "!! No BOT_TOKEN/CHAT_ID — skip send"; return 0; }
    local topic_arg=()
    [[ -n "$topic" ]] && topic_arg=(-F "message_thread_id=$topic")
    curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" \
        -F "chat_id=${CHAT_ID}" \
        "${topic_arg[@]}" \
        -F "caption=$caption" \
        -F "parse_mode=HTML" \
        -F "document=@${file}" >/dev/null
}

send_telegram_message() {
    local text="$1" topic="$2"
    [[ -z "$BOT_TOKEN" || -z "$CHAT_ID" ]] && return 0
    local payload
    if [[ -n "$topic" ]]; then
        payload="$(jq -c -n --arg t "$text" --arg c "$CHAT_ID" --argjson th "$topic" \
            '{chat_id: $c, text: $t, parse_mode: "HTML", message_thread_id: $th}')"
    else
        payload="$(jq -c -n --arg t "$text" --arg c "$CHAT_ID" \
            '{chat_id: $c, text: $t, parse_mode: "HTML"}')"
    fi
    curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -H 'Content-Type: application/json' \
        -d "$payload" >/dev/null
}

# Kod va stderr'ni TOZALASHDAN OLDIN oladi.
#
# Avval shunday edi:
#     trap 'rm -f "$TMP_ENC"; alert_fail "... exit $?"' ERR
# `rm -f` birinchi ishlab, muvaffaqiyatli tugaydi va `$?` ni 0 qilib qo'yadi.
# Natijada HAR QANDAY nosozlik "exit 0" bo'lib kelardi — ya'ni alert nima
# yiqilganini hech qachon ayta olmasdi.
# PIPESTATUS argument sifatida keladi: funksiyaga kirgunimizcha u allaqachon
# funksiya chaqiruvining o'z holatiga almashib bo'lgan bo'ladi.
# on_pipeline_error LINE STAGES [CODE]
#
# CODE berilmasa `$?` dan olinadi — ERR trap uchun shunday. Qo'lda
# chaqirilganda esa uni ALBATTA bering: o'sha paytda `$?` chaqiruvdan oldingi
# buyruqniki bo'ladi (odatda muvaffaqiyatli `echo`), ya'ni alert yana "exit 0"
# deb yolg'on gapiradi. Shu skriptda bu tuzoq uch marta chiqdi.
on_pipeline_error() {
    local code=$?
    local line=$1
    local stages="${2:-}"
    if [[ -n "${3:-}" ]]; then code="$3"; fi
    local detail=""
    if [[ -s "${TMP_ERR:-}" ]]; then
        detail=$'\n'"$(tail -c 300 "$TMP_ERR")"
    fi
    # `|| true`: tozalash yiqilsa (masalan fayl tizimi read-only) `set -e`
    # skriptni shu yerda to'xtatadi va alert UMUMAN yuborilmaydi — ya'ni eng
    # kerak paytda jim qolamiz.
    rm -f "${TMP_ENC:-}" "${TMP_ERR:-}" || true
    alert_fail "backup-db.sh line $line exit $code (pipe: $stages)$detail"
}

alert_fail() {
    local msg="$1"
    # printf'da haqiqiy \n bo'ladi (bash string double-quote'da esa literal backslash-n).
    local trimmed
    trimmed="$(echo "$msg" | head -c 500)"
    send_telegram_message "$(printf '🔴 <b>DB backup xato</b>\n<code>%s</code>' "$trimmed")" "$TOPIC_HEALTH"
}

trap 'alert_fail "backup-db.sh line $LINENO exit $?"' ERR

# ─── Sanity ────────────────────────────────────────────────────────────
if [[ -z "$PASSPHRASE" ]]; then
    echo "❌ BACKUP_PASSPHRASE bo'sh — restore imkonsiz. To'xtayapman."
    alert_fail "BACKUP_PASSPHRASE not set"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    echo "❌ $POSTGRES_CONTAINER ishlab turgan container'lar orasida yo'q."
    alert_fail "$POSTGRES_CONTAINER not running"
    exit 1
fi

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR" "$YEARLY_DIR"

echo "==> Starting DB backup $TS"

# ─── 1-3. Dump → gzip → encrypt ───────────────────────────────────────
# Tmp fayllar $BACKUP_ROOT ichida — /tmp systemd sandbox (ProtectSystem=strict)
# ostida yozib bo'lmaydi. $BACKUP_ROOT ReadWritePaths ichida.
echo "==> pg_dumpall → gzip → aes-256-cbc"
mkdir -p "$BACKUP_ROOT/tmp"
TMP_ENC="$(mktemp -p "$BACKUP_ROOT/tmp" backup.XXXXXX.enc)"
# Quvurning stderr'i faylga: usiz pg_dumpall'ning "FATAL: ..." yoki
# openssl'ning "no space left on device" xabari journald'da qolib ketadi va
# Telegram'dagi alertda faqat qator raqami bo'ladi.
TMP_ERR="$(mktemp -p "$BACKUP_ROOT/tmp" backup.XXXXXX.err)"
# Bir necha marta urinadi. Baza bir lahza band bo'lgani uchun kechasi backup
# UMUMAN bo'lmasligi — eng yomon natija; ertasiga tiklash kerak bo'lsa qo'lda
# qoladi. 2026-08-22 da aynan shunday bo'ldi: "too many clients already".
#
# Bu hovuz cheklovlarining o'rnini bosmaydi — u yerda talab sig'imdan oshib
# ketgan edi va asosiy tuzatish o'sha. Bu shunchaki ikkinchi qatlam: qisqa
# tirbandlik backupni yo'q qilmasin.
BACKUP_ATTEMPTS="${BACKUP_ATTEMPTS:-3}"
BACKUP_RETRY_DELAY="${BACKUP_RETRY_DELAY:-120}"

trap 'on_pipeline_error $LINENO "${PIPESTATUS[*]}"' ERR

attempt=1
while true; do
    # Trap shu blok uchun o'chiriladi: urinish yiqilishi hali nosozlik emas,
    # va alert oxirgi urinishdan keyin yuborilishi kerak.
    set +e
    trap - ERR
    {
        docker exec -i "$POSTGRES_CONTAINER" pg_dumpall -U "$POSTGRES_USER" \
            | gzip -9 \
            | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:$PASSPHRASE" \
            > "$TMP_ENC"
    } 2> "$TMP_ERR"
    # Ikkalasi BITTA satrda: alohida yozilsa, birinchi o'zlashtirish `$?` ni
    # nolga tushiradi va yiqilish muvaffaqiyat bo'lib o'qiladi. Bash avval
    # o'ng tomonlarni yoyadi, shuning uchun ikkalasi ham asl qiymatni ko'radi.
    rc=$? stages="${PIPESTATUS[*]}"
    set -e
    trap 'on_pipeline_error $LINENO "${PIPESTATUS[*]}"' ERR

    if [[ "$rc" -eq 0 ]]; then
        break
    fi
    if [[ "$attempt" -ge "$BACKUP_ATTEMPTS" ]]; then
        echo "❌ $attempt ta urinishdan keyin ham yiqildi"
        on_pipeline_error "$LINENO" "$stages" "$rc"
        exit 1
    fi
    echo "⚠️  Urinish $attempt yiqildi (exit $rc, pipe: $stages) — ${BACKUP_RETRY_DELAY}s kutib qayta urinaman"
    tail -c 300 "$TMP_ERR" || true
    attempt=$((attempt + 1))
    sleep "$BACKUP_RETRY_DELAY"
done
rm -f "$TMP_ERR"

SIZE=$(stat -c '%s' "$TMP_ENC")
if [[ "$SIZE" -lt 512 ]]; then
    echo "❌ Suspiciously small: ${SIZE}B"
    alert_fail "backup file too small: ${SIZE}B"
    rm -f "$TMP_ENC"
    exit 1
fi

mv "$TMP_ENC" "$DAILY_FILE"
chmod 600 "$DAILY_FILE"
echo "==> Wrote $DAILY_FILE ($(numfmt --to=iec-i --suffix=B "$SIZE"))"

# ─── 4. Telegram upload ────────────────────────────────────────────────
# Caption'da printf ishlatamiz — bash string'da "\n" literal backslash-n bo'ladi,
# Telegram'da ham shunday chiqadi (haqiqiy newline emas).
CAPTION="$(printf '🗄 <b>DB backup</b> — %s\nSize: %s\nEncrypt: AES-256-CBC PBKDF2\nRestore: <code>openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:$BACKUP_PASSPHRASE -in FILE | gunzip | psql</code>' \
    "$STAMP" "$(numfmt --to=iec-i --suffix=B "$SIZE")")"
if [[ "$SIZE" -lt $((45 * 1024 * 1024)) ]]; then
    echo "==> Uploading to Telegram topic $TOPIC_BACKUPS"
    send_telegram_document "$DAILY_FILE" "$CAPTION" "$TOPIC_BACKUPS"
else
    echo "==> File > 45MB — splitting for Telegram (50MB limit)"
    SPLIT_DIR="$(mktemp -d -p "$BACKUP_ROOT/tmp" split.XXXXXX)"
    split -b 40M "$DAILY_FILE" "$SPLIT_DIR/part-"
    idx=1
    for part in "$SPLIT_DIR"/part-*; do
        send_telegram_document "$part" "🗄 DB backup $STAMP — part $idx" "$TOPIC_BACKUPS"
        idx=$((idx + 1))
    done
    rm -rf "$SPLIT_DIR"
fi

# ─── 5. Retention rollup ───────────────────────────────────────────────
# Turn OFF trap AND `set -e` during rollup — rollup errors are non-fatal
# (worst case: some old dailies stay uncompressed). If we let `set -e` bubble
# up, the script exits non-zero and systemd's Restart=on-failure would
# re-run the whole backup, uploading a duplicate to Telegram.
trap - ERR
set +e
rollup_daily_to_weekly() {
    # Agar daily/ ichida 7+ fayl bo'lsa — eng eski 7 tasini weekly/<YYYY-Www>.tar ga qadash
    mapfile -t old_files < <(ls -1 "$DAILY_DIR" 2>/dev/null | sort | head -n -7)
    if [[ ${#old_files[@]} -gt 0 ]]; then
        # eng eski faylning ISO haftasi
        first="${old_files[0]}"
        week="$(date -u -d "${first%.sql.gz.enc}" +%G-W%V 2>/dev/null || echo "unknown-$TS")"
        weekly_tar="$WEEKLY_DIR/$week.tar"
        echo "==> Rolling up ${#old_files[@]} daily → $weekly_tar"
        tar -C "$DAILY_DIR" -rf "$weekly_tar" "${old_files[@]}" 2>/dev/null || \
            tar -C "$DAILY_DIR" -cf "$weekly_tar" "${old_files[@]}"
        (cd "$DAILY_DIR" && rm -f "${old_files[@]}")
    fi
}
rollup_weekly_to_monthly() {
    mapfile -t old_files < <(ls -1 "$WEEKLY_DIR" 2>/dev/null | sort | head -n -4)
    if [[ ${#old_files[@]} -gt 0 ]]; then
        first="${old_files[0]}"
        # 2026-W12 → 2026-03 (yaqin oy)
        yr="${first%%-W*}"
        wk="${first#*W}"; wk="${wk%.tar}"
        mon="$(date -u -d "$yr-01-01 +$(( (wk - 1) * 7 )) days" +%Y-%m 2>/dev/null || echo "$yr-unknown")"
        monthly_tar="$MONTHLY_DIR/$mon.tar"
        echo "==> Rolling up ${#old_files[@]} weekly → $monthly_tar"
        tar -C "$WEEKLY_DIR" -rf "$monthly_tar" "${old_files[@]}" 2>/dev/null || \
            tar -C "$WEEKLY_DIR" -cf "$monthly_tar" "${old_files[@]}"
        (cd "$WEEKLY_DIR" && rm -f "${old_files[@]}")
    fi
}
rollup_monthly_to_yearly() {
    mapfile -t old_files < <(ls -1 "$MONTHLY_DIR" 2>/dev/null | sort | head -n -12)
    if [[ ${#old_files[@]} -gt 0 ]]; then
        first="${old_files[0]}"
        yr="${first%%-*}"
        yearly_tar="$YEARLY_DIR/$yr.tar"
        echo "==> Rolling up ${#old_files[@]} monthly → $yearly_tar"
        tar -C "$MONTHLY_DIR" -rf "$yearly_tar" "${old_files[@]}" 2>/dev/null || \
            tar -C "$MONTHLY_DIR" -cf "$yearly_tar" "${old_files[@]}"
        (cd "$MONTHLY_DIR" && rm -f "${old_files[@]}")
    fi
}

rollup_daily_to_weekly
rollup_weekly_to_monthly
rollup_monthly_to_yearly

echo "==> Done. Retention:"
echo "   daily:   $(ls "$DAILY_DIR" 2>/dev/null | wc -l) files"
echo "   weekly:  $(ls "$WEEKLY_DIR" 2>/dev/null | wc -l) files"
echo "   monthly: $(ls "$MONTHLY_DIR" 2>/dev/null | wc -l) files"
echo "   yearly:  $(ls "$YEARLY_DIR" 2>/dev/null | wc -l) files"
