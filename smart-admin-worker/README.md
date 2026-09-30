# smart-admin-worker

Python service that replaces Plan B's `MockWorker`. Consumes Kafka trade
lifecycle request topics, provisions Mailcow mailboxes, drives Konami's
forgot-password via `rotate.py`, polls IMAP for reset/2FA emails, and rotates
mailbox passwords when trades close.

It also serves the admin panel: `efbazaar.trade.mailbox-provision-request`
creates a standalone (trade-less) mailbox with an admin-chosen local part and
answers on `efbazaar.trade.mailbox-provisioned`.

See `docs/superpowers/specs/2026-07-15-plan-c-smart-admin-worker-design.md`.

No database. State lives in Kafka, Mailcow, and short-lived Redis locks.
Runs as a FastAPI app (`uvicorn smart_admin_worker.main:app`); the HTTP surface
is only the health check on `WORKER_HEALTHCHECK_PORT` (8086).

## Topics

| Request (from trade-service) | Handler | Answers with |
|---|---|---|
| `efbazaar.trade.email-provision-request` | `handlers/email_provision.py` | `email-provisioned`; after retries are exhausted `main.py` emits `email-provision-failed` |
| `efbazaar.trade.mailbox-provision-request` | `handlers/mailbox_provision.py` | `mailbox-provisioned` |
| `efbazaar.trade.forgot-password-request` | `handlers/forgot_password.py` | `worker-queued` / `worker-started` (the reset email itself arrives through IMAP polling) |
| `efbazaar.trade.imap-poll-request` | `handlers/imap_poll.py` | `konami-email-received`, `imap-2fa-code`, `konami-email-change-code-received` |
| `efbazaar.trade.mailbox-rotate-request` | `handlers/mailbox_rotate.py` | `mailbox-rotated` |
| `efbazaar.trade.mailbox-delete-request` | `handlers/mailbox_delete.py` | — |

Backpressure: when every rotate slot is busy the worker emits `worker-queued`,
then `worker-started` when it picks the job up, so trade-service extends the
deadline instead of timing the trade out. It also forwards its own WARN/ERROR
logs to `efbazaar.system.log-event`. Full catalogue: [docs/kafka-topics.md](../docs/kafka-topics.md).

## Layout

| Package | What |
|---|---|
| `handlers/` | One handler per request topic |
| `mailcow/` | Mailcow API client (create, rotate, delete mailboxes) |
| `konami/` | Konami client; `konami/rotate/rotate.py` runs Chromium as a subprocess for forgot-password |
| `imap/` | Poller, sender allowlist and code detector for Konami emails |
| `redis/` | Locks — one IMAP poll per mailbox at a time |
| `crypto/` | Field encryption with the shared master key (same key as trade-service) |
| `telegram/` | Notifier for the email topic in the admin group |
| `kafka/` | Topic names (`topics.py`), event schemas (`events.py`) |

## Configuration

`KAFKA_BOOTSTRAP_SERVERS`, `MAILCOW_API_URL`, `MAILCOW_API_KEY_FILE`, `MASTER_KEY_FILE`,
`IMAP_HOST`, `IMAP_PORT`, `IMAP_POLL_INTERVAL_SECONDS`, `IMAP_POLL_LOCK_TTL_SECONDS`,
`KONAMI_SENDER_ALLOWLIST`, `MAX_CONCURRENT_ROTATE` (default 1, capped by `MAX_CONCURRENT_ROTATE_CAP`, default 5),
`REDIS_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_TOPIC_EMAIL`, `TELEGRAM_TOPIC_LOGS`.

## Contract with trade-service

Messages are plain JSON with no `__TypeId__` header; trade-service picks the
Java type per listener. Renaming a field here silently breaks the consumer.

## Local dev

```bash
cd smart-admin-worker
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
ruff check smart_admin_worker/ tests/
pytest -q
```

## Docker

Built as part of the efbazaar stack — `docker compose up smart-admin-worker`
from the repo root.
