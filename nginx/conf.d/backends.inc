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
# Chempionat-X — bir xost, shared docker network (co-location). nginx
# `chempionat-api` (REST) va `chempox-front` (Next.js static) ni docker DNS
# orqali topadi. `/api/tournaments/**` integratsiya yo'li ham, chempox.uz /
# api.chempox.uz native domenlari ham (chempox.conf) shu internal upstream'lar
# orqali ishlaydi — public HTTPS/TLS loop yo'q.
set $backend_tournament    "chempionat-api:8080";
set $backend_chempox_front "chempox-front:80";
set $backend_frontend    "frontend:3000";
set $backend_mail        "mail-frontend:3000";
