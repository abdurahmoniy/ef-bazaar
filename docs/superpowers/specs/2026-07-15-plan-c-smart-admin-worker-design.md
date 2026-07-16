# Plan C — smart-admin-worker Design

**Date:** 2026-07-15
**Status:** Design (approved via brainstorming)
**Owner:** Muxiddinov
**Depends on:** Plan A (trade-service foundation), Plan B (trade lifecycle)

## 1. Purpose

Replace `MockWorker` (shipped in Plan B Task 14) with a real Python service — `smart-admin-worker` — that:

1. Provisions Mailcow mailboxes on demand via the Mailcow REST API.
2. Triggers Konami's forgot-password flow using the existing `rotate.py` (Playwright-based browser automation).
3. Polls those Mailcow mailboxes over IMAP to detect Konami reset emails and 2FA codes.
4. Rotates mailbox passwords when trades close (hand-off to buyer or seller).
5. Backpressures gracefully — if the worker is over-subscribed, foreground trades don't silently orphan; users see a "smart-admin busy" status and their state deadline is extended.

Nothing else — the worker is DB-less, has no HTTP inbound beyond `/health` + `/metrics`, and stores no state of its own. Everything durable lives in trade-service.

## 2. Non-goals

- No frontend surfaces (Plan D).
- No Uzum payment integration (Plan E).
- No TOTP MFA for admin dashboard (spec §11 follow-up).
- No IMAP IDLE / long-poll — MVP uses periodic 5-second poll; IDLE is a follow-up when concurrent trades exceed ~500.
- No dead-letter Kafka topics — MVP uses tenacity `retry(3, expo)` then log-and-drop; DLQ is a Plan D follow-up.
- No Prometheus scrape stack (Grafana, alertmanager) — `/metrics` endpoint is exposed but nothing consumes it yet.

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│ smart-admin-worker (NEW, Python 3.12, FastAPI + aiokafka)       │
│                                                                 │
│  FastAPI (HTTP inbound is limited to observability):            │
│    GET /health    — 200 when Kafka consumer group is joined     │
│    GET /metrics   — Prometheus text format                      │
│                                                                 │
│  Lifespan hooks:                                                │
│    startup   → aiokafka consumer + producer connect             │
│    shutdown  → graceful drain (in-flight tasks finish)          │
│                                                                 │
│  Handlers (async def, one per request topic):                   │
│    on_email_provision_request  → MailcowClient.create_mailbox   │
│                                → publish email-provisioned      │
│    on_forgot_password_request  → KonamiClient.trigger_reset     │
│                                  (rotate.py subprocess, semaphore) │
│                                → start IMAP poll loop           │
│    on_imap_poll_request        → start IMAP poll loop (2FA)     │
│    on_mailbox_rotate_request   → MailcowClient.rotate_password  │
│                                → publish mailbox-rotated        │
│                                                                 │
│  Services:                                                      │
│    MailcowClient        — httpx.AsyncClient                      │
│    KonamiClient         — subprocess wrapper (rotate.py)         │
│    ImapPollerRegistry   — active poll tasks (mailbox → Task)    │
│    KonamiEmailDetector  — sender allowlist + subject/body regex │
│    RedisLockManager     — per-poll-iteration mini-lock          │
│    FieldEncryptor       — AES-256-GCM + HKDF (matches Java)     │
└──────────────┬──────────────────────────────────────┬───────────┘
               ↕ Kafka                                ↕ Mailcow
