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
set $backend_payment     "payment-service:8087";
set $backend_access      "access-service:8088";
set $backend_userbot     "userbot-core:8089";
set $backend_rec         "recommendation-service:8083";
# Chempionat-X — bir xost, shared docker network. `/api/tournaments/**`
# integratsiya yo'li (efbazaar.conf) `chempionat-api` ni docker DNS orqali
# topadi. chempox.uz domenlari endi Examiner'niki (chempox.conf).
set $backend_tournament    "chempionat-api:8080";
set $backend_frontend    "frontend:3000";
set $backend_mail        "mail-frontend:3000";
set $backend_grafana     "grafana:3000";
