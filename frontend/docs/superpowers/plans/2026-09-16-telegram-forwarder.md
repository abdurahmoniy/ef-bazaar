# Telegram Forwarder Implementation Plan

**Goal:** Forward the latest Saved Message to every joined Telegram group with one button.

**Architecture:** Standalone local Python application; Telethon adapter, asynchronous sending engine, loopback HTTP interface, and a Mac launcher. The marketplace application remains independent.

**Tech stack:** Python 3.9+, Telethon 1.45.0, standard-library HTTP server and unittest, plain HTML/CSS/JavaScript.

- [x] Create behavior tests in `tools/telegram-forwarder/test_forwarder.py` for group selection, latest album, stale previews, duplicate starts, sequential delivery, waits, stop, and failures. Confirm missing behavior fails before implementation.
- [x] Implement `engine.py` with immutable post/group snapshots, single-use submission tokens, a single active task, interruptible waiting, and conservative failure handling. Keep Telegram integration in `telegram_gateway.py`.
- [x] Implement `app.py` and `web/` with authenticated local API calls, strict Host/Origin checks, a message preview, recipient list, sending progress, stop, and explicit refresh for another run. Add HTTP tests for unauthorized requests and launch without sending.
- [x] Add `Start Forwarder.command`, pinned `requirements.txt`, `.gitignore`, and plain-language setup instructions. Protect local credentials and prevent simultaneous launcher instances.
- [x] Install the dependency locally, run all utility tests, verify launcher syntax, exercise the fake-data browser interface, and review the resulting changes. Do not send real Telegram messages during verification.

Verification: 32 tests pass, including regression coverage for login datacenter migration, stopping during preflight, and partial album delivery. JavaScript/Python/launcher syntax checks pass. Browser demo verified four successful sample deliveries, duplicate-send prevention in the completed state, refresh, and stopping a subsequent sample run. No live Telegram account was connected and no real messages were sent.

The prior conversation approved the flow and recipient scope. Execute locally, leave the changes available for review, and finish all work that does not require the user's Telegram credentials.