┌──────────────┴───────────┐        ┌─────────────────┴────────────┐
│ trade-service (existing) │        │ mail.efbazaar.uz              │
│ + 2 new consumers:       │        │ Mailcow REST API /api/v1/     │
│   WorkerQueuedConsumer   │        │ Dovecot IMAP :993             │
│   WorkerStartedConsumer  │        └───────────────────────────────┘
│ + TradeDeadlineExtender  │
│   (Redis extension       │
│    counter, max 2/trade) │
└──────────────────────────┘
```

### 3.1 Rationale

- **Python** — `rotate.py` is already Python (Playwright/patchright); rewriting it in Java would multiply the fragile Konami-scraping surface.
- **FastAPI + aiokafka (not FastAPI + kafka-python as spec §4.1 suggested)** — aiokafka lives on the same asyncio event loop; kafka-python is thread-based and would introduce two concurrency models in one process. FastAPI is only there because `/health` + `/metrics` are the standard docker-native observability surface.
- **Subprocess for `rotate.py` (not in-process import)** — Playwright is heavy, sync, and prone to crashes when Konami's page layout mutates; running it in a separate process isolates crashes from the worker's event loop and gives each call a fresh Chromium (which avoids Konami detection heuristics that stick to a browser fingerprint).
- **DB-less** — trade-service already owns the durable state (Trade rows, TradeMessages, TradeAuditLog). Adding a second store here would require two-phase commit or eventual-consistency handling for no benefit.

## 4. Component Design

### 4.1 Directory layout

```
smart-admin-worker/
├── pyproject.toml
├── requirements.txt              # frozen prod deps
├── requirements-dev.txt          # + pytest, respx, testcontainers
├── Dockerfile
├── README.md
│
├── smart_admin_worker/
│   ├── __init__.py
│   ├── main.py                   # FastAPI app + lifespan
│   ├── config.py                 # pydantic-settings
│   ├── logging_config.py         # structlog
│   │
│   ├── kafka/
│   │   ├── topics.py             # topic name constants
│   │   ├── events.py             # dataclasses matching Java TradeEvents
│   │   ├── consumer.py           # aiokafka dispatcher
│   │   └── producer.py           # publish helpers
│   │
│   ├── handlers/
│   │   ├── email_provision.py
│   │   ├── forgot_password.py
│   │   ├── imap_poll.py
│   │   └── mailbox_rotate.py
│   │
│   ├── mailcow/
│   │   ├── client.py
│   │   └── errors.py
│   │
│   ├── konami/
│   │   ├── client.py             # subprocess wrapper
│   │   └── rotate/               # UNMODIFIED rotate.py + password_generator.py
│   │       ├── rotate.py         # relocated from ~/IdeaProjects/konami-account-transfer/
│   │       └── password_generator.py
│   │
│   ├── imap/
│   │   ├── poller.py             # async poll loop
│   │   ├── detector.py           # sender + regex heuristic
│   │   └── registry.py           # mailbox → asyncio.Task
│   │
│   ├── redis/
│   │   └── lock.py               # per-poll mini-lock
│   │
│   ├── crypto/
│   │   └── field_encryptor.py    # AES-GCM + HKDF (Java TradeCrypto equivalent)
│   │
│   └── http/
│       ├── health.py             # /health endpoint
│       └── metrics.py            # /metrics
│
└── tests/
    ├── conftest.py
    ├── unit/
    │   ├── test_konami_client.py
    │   ├── test_konami_detector.py
    │   ├── test_mailcow_client.py
    │   ├── test_imap_poller.py
    │   ├── test_field_encryptor.py
    │   └── test_forgot_password_handler.py
    └── integration/
        ├── conftest.py           # testcontainers (kafka, redis)
        └── test_end_to_end.py    # publish → consume → publish assert
