# Shared by the public site, API host and internal frontend proxy.
# Authentication must succeed before the connection can upgrade.
auth_basic off;
auth_request /_auth_verify;
auth_request_set $chat_user_id     $upstream_http_x_user_id;
auth_request_set $chat_user_roles  $upstream_http_x_user_roles;
auth_request_set $chat_telegram_id $upstream_http_x_telegram_id;
auth_request_set $chat_user_name   $upstream_http_x_user_name;

proxy_set_header X-User-Id $chat_user_id;
proxy_set_header X-User-Roles $chat_user_roles;
proxy_set_header X-Telegram-Id $chat_telegram_id;
proxy_set_header X-User-Name $chat_user_name;
proxy_set_header Host $http_host;
proxy_set_header Cookie $http_cookie;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $forwarded_proto;
proxy_set_header X-Forwarded-Host $http_host;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_connect_timeout 5s;
# Application heartbeats keep live sockets open; dead peers time out promptly.
proxy_send_timeout 75s;
proxy_read_timeout 75s;
proxy_buffering off;
proxy_pass http://$backend_marketplace/ws/chat;
