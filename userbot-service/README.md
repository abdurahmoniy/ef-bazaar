# humo-userbot

A Pyrogram **MTProto user session** — a personal Telegram account, not a bot — that watches the
Humo card bot's chat, parses top-up notifications and publishes them to Kafka.

It is deliberately dumb. It knows nothing about invoices, users or money rules: it observes and
reports, and `payment-service` decides what an observation means. That split is what lets this
service be tested without Telegram and keeps every money rule inside one transactional service.

## What it publishes

| Topic | Key | Payload |
|-------|-----|---------|
| `efbazaar.payment.card-credit-observed` | `telegramMessageId` | `{"telegramMessageId": 12345, "cardLast4": "4556", "amountTiyin": 3000000, "cardBalanceTiyin": 3165916, "observedAt": "2026-08-10T20:41:00Z", "rawText": "..."}` |
| `efbazaar.payment.userbot-heartbeat` | — | `{"sentAt": "2026-08-10T20:41:00Z"}` |

payment-service payload'da ixtiyoriy `userbotTelegramId` ni ham qabul qiladi (idempotency kaliti
`(userbotTelegramId, telegramMessageId)`). Bu servis uni hozircha yubormaydi — userbot-service
rejasida (`docs/superpowers/plans/2026-10-03-userbot-2-userbot-service.md`) qo'shiladi.

Both are **plain JSON with no Kafka headers**. The Java side names the type with
`spring.json.value.default.type` on its listener — the same convention trade-service already uses
for every message smart-admin-worker produces. Do not stamp a `__TypeId__` header here: it would
couple this Python service to a Java package path, and a Java-side refactor would silently break
deposits.

`payment-service` deserializes both into fixed record types. **Renaming a field here breaks the
consumer silently** — the message is dropped, not rejected loudly.

The heartbeat is this service's only liveness signal. `payment-service` refuses new deposits when
it has not seen one recently, and counts the userbot as unhealthy before the very first beat
arrives — which is the state every fresh deployment starts in.

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

## One-time interactive login — this cannot be automated in CI

A user session is created by an interactive Telegram login. There is no token, no API call and no
headless path: Telegram sends a login code to the account and it must be typed in by a human.

Run this **once**, on the server, in a terminal:

```bash
cd /opt/efbazaar
docker compose run --rm -it humo-userbot python -c "
from userbot_service.config import get_settings
from pyrogram import Client
s = get_settings()
with Client(s.telegram_session_name, api_id=s.telegram_api_id,
            api_hash=s.telegram_api_hash, workdir=s.telegram_session_dir) as app:
    print('logged in as', app.get_me().username or app.get_me().id)
"
```

You will be prompted for, in order:

1. **Phone number** of the account, in international format (`+998...`).
2. **The login code** Telegram sends to that account (in the Telegram app, not by SMS, if the
   account is already signed in elsewhere).
3. **The 2FA password**, if the account has two-step verification enabled.

That writes `humo_userbot_session.session` into `TELEGRAM_SESSION_DIR` — the mounted
`humo-userbot-session` volume — after which `docker compose up -d humo-userbot` starts without
prompting. Until the session exists the container crash-loops: with no TTY the login prompt raises
immediately. That is the expected state of a fresh deployment, not a bug.

**The `.session` file is a credential.** Anyone holding it has full control of that Telegram
account. It is never committed (`*.session` is gitignored), never logged, and lives only in the
Docker volume. Deleting the volume means redoing the interactive login.

## Configuration

| Env var | Required | Default | Notes |
|---------|----------|---------|-------|
| `TELEGRAM_API_ID` | **yes** | — | From <https://my.telegram.org>. GitHub Secret. |
| `TELEGRAM_API_HASH` | **yes** | — | Same. GitHub Secret. |
| `KAFKA_BOOTSTRAP_SERVERS` | **yes** | — | `kafka:9092` in compose. |
| `HUMO_SOURCE_CHAT` | no | `humocardbot` | Username **or** numeric chat id; a numeric value is coerced to `int` so `filters.chat` matches on id rather than username. |
| `TELEGRAM_SESSION_NAME` | no | `humo_userbot_session` | |
| `TELEGRAM_SESSION_DIR` | no | `/run/secrets` | `/session` in compose. |
| `HEARTBEAT_INTERVAL_SECONDS` | no | `60` | |
| `LOG_LEVEL` | no | `INFO` | |

`TELEGRAM_API_ID`, `TELEGRAM_API_HASH` and the chat id are secrets. They never appear as literals
in a committed file: GitHub Secrets → `deploy.yml` → `deploy.sh` → `.env` on the server.

The first two have **no default**, so `Settings()` raises at import if they are unset and the
container crash-loops rather than starting a client that could never authenticate.

## Development

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -v
ruff check userbot_service/ tests/
```

The tests need neither Telegram nor Kafka: `parse_topup` and `as_chat_ref` are pure functions, and
that is on purpose — the filter above is the single place where being wrong costs real money, so it
must be testable offline.

`tests/test_parser.py` keeps every fixture as a module-level constant. The top-up fixture is a real
captured message; the withdrawal one is a **reconstruction**, and real captures should be pasted
over the constants without touching any assertion.