```

### 4.2 Component contracts

**MailcowClient** (`smart_admin_worker/mailcow/client.py`)
- `async create_mailbox(local_part: str, password: str, quota_mb: int = 100) -> Mailbox`
- `async rotate_password(mailbox_email: str, new_password: str) -> None`
- `async delete_mailbox(mailbox_email: str) -> None` (used by admin dashboard; not called by worker in MVP)
- HTTP client: `httpx.AsyncClient`, `X-API-Key` header, base URL from `MAILCOW_API_URL`.
- Errors: `MailcowApiError`, `MailboxAlreadyExists`, `MailboxNotFound`.

**KonamiClient** (`smart_admin_worker/konami/client.py`)
- `async trigger_reset(email: str, konami_id: str | None) -> None`
- Wraps `subprocess.run(["python", "rotate/rotate.py"], env={..., "KONAMI_EMAIL": email})` inside `asyncio.to_thread`.
- Timeout 120s (Chromium startup + Konami page traversal).
- Concurrency gated by `asyncio.Semaphore(MAX_CONCURRENT_ROTATE)` — value from env, default 1, capped at `MAX_CONCURRENT_ROTATE_CAP` (default 5) so operators can't accidentally over-subscribe Chromium.
- Errors: `KonamiRotateFailed(stderr, exit_code)`.

**ImapPoller / ImapPollerRegistry** (`smart_admin_worker/imap/`)
- `registry.start_poll(mailbox_email, purpose: {VERIFY_LINK, WAIT_2FA_CODE}, trade_id) -> asyncio.Task`
- `registry.cancel(mailbox_email, purpose)`
- Each poll task loops: `await asyncio.sleep(POLL_INTERVAL); if lock.acquire: fetch; detect; if hit: publish + cancel self`.
- Uses imap-tools (`imap_tools.MailBox`) via `asyncio.to_thread` (imap-tools is sync).

**KonamiEmailDetector** (`smart_admin_worker/imap/detector.py`)
- Input: iterable of `MailMessage` from imap-tools.
- Sender allowlist from env `KONAMI_SENDER_ALLOWLIST` (comma-separated), with hardcoded defaults for `noreply@konami.com`, `no-reply@konami.jp`, `noreply@konami.net`.
- For `VERIFY_LINK` purpose: sender ∈ allowlist AND body contains `https?://[^\s]*konami[^\s]*` → `resetLinkPresent=True`.
- For `WAIT_2FA_CODE`: sender ∈ allowlist AND body contains a 4–8 digit code near "verification" or "code" keyword.

**RedisLockManager** (`smart_admin_worker/redis/lock.py`)
- `async try_lock(mailbox_email: str, ttl_seconds: int = 6) -> bool` — `SET NX PX` semantics.
- `async release(mailbox_email: str) -> None` — `DEL`.
- Called per poll iteration (short-lived, replica coordination).

**FieldEncryptor** (`smart_admin_worker/crypto/field_encryptor.py`)
- `encrypt(context: str, plaintext: bytes) -> EncryptedField(iv, tag, ciphertext)`
- `decrypt(context: str, field: EncryptedField) -> bytes`
- Master key loaded from `MASTER_KEY_FILE` (32 base64 bytes, same as Java `MasterKeyProvider`).
- HKDF-SHA256 to derive per-record key from context string (matches Java `TradeCrypto`).
- Used when publishing `email-provisioned` (encrypts the freshly-created mailbox password so trade-service can persist it) and `mailbox-rotated`.
- Cross-language parity test vectors: a Java test in trade-service will emit a fixture file `smart-admin-worker/tests/fixtures/crypto_vectors.json` containing `{context, plaintext_b64, iv_b64, tag_b64, ciphertext_b64}` triples that the Python side must round-trip identically. Plan drops the vectors file at implementation time.

## 5. Kafka Contract

Topics defined by Plan B (`TradeEvents.java`); Python side has the same names + matching payload shapes as dataclasses:

**Worker consumes (request topics):**
- `efbazaar.trade.email-provision-request` `{ tradeId }`
- `efbazaar.trade.forgot-password-request` `{ tradeId, mailboxEmail, konamiId? }`
- `efbazaar.trade.imap-poll-request` `{ tradeId, mailboxEmail, purpose: VERIFY_LINK|WAIT_2FA_CODE }`
- `efbazaar.trade.mailbox-rotate-request` `{ mailboxId }`

**Worker publishes (response topics):**
- `efbazaar.trade.email-provisioned` `{ tradeId, mailboxEmail, encryptedPassword, iv, tag }`
- `efbazaar.trade.konami-email-received` `{ tradeId, resetLinkPresent, sender, receivedAt }`
- `efbazaar.trade.imap-2fa-code` `{ tradeId, code, receivedAt }`
- `efbazaar.trade.mailbox-rotated` `{ mailboxId, encryptedPassword, iv, tag }`

**Worker publishes (new — backpressure UX):**
- `efbazaar.trade.worker-queued` `{ tradeId, purpose, estimatedWaitSeconds }` — fired the moment a handler blocks on `konami_semaphore.acquire()`. Trade-service reacts by extending the state deadline (max 2 extensions per trade, Redis counter) and posting a SMART_ADMIN STATUS message. `estimatedWaitSeconds` is computed as `queue_position × 30` (conservative Chromium+Konami traversal average — 30s per slot ahead of you).
- `efbazaar.trade.worker-started` `{ tradeId, purpose }` — fired the moment the handler actually acquires the semaphore and begins work. Trade-service posts a STATUS message so the user knows things are moving.

