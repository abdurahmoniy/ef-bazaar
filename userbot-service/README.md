# userbot-service

Several Telegram **user accounts** (MTProto, not bots) run from encrypted sessions kept in
Postgres. An admin panel API connects and disconnects them and binds them to **tasks**; the
payment task watches the Humo card bot's chat, parses card notifications and publishes them to
Kafka. It replaces the old single-account `humo-userbot`.

It is deliberately dumb about money. It observes and reports; `payment-service` decides what an
observation means. That split lets the service be tested without Telegram and keeps every money
rule inside one transactional service.

## Containers and tasks

One image, two containers (`RUNNER` selects the entrypoint):

| Container | Entrypoint | Runs |
|-----------|-----------|------|
| `userbot-core` (port 8089) | `userbot_service.main_core` | admin panel API, login sweeper, every ACTIVE account **not** bound to PAYMENT |
| `userbot-payment` | `userbot_service.main_payment` | only the account bound to the `PAYMENT` task: Humo watcher, heartbeat, legacy-session import |

The split keeps anything done for other tasks from stalling the process money depends on.
Tasks (`features.py`): `PAYMENT` only for now.

**Lease rule.** An account runs in exactly one container at a time, because Telegram revokes an
auth key used from two places (`AUTH_KEY_DUPLICATED`). A client starts only after its row in
`userbot_leases` is ours and stops before the lease could expire. Supervisor timing: the lease
is renewed in its own task every 5 s with a 30 s TTL; a watchdog stops every client if no
renewal succeeded for TTL-10 s; Telegram calls time out at 15 s, `on_started` (catch-up) at
120 s, DB calls at 5 s. A failed log-out keeps the account `ACTIVE` and returns
`TELEGRAM_ERROR`.

## Admin panel API

Behind nginx at `/api/userbot/**` (rewritten to `/api/**`); nginx authenticates and the service
requires `ROLE_ADMIN` in `X-User-Roles`. Base path below is `/api/userbot`.

| Method and path | Purpose |
|-----------------|---------|
| `POST /v1/logins` `{phone}` | Start a login; Telegram sends a code. Returns `{loginId, status, codeType, timeoutSec}` |
| `POST /v1/logins/{id}/code` `{code}` | Submit the code. Status `CODE_SENT`, `PASSWORD_REQUIRED` (with `hint`) or done (with `account`) |
| `POST /v1/logins/{id}/password` `{password}` | Submit the 2FA password |
| `POST /v1/logins/{id}/resend` | Resend the code |
| `DELETE /v1/logins/{id}` | Cancel (204) |
| `GET /v1/accounts` | Accounts with status, masked phone, `alive`, `lastHeartbeat`, `runner`, bound `features`, `hasAvatar` |
| `GET /v1/accounts/{id}/avatar` | JPEG avatar, 404 if none |
| `DELETE /v1/accounts/{id}` | Log out and disconnect (204); refused with `ACCOUNT_BOUND` while bound |
| `GET /v1/features` | Tasks with the bound account id |
| `PUT /v1/features/{feature}` `{accountId}` | Bind a task to an ACTIVE account |

`GET /healthz` is unauthenticated (container healthcheck). Pending logins live in memory for 300 s,
at most 5 at a time, 5 attempts each; a sweeper drops abandoned ones every 30 s and survives its
own failures.

### Errors

Every error is `{code, message, ...}` with an Uzbek `message` (extra keys such as `retryAfterSec`,
`features` or `fields` where relevant). `422 VALIDATION_ERROR` lists only the failing field names
in `fields` and **never echoes the input** (it may be a login code or password).

| Code | HTTP |
|------|------|
| `FORBIDDEN` | 403 |
| `PHONE_INVALID`, `PHONE_NOT_REGISTERED`, `PHONE_BANNED` | 400 |
| `CODE_INVALID`, `CODE_EXPIRED`, `PASSWORD_INVALID` | 400 |
| `FLOOD_WAIT` (`retryAfterSec`), `TOO_MANY_LOGINS` | 429 |
| `LOGIN_GONE` | 410 |
| `ALREADY_CONNECTED`, `ACCOUNT_BOUND`, `ACCOUNT_NOT_ACTIVE`, `ACCOUNT_BUSY` | 409 |
| `ACCOUNT_NOT_FOUND`, `UNKNOWN_FEATURE`, `NOT_FOUND` | 404 |
| `METHOD_NOT_ALLOWED` | 405 |
| `VALIDATION_ERROR` | 422 |
| `TELEGRAM_ERROR` | 502 |

