#!/bin/sh
# ==============================================================
# nginx entrypoint — TLS bootstrap.
#
# Maqsad: real Let's Encrypt sertifikat hali yo'q paytda nginx start
# bo'lishi uchun self-signed (snake-oil) sertifikat yaratamiz.
# certbot init-cert.sh ishga tushganda real cert bilan almashtiriladi,
# nginx reload qilingach yangi cert ishlaydi.
# ==============================================================
set -e

# Faqat asosiy domain — SAN cert ikkala domen uchun shu papkada saqlanadi
# (init-cert.sh ham shu domain'ga -d efbazaar -d api.efbazaar bilan murojaat qiladi).
DOMAINS="${TLS_DOMAINS:-efbazaar.uz}"
LE_BASE=/etc/letsencrypt/live

for d in $DOMAINS; do
  CERT_DIR="$LE_BASE/$d"
  if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
    echo "==> [tls-bootstrap] no cert for $d — generating self-signed (7d)"
    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 7 \
      -keyout "$CERT_DIR/privkey.pem" \
      -out    "$CERT_DIR/fullchain.pem" \
      -subj   "/CN=$d" 2>/dev/null
    # Marker fayl — init-cert.sh shu domenni real cert bilan almashtirishni biladi
    touch "$CERT_DIR/.snakeoil"
  fi
done

# acme-challenge papkasini ham yaratamiz (certbot --webroot uchun)
mkdir -p /var/www/certbot/.well-known/acme-challenge
chmod -R 755 /var/www/certbot

# htpasswd uchun papka (yo'q bo'lsa bo'sh fayl yaratamiz — basic auth init-cert.sh'da qo'shiladi)
mkdir -p /etc/nginx/auth
[ -f /etc/nginx/auth/swagger.htpasswd ] || : > /etc/nginx/auth/swagger.htpasswd
# Bo'sh fayl = hech kim kira olmaydi (fail-closed). Aksi bo'lsa, ya'ni
# fayl yo'qligida nginx uni o'tkazib yuborsa, dashboard bir zumga
# butunlay ochiq qolardi.
[ -f /etc/nginx/auth/dashboard.htpasswd ] || : > /etc/nginx/auth/dashboard.htpasswd

# Secret'lar env'dan conf variable'ga (nginx env o'qiy olmaydi).
# INTERNAL_API_SECRET bo'sh bo'lsa ham fayl yaratiladi — Chempionat header-auth
# bo'sh secretni rad etadi (fail-closed), nginx esa include'ni topa oladi.
cat > /etc/nginx/conf.d/secrets.inc <<EOF
set \$efbazaar_internal_secret "${INTERNAL_API_SECRET:-}";
EOF

exec nginx -g 'daemon off;'
