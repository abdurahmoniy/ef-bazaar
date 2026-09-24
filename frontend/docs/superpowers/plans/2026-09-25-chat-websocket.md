# Chat WebSocket transport

The browser shares one authenticated native WebSocket per signed-in account and tab at `/ws/chat`. Cookies authenticate the nginx upgrade; the backend receives verified identity headers. The browser never sends a user ID, token, draft text, or participant ID as an authorization claim.

## Scope

- Chat inbox, unread count, message history, send, reply, edit, delete, read-through cursor, importance, history clearing, account-request lookup, typing and presence use WebSocket commands.
- Message/activity/inbox changes are pushed to participants. No recurring browser chat or trade-status HTTP polling remains.
- Initial server rendering and binary attachment/voice uploads retain HTTP. Financial trade commands and trade snapshots remain on the trade-service API; socket invalidations trigger snapshot refreshes. The proposal expiration deadline schedules a single refresh because a Redis lease expiring is not a database mutation.
- Existing profile links, message-entry animations, typing dots, read ticks and reduced-motion handling remain. A connection banner exposes reconnecting state.

## Wire contract

Client requests are JSON `{id, type, chatId?, payload?}`. IDs correlate replies on a connection. Success is `{id, type:"result", payload}`; errors are `{id, type:"error", status, message}`. Browser request IDs are correlation IDs, not durable message idempotency keys.

Commands: `inbox`, `unread`, `messages`, `get`, `account-request`, `send`, `edit`, `delete`, `read`, `important`, `hide`, `watch`, `unwatch`, `typing`, `heartbeat`.

`messages` accepts `{page,size}` and returns the existing page DTO in ascending time order. `send` accepts `{content,replyToId?}`; `edit` accepts `{messageId,content}`; `delete` and `read` accept `{messageId}`. `typing` accepts `{typing}` and heartbeat `{active}`. Presence is active when a tab is visible and online; the server combines all live tab leases. `watch` returns the partner's activity snapshot and authorizes future activity pushes.

Server events are `{type:"changed",chatId}` and `{type:"activity",chatId,payload}`. The former refreshes snapshots over the socket; bursts coalesce for 50 ms. The latter carries online, typing, last-seen and last-read state. Reconnection restores watches and reloads cached chat state. A missed acknowledgement rejects the send with an instruction to check the chat; writes are never automatically replayed.

## Account isolation and recovery

Account boundaries dispose old transports and private query data. An active-account fence prevents late cleanup or asynchronous work from creating a socket with a previous account's cache key and a new account's cookies. Pending commands time out; sockets reconnect with capped exponential backoff. Read markers retain their last confirmed monotonic cursor during a disconnect, while presence becomes unknown.

After a local message acknowledgement, the cache reconciles again: cancelling an obsolete snapshot must not lose a concurrent incoming message. Every history page is fetched when reconciling, including messages beyond the previous 200-message limit.

## Server propagation

Marketplace mutations made through either transport, account contact requests, and proposal consumers publish participant chat invalidations after commit. Redis pub/sub distributes signals across marketplace replicas. Presence and typing use expiring per-session Redis leases so closing one tab cannot take another active tab offline.

Trade-service publishes `chat.changed.v1` with only `{chatId}` after committed trade, message, worker and admin changes. Marketplace consumes it and notifies the chat participants; role-specific credentials and private trade data never enter the shared invalidation event.

## Deployment and local development

Deploy marketplace-service, trade-service, frontend and nginx together. Redis and Kafka are required for cross-instance delivery. The nginx shared `chat-websocket.inc` is included by the public site, API host and internal proxy. It requires authentication, overwrites identity headers, preserves the WebSocket upgrade, disables buffering and sets a 75-second idle timeout. The browser sends a heartbeat every 15 seconds; the server bounds connection lifetime and stale leases.

Production connects to `wss://<current-site>/ws/chat`; CSP permits the configured site's WebSocket origin. Default backend origin policy is same-origin only.

For Next.js development, `/ws/chat` rewrites to the origin of `INTERNAL_API_BASE_URL` (default `http://localhost:8080`). This must point to the authenticated nginx gateway, never directly to marketplace-service. Configure the development marketplace instance with `CHAT_WEBSOCKET_ALLOWED_ORIGINS=http://localhost:3000` (or the exact browser origin in use). Next changes the proxy Host, so this explicit development allowlist is necessary. Do not use wildcard origins or point a local development session at an unconfigured production backend.

## Verification

Frontend transport tests exercise request correlation, server errors, disconnect rejection without write replay, watch restoration/order, offline deadlines, account switching and shared activity snapshots. Query tests cover event batching, reconnect invalidation, account scoping, concurrent remote/local mutations and multi-page histories. Presentation tests retain the existing contact/trade/cutoff and Telegram-style chat behavior.

Backend tests cover command authorization/validation, same-origin handshake, commit/rollback notifications, per-tab leases, real WebSocket frames and real Redis/Kafka integration. Nginx regression tests and a disposable nginx container validate the upgrade routes.

Final verification (2026-09-25): 1,814 frontend tests; frontend typecheck; changed-file ESLint (existing image warning only); production `next build --webpack`; marketplace clean verify with 623 unit and 63 integration tests; trade-service 233 unit tests, 7 WebSocket integration tests and 5 Kafka publisher integration tests. All passed. Configuration checks include real `nginx -t` and Compose syntax validation. The default Turbopack build could not bind its helper port in this environment; Webpack completed. Marketplace's test JVM emitted a shutdown warning after all integration tests passed (verification still exited zero).

Changes are local and are not deployed. Roll out backend services and the authenticated nginx route before the frontend; existing HTTP endpoints remain compatible during the rollout.