Consumer group: `smart-admin-worker`. Partition key: `tradeId` (or `mailboxId` for rotate). Trusted JSON packages: `uz.efbazaar.*` (matches trade-service producer).

## 6. Trade-service additions (Plan B code, not new plan)

Plan C touches trade-service to consume the two new backpressure topics:

- `WorkerQueuedConsumer` — inserts SMART_ADMIN STATUS message in both trade chats. Increments Redis counter `trade:{id}:deadline-extensions`. If counter ≤ `MAX_EXTENSIONS_PER_TRADE` (default 2), extends `state_deadline` to `max(current, now + estimatedWaitSeconds * 2 + 15 min)` and STATUS text is *"Smart-admin band, so'rovingiz navbatda. Muddat N daq'ga uzaytirildi."* When counter > max, the STATUS text is *"Smart-admin band, so'rovingiz navbatda. Muddat qo'shimcha uzaytirilmaydi."* — user is warned that a further backpressure event will not extend the deadline again.
- `WorkerStartedConsumer` — inserts SMART_ADMIN STATUS message *"Smart-admin so'rovingizni ishlab boshladi."*
- `TradeDeadlineExtender` service — the one-place API used by the two consumers: `extend(tradeId, seconds) -> ExtensionOutcome{EXTENDED, CAPPED}`.

No new migrations — extension counter is Redis-only (24 h TTL).

## 7. Runtime configuration (env)

| Var | Default | Notes |
|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | — | required |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | — | required |
| `MAILCOW_API_URL` | `https://mail.efbazaar.uz/api/v1` | |
| `MAILCOW_API_KEY_FILE` | `/run/secrets/mailcow_api_key` | Docker secret |
| `MASTER_KEY_FILE` | `/run/secrets/master_key` | shared with trade-service |
| `IMAP_HOST` | `mail.efbazaar.uz` | |
| `IMAP_PORT` | `993` | SSL |
| `KONAMI_SENDER_ALLOWLIST` | `noreply@konami.com,no-reply@konami.jp,noreply@konami.net` | comma-separated |
| `MAX_CONCURRENT_ROTATE` | `1` | operator-tunable |
| `MAX_CONCURRENT_ROTATE_CAP` | `5` | hard cap, ignored if higher |
| `IMAP_POLL_INTERVAL_SECONDS` | `5` | |
| `IMAP_POLL_LOCK_TTL_SECONDS` | `6` | slightly > interval, so lock doesn't outlive next attempt |
| `WORKER_HEALTHCHECK_PORT` | `8086` | FastAPI listens here |
| `LOG_LEVEL` | `INFO` | |

Chromium binary path is fixed to `/usr/bin/chromium` in the Dockerfile via `PATCHRIGHT_CHROMIUM_PATH` env.

## 8. Deployment

### 8.1 docker-compose.yml (added)

```yaml
  smart-admin-worker:
    build: ./smart-admin-worker
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-smart-admin-worker:${IMAGE_TAG:-latest}
    container_name: efbazaar-smart-admin
    restart: unless-stopped
    environment:
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE}
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
      REDIS_HOST: ${REDIS_HOST}
      REDIS_PORT: ${REDIS_PORT}
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      MAILCOW_API_URL: https://mail.efbazaar.uz/api/v1
      MAILCOW_API_KEY_FILE: /run/secrets/mailcow_api_key
      IMAP_HOST: mail.efbazaar.uz
      IMAP_PORT: 993
      MASTER_KEY_FILE: /run/secrets/master_key
      KONAMI_SENDER_ALLOWLIST: "noreply@konami.com,no-reply@konami.jp,noreply@konami.net"
      MAX_CONCURRENT_ROTATE: "1"
      MAX_CONCURRENT_ROTATE_CAP: "5"
      IMAP_POLL_INTERVAL_SECONDS: "5"
      LOG_LEVEL: INFO
    secrets:
      - mailcow_api_key
      - master_key
    depends_on:
      kafka:
        condition: service_started
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8086/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    mem_limit: 720m
    memswap_limit: 900m
    networks:
      - efbazaar-net
```

