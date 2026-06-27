#!/usr/bin/env bash
# ==============================================================
# Initial Let's Encrypt sertifikat issuance + Swagger basic auth setup.
#
# Birinchi marta deploy bo'lganda QO'LDA ishga tushiring:
#   cd /opt/efbazaar
#   bash infra/certbot/init-cert.sh
#
# Quyidagilarni qiladi:
#   1. Snake-oil certni o'chiradi (bo'lsa)
#   2. Har bir domen uchun real Let's Encrypt cert oladi (--webroot)
#   3. Swagger basic auth uchun htpasswd yozadi (SWAGGER_USER/SWAGGER_PASS env'dan)
#   4. nginx ni reload qiladi
#
# Eslatma:
#   - nginx ishlab turgan bo'lishi shart (port 80 ochilgan)
#   - DNS A record ikkala domen uchun ham server IP ga ko'rsatishi shart
#   - LE_EMAIL env yoki interactive prompt
# ==============================================================
set -euo pipefail

cd "${DEPLOY_PATH:-/opt/efbazaar}"

DOMAINS=(efbazaar.chempox.uz api.efbazaar.chempox.uz)
LE_EMAIL="${LE_EMAIL:-}"
SWAGGER_USER="${SWAGGER_USER:-admin}"
SWAGGER_PASS="${SWAGGER_PASS:-}"
STAGING="${STAGING:-0}"   # =1 — Let's Encrypt staging server (test, rate limit yo'q)

if [[ -z "$LE_EMAIL" ]]; then
  read -r -p "Let's Encrypt notification email: " LE_EMAIL
fi
if [[ -z "$SWAGGER_PASS" ]]; then
  read -r -s -p "Swagger basic auth password (user=$SWAGGER_USER): " SWAGGER_PASS
  echo
fi

# ─── DNS sanity check ──────────────────────────────────────────────────
SERVER_IP=$(curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo "==> Server IP: $SERVER_IP"
for d in "${DOMAINS[@]}"; do
  resolved=$(getent hosts "$d" | awk '{print $1}' | head -1)
  if [[ "$resolved" != "$SERVER_IP" ]]; then
    echo "!! WARNING: $d -> $resolved (expected $SERVER_IP)"
    echo "!! DNS A record to'g'rilanmagan bo'lishi mumkin. Davom etish xavfli."
    read -r -p "   Baribir davom etamizmi? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || exit 1
  else
    echo "==> $d -> $resolved ✓"
  fi
done

# ─── Snake-oil certlarni o'chirish ─────────────────────────────────────
echo "==> Removing any snake-oil certs from named volume"
docker compose exec -T nginx sh -c '
for d in '"${DOMAINS[*]}"'; do
  if [ -f /etc/letsencrypt/live/$d/.snakeoil ]; then
    rm -rf /etc/letsencrypt/live/$d
    echo "   removed snake-oil: $d"
  fi
done'

# ─── certbot certonly ──────────────────────────────────────────────────
STAGING_FLAG=""
[[ "$STAGING" == "1" ]] && STAGING_FLAG="--staging" && echo "==> STAGING mode"

CERTBOT_ARGS=(
  certonly
  --webroot --webroot-path=/var/www/certbot
  --email "$LE_EMAIL"
  --agree-tos --no-eff-email
  --non-interactive
  --keep-until-expiring
  $STAGING_FLAG
)
for d in "${DOMAINS[@]}"; do
  CERTBOT_ARGS+=(-d "$d")
done

echo "==> Requesting Let's Encrypt cert for: ${DOMAINS[*]}"
docker compose run --rm --entrypoint certbot certbot "${CERTBOT_ARGS[@]}"

# ─── Swagger basic auth (htpasswd) ─────────────────────────────────────
echo "==> Writing Swagger htpasswd (user: $SWAGGER_USER)"
# bcrypt hash htpasswd format'ida (httpd-tools'siz — openssl bilan)
HASH=$(docker run --rm httpd:2.4-alpine htpasswd -nbB "$SWAGGER_USER" "$SWAGGER_PASS")
docker compose exec -T nginx sh -c "echo '$HASH' > /etc/nginx/auth/swagger.htpasswd"

# ─── nginx reload ──────────────────────────────────────────────────────
echo "==> Validating + reloading nginx"
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo
echo "================================================================"
echo "  ✓ TLS + Swagger basic auth tayyor"
echo "================================================================"
for d in "${DOMAINS[@]}"; do
  echo "  https://$d"
done
echo
echo "  Swagger UI:  https://api.efbazaar.chempox.uz/swagger-ui/index.html"
echo "  Username:    $SWAGGER_USER"
echo
echo "  Renewal: certbot kontayneri har 12 soatda renew qiladi (avtomatik)."
echo "================================================================"