## What it publishes (Kafka)

Only `userbot-payment` produces; `userbot-core` publishes nothing but log events.

| Topic | Key | Payload |
|-------|-----|---------|
| `efbazaar.payment.card-credit-observed` | `<userbotTelegramId>:<telegramMessageId>` | `{"userbotTelegramId": 777, "telegramMessageId": 12345, "cardLast4": "4556", "amountTiyin": 3000000, "cardBalanceTiyin": 3165916, "observedAt": "2026-08-10T20:41:00Z", "rawText": "..."}` |
| `efbazaar.payment.card-debit-observed` | same | same plus `commissionTiyin`, `description` |
| `efbazaar.payment.userbot-heartbeat` | — | `{"sentAt": "2026-08-10T20:41:00Z"}` |

`payment-service` dedupes on `(userbotTelegramId, telegramMessageId)`. Both are **plain JSON with
no Kafka headers**: the Java side names the type with `spring.json.value.default.type`. Do not
stamp a `__TypeId__` header; it would couple this service to a Java package path.
**Renaming a field breaks the consumer silently** (the message is dropped); `tests/test_wire_format.py`
pins the keys.

The heartbeat is the liveness signal. `payment-service` refuses new deposits without a recent one.
`userbot-payment` **withholds** it (logging ERROR `withholding the heartbeat`) when no account is
bound/running, the client is disconnected, no handler is registered, or an observation has been
unpublished for over 60 s.

### Payment watcher: delivery guarantees

- Observations are written to the Postgres queue `humo_pending` **first** and deleted only after
  Kafka acknowledged them, so neither a Kafka outage nor a restart loses money.
- The live handler only enqueues. The watermark (`humo_watch_state.last_message_id`) moves only
  by **sequential, oldest-first history scans**: `attach()` on start and `resync()` every 60 s;
  `payment_maintenance` also flushes the queue every 5 s.
- Consequence: an observation is normally published **twice** (live, then by resync). That is
  safe because payment-service dedupes on `(userbotTelegramId, telegramMessageId)`.
- Catch-up reads history up to the watermark with a **5000-message safety cap**; hitting it logs
  ERROR.
- A newly bound or imported account **starts at the newest message and replays nothing**. For an
  imported account old rows were published without `userbotTelegramId`; a replay would
  double-credit.

## The filter is a correctness boundary

The same chat carries withdrawal notices and messages about other cards. **A withdrawal misread as
a top-up credits a user money nobody sent**, and there is no second check downstream —
`payment-service` trusts this output by design.

So `parse_topup` emits nothing unless *all* of these hold:

- the message contains the `To'ldirish` heading, **and**
- it contains `➕`, **and**
- an amount was parsed, **and**
- a card tail was parsed.

Either marker alone would be enough today. Requiring both means a wording change on Humo's side
makes the service fail **closed** — we stop crediting — rather than open.

Money is integer tiyin end to end; no float ever touches an amount. `30.000,00` is `.`-grouped
thousands and `,`-separated decimals, i.e. 30 000 UZS = 3 000 000 tiyin.

## Tables (`userbot_db`)

Alembic migrations (`db/migrations`, immutable once merged) run at container start.

| Table | Purpose |
|-------|---------|
| `userbot_accounts` | Account, masked phone, status (`ACTIVE`/`REVOKED`/`DISCONNECTED`), source, AES-GCM encrypted session (`session_ciphertext`, `session_iv`) |
| `userbot_bindings` | `feature` -> `account_id` |
| `userbot_leases` | Which runner holds an account, `lease_until`, `last_heartbeat` |
| `humo_watch_state` | Watermark `last_message_id` per account |
| `humo_pending` | Write-ahead queue of observations, PK `(account_id, message_id)` |
| `userbot_audit` | Connect/disconnect/bind/revoke trail |