New Docker secret `mailcow_api_key` added to the top-level `secrets:` block, backed by `infra/secrets/mailcow_api_key` (gitignored; `.example` committed).

### 8.2 Dockerfile

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libnss3 \
    libgbm1 \
    curl \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app app
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY smart_admin_worker/ ./smart_admin_worker/

USER app

ENV PYTHONUNBUFFERED=1 \
    PATCHRIGHT_CHROMIUM_PATH=/usr/bin/chromium

EXPOSE 8086

CMD ["uvicorn", "smart_admin_worker.main:app", "--host", "0.0.0.0", "--port", "8086"]
```

Image size: ~600 MB (Chromium is the bulk). Acceptable — GHCR is free, deploy pull ~30s on Contabo.

### 8.3 CI/CD

**`.github/workflows/build.yml`:** add `smart-admin` path filter; add `{name: smart-admin-worker, context: smart-admin-worker, image: smart-admin-worker}` to the matrix.

**`.github/workflows/ci.yml`:** add `smart-admin` path filter; add `test-python` job alongside `test-java`:

```yaml
  test-python:
    needs: precheck
    if: needs.precheck.outputs.smart-admin == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12', cache: pip }
      - run: pip install -r smart-admin-worker/requirements.txt -r smart-admin-worker/requirements-dev.txt
      - run: pytest smart-admin-worker/tests/
