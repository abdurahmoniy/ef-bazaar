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
set $backend_frontend    "frontend:3000";
