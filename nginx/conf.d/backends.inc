# Backend hostnames — kept as variables so proxy_pass re-resolves DNS per
# request via the http-level `resolver` (see nginx.conf). Without this,
# any backend container restart leaves nginx stuck on the old IP →
# `connect() failed (111: Connection refused)` → 502 until nginx itself
# is restarted.
#
# Include this file inside each `server { }` block that needs to proxy.
set $backend_auth        "auth-service:8081";
set $backend_marketplace "marketplace-service:8082";
set $backend_bot         "bot:8084";
set $backend_trade       "trade-service:8085";
# Chempionat-X — alohida server, public HTTPS orqali (`api.chempox.uz`).
# 2-server split rejimida shared docker network yo'q; proxy_pass https:// bilan
# ishlatiladi va Host/SNI aynan `api.chempox.uz` bo'lishi kerak (aks holda
# TLS handshake yoki upstream routing yiqiladi). Public reads (list/standings/…)
# browser'dan RTK Query orqali to'g'ridan Chempionat'ga ketadi — bu upstream
# faqat auth talab qiluvchi write endpoint'lar uchun.
set $backend_tournament  "api.chempox.uz";
set $backend_frontend    "frontend:3000";
set $backend_mail        "mail-frontend:3000";