```

**`.github/workflows/deploy.yml`:** no changes — `deploy.sh` runs `docker compose up -d` which handles the new service by name.

**`deploy.sh`:** new `sa_worker_bootstrap` function called alongside `trade_bootstrap`:

```bash
sa_worker_bootstrap() {
    local key_file="infra/secrets/mailcow_api_key"
    if [[ ! -s "$key_file" ]]; then
        echo "ERROR: $key_file missing. Generate one in Mailcow admin panel."
        return 1
    fi
    chmod 644 "$key_file"
    chmod 700 "$(dirname "$key_file")" 2>/dev/null || true
}
```

### 8.4 Trade-service profile change

Once Plan C ships, `MockWorker` should NOT run in production. Its profile guard is `@Profile({"local","test","mockworker"})` (from Plan B final fix wave). The prod compose already omits `mockworker`, so no code change is required — MockWorker beans simply don't load in prod.

For local dev where you want the real worker but not both, run: `docker compose up -d --scale smart-admin-worker=1` with `SPRING_PROFILES_ACTIVE=docker` (no `mockworker`). For UI-only dev without the real worker, use `SPRING_PROFILES_ACTIVE=docker,mockworker`.

## 9. Error Handling

- **Kafka message processing** — tenacity `retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))`. On exhaustion, log ERROR and commit offset. The trade's state-deadline scheduler in trade-service will eventually orphan the trade if it never progresses.
- **rotate.py subprocess failure** (non-zero exit) — treated as a Kafka message failure → retried.
- **Mailcow API 5xx / timeout** — retried.
- **IMAP disconnect** — imap-tools automatically reconnects on the next poll iteration; no explicit reconnect logic needed.
- **Semaphore over-subscription** — non-fatal, message queues in `asyncio.Semaphore`'s internal FIFO; `worker-queued` event notifies trade-service which extends the deadline.

## 10. Testing

**Unit (pytest, CI on every PR):**
- `test_mailcow_client.py` — httpx mock (respx), all endpoints 200/500.
- `test_konami_client.py` — subprocess.run monkeypatched.
- `test_konami_detector.py` — sample IMAP messages (reset, news, spam) via imap-tools mock.
- `test_imap_poller.py` — imap-tools mock + Redis lock mock.
- `test_field_encryptor.py` — round-trip + cross-check against Java-produced test vectors (fixture file).
- `test_forgot_password_handler.py` — semaphore backpressure, `worker-queued` + `worker-started` publish assertions.

**Integration (Testcontainers Kafka + Redis, CI on every PR):**
- `test_end_to_end.py` — real Kafka broker + Redis. Publish `forgot-password-request`. Assert `worker-queued` and `worker-started` publish. Assert IMAP poll starts (fake IMAP fixture). Simulate Konami email arrival. Assert `konami-email-received` publishes. `rotate.py` and Mailcow are still mocked here.

**Manual staging (before release):**
- Real Konami test account (spec §11 follow-up 4 — need 2-3 test accounts provisioned first).
- Real Mailcow (mail.efbazaar.uz — already operational).
- Full happy-path trade with the real worker replacing MockWorker: seller changes email → click O'ZGARTIRDIM → within 30–60s state advances to WAITING_PASSWORD.

## 11. Success Criteria

- Plan B's `TradeE2EIT` still passes with `SPRING_PROFILES_ACTIVE=docker,mockworker` (MockWorker still available for CI E2E).
- New Python-side `test_end_to_end.py` passes on CI (Testcontainers Kafka + Redis).
- With `MAX_CONCURRENT_ROTATE=1`, 3 concurrent `forgot-password-request` messages process sequentially (FIFO), none lost.
- Worker crash (SIGKILL mid-processing): Kafka offset not committed → replay on restart processes the message.
- Overload UX: 4th queued request triggers `worker-queued` → trade-service extends deadline → user sees STATUS message in chat instead of a silent ORPHAN.
- Manual staging: full trade proposal → SUCCESS end-to-end via real Konami test account.

## 12. Follow-ups (deferred, tracked here for Plan D+)

1. **Konami test accounts** — 2-3 real accounts for staging E2E. Credentials to 1Password.
2. **DLQ topics** for messages that exhaust retries — needed if admin needs a "retry failed request" button.
3. **Prometheus scrape stack** — Grafana + alertmanager consuming `/metrics`.
4. **IMAP IDLE** — when concurrent trades exceed ~500, migrate from periodic poll to long-poll.
5. **Frontend (Plan D)** — `/trade/[id]`, `/mail/[mailboxId]`, `/admin/orphaned-mails`, `/profile/cards`, SAVDO BOSH modal in marketplace chat.
6. **Uzum PaymentAdapter (Plan E)** — replaces `MockPaymentAdapter`.
7. **TOTP admin MFA** — spec §11 follow-up 2.
8. **Konami block/rate-limit fallback** — what if Konami blocks the VPS IP? Proxy? Backoff?
9. **rotate.py stability alarms** — Konami page layout changes will break selectors. Need alert when subprocess fails > N times / hour.

## 13. Security Considerations

- **Mailcow API key** — file, `chmod 644`, owner root (Docker mounts read-only into `/run/secrets/`).
- **Chromium sandbox** — runs as non-root `app` user inside the container; kernel sandbox stays enabled.
- **rotate.py stderr** — subprocess captures stderr and logs it at INFO/ERROR. Sanitize before log: strip anything matching `password=\S+`, `reset_token=\S+`. Konami reset URLs may end up in logs — this is acceptable (URLs already in our own Mailcow inbox).
- **IMAP credentials** — per-mailbox passwords are AES-GCM-encrypted in trade-service's `mailbox` table (Plan A). Worker fetches them via the encrypted payload on `email-provisioned` / `mailbox-rotated`, decrypts using the shared master key, and uses them only for the duration of an IMAP session.
- **Master key** — same file both services share, no rotation strategy in MVP (Plan A follow-up).

## 14. Scalability

- **Worker is stateless.** Scale by Kafka consumer group — add replicas, work rebalances.
- **Per-mailbox Redis lock** prevents duplicate polling between replicas.
- **Kafka partitions by `tradeId`** — per-trade ordering is preserved regardless of replica count.
- **Chromium is the bottleneck.** MAX_CONCURRENT_ROTATE per replica; N replicas = N × MAX_CONCURRENT_ROTATE concurrent forgot-password calls. On Contabo VPS (8 GB RAM) with 2 replicas × 2 concurrent Chromium = ~600 MB peak, well within limits.
- **IMAP is not the bottleneck** — 100 concurrent trades = 100 IMAP sockets, Dovecot handles this comfortably.
