# ==============================================================
# SSL params — modern config (Mozilla intermediate).
# https://ssl-config.mozilla.org/
# ==============================================================
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# HSTS — 1 yil. Subdomenlar ham (efbazaar va api ikkalasi).
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options nosniff always;
# Clickjacking himoyasi CSP orqali. Telegram Web Mini App uni iframe'da ochadi,
# shuning uchun web.telegram.org uchun ruxsat qoldiramiz. X-Frame-Options ishlatsak
# u DENY/SAMEORIGIN/ALLOW-FROM'dan tashqarisiga chek qo'yolmaydi va CSP ustidan
# birinchi bo'lib ishlaydi — shu sabab uni olib tashladik.
add_header Content-Security-Policy "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