**Connection budget.** Production Postgres runs with `max_connections=50` and the Java services
keep 40 open. Each container's engine is capped at 2 connections (`db/engine.py`
`MAX_CONNECTIONS`, `max_overflow=0`), 4 in total. Raising it fills the database and the next
deploy's `psql` step fails with "too many clients already".

## Connecting an account

Admin panel -> "Userbotlar" -> "Userbot ulash": phone, code, 2FA password if any. The old terminal
command is gone. A session file left from the old deployment is **imported automatically on the
first start** of `userbot-payment` (only while no PAYMENT binding exists; the file stays in the
`humo-userbot-session` volume for rollback). If the import fails it is logged and the runner keeps
starting; bind another account from the panel.

**Sessions are credentials.** Anyone holding one controls the account. They are stored encrypted
with `USERBOT_SESSION_KEY`; session strings, full phone numbers, codes and passwords are never
logged or returned by the API. `*.session` is gitignored. Losing the key makes every stored
session unreadable and the accounts must be reconnected.

### Deploy and rollback

- Before the first deploy add the GitHub Secret `USERBOT_SESSION_KEY` (`openssl rand -base64 32`).
- `deploy.sh` creates `userbot_db` and removes the old `efbazaar-humo-userbot` container as the
  **last** bootstrap step, right before `docker compose up -d`.
- After deploy: `docker logs efbazaar-userbot-payment | grep imported` should show the import and
  `grep withholding` should be empty.
- After a deploy, check the Humo chat for top-ups that arrived in the few seconds between removing
  the old container and the new watcher starting (the imported account starts at the newest
  message) and reconcile them manually in the admin panel.
- **Rollback:** stop `userbot-payment` first, then run the old `humo-userbot` image. Never both at
  once; `AUTH_KEY_DUPLICATED` revokes the session.

## Configuration

| Env var | Required | Default | Notes |
|---------|----------|---------|-------|
| `RUNNER` | **yes** | — | `core` or `payment` (set per container in compose). |
| `TELEGRAM_API_ID` | **yes** | — | From <https://my.telegram.org>. GitHub Secret. |
| `TELEGRAM_API_HASH` | **yes** | — | Same. |
| `KAFKA_BOOTSTRAP_SERVERS` | **yes** | — | `kafka:9092` in compose. |
| `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | **yes** | — | |
| `POSTGRES_PORT` | no | `5432` | |
| `POSTGRES_DB` | no | `userbot_db` | Compose passes `USERBOT_DB_NAME`. |
| `USERBOT_SESSION_KEY` | **yes** | — | base64 of 32 bytes. GitHub Secret. |
| `HTTP_PORT` | no | `8089` | Admin API (core). |
| `AVATAR_DIR` | no | `/avatars` | Avatar cache volume. |
| `HUMO_SOURCE_CHAT` | no | `humocardbot` | Username **or** numeric chat id; a numeric value is coerced to `int` so `filters.chat` matches on id rather than username. |
| `TELEGRAM_SESSION_NAME` | no | `humo_userbot_session` | Legacy import only. |
| `TELEGRAM_SESSION_DIR` | no | `/session` | Legacy import only. |
| `HEARTBEAT_INTERVAL_SECONDS` | no | `60` | |
| `LOG_LEVEL` | no | `INFO` | |

`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `USERBOT_SESSION_KEY` and the chat id are secrets. They
never appear as literals in a committed file: GitHub Secrets -> `deploy.yml` -> `deploy.sh` ->
`.env` on the server. Required fields have no default, so `Settings()` raises at start and the
container crash-loops rather than running a client that could never authenticate.

## Development

```bash
cd userbot-service
uv venv -p 3.12 .venv && . .venv/bin/activate
uv pip install -r requirements-dev.txt
ruff check userbot_service/ tests/
pytest -q
```

DB tests need Docker (testcontainers). On Docker versions where testcontainers' Ryuk reaper dies,
use `TESTCONTAINERS_RYUK_DISABLED=true pytest -o addopts="" -q`.

The parser and `as_chat_ref` are pure functions and need neither Telegram nor Kafka, on purpose:
the filter above is where being wrong costs real money, so it must be testable offline.
`tests/test_parser.py` keeps every fixture as a module-level constant. The top-up fixture is a
real captured message; the withdrawal one is a **reconstruction**, and real captures should be
pasted over the constants without touching any assertion.
