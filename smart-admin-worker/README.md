# smart-admin-worker

Python service that replaces Plan B's `MockWorker`. Consumes Kafka trade
lifecycle request topics, provisions Mailcow mailboxes, drives Konami's
forgot-password via `rotate.py`, polls IMAP for reset/2FA emails, and rotates
mailbox passwords when trades close.

See `docs/superpowers/specs/2026-07-15-plan-c-smart-admin-worker-design.md`.

## Local dev

```bash
cd smart-admin-worker
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

## Docker

Built as part of the efbazaar stack — `docker compose up smart-admin-worker`
from the repo root.
