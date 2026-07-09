# Smart-Admin — Escrow Trade Orchestrator

**Date:** 2026-07-10
**Status:** Design (approved)
**Owner:** Muxiddinov

## 1. Overview

Smart-admin is an escrow layer for eFootball (Konami) account transfers on efBazaar. When a seller (S) and a buyer (B) agree on a trade, smart-admin:

1. Generates a fresh mailbox on `efbazaar.uz` mail infrastructure.
2. Orchestrates a fixed state machine that leads S through changing the Konami-linked email, verifies the change via `forgot-password` + IMAP inspection, collects the Konami password from S, and gives credentials to B.
3. Hands the mailbox to the trade winner (B on success, S on rejection) as a permanent asset.
4. Runs each side of the trade in a separate secured chat so S and B never see each other's messages, only status updates.

The system is **not** a general-purpose account marketplace escrow — it is tailored to Konami's email-change flow and the platform's card-based payment model.

## 2. Scope

**In scope:**
- Trade state machine and secured chat (Java, new trade-service).
- Mailbox lifecycle (create, own, hand off).
- Konami forgot-password automation reuse (existing `rotate.py`).
- IMAP polling for verification and 2FA codes (Python worker).
- Payment abstraction with mock implementation for MVP; Uzum planned.
- Encryption at rest for chat messages, mailbox passwords, cards.
- Admin dashboard for orphaned mailboxes.

**Out of scope (deferred):**
- Real Uzum PaymentHub / Checkout integration (interface only).
- Payment escrow settlement (holding + payout regulation).
- LLM-assisted smart-admin replies.
- SMS/push notifications.
- Full webmail features (compose, reply, forward).

## 3. Trade Lifecycle

### 3.1 Pre-trade (existing marketplace chat)

```
[Marketplace chat: S ↔ B]
  either party clicks "SAVDO BOSH"
      ↓
  modal: agreed amount (UZS)
      ↓
  card entry: PAN + expiry (+ CVV for Visa)
    optional "save to profile" checkbox
      ↓
  system message posted in the marketplace chat:
    "@X proposes trade for 500,000 UZS"
    [Qabul qilaman] [Rad etaman]
      ↓
    accept  → Trade record created, both redirected to /trade/{id}
    reject  → marketplace chat continues; new proposal can be raised
    10 min  → proposal expires
```

The accepting side also submits a card at the same "accept" step (same modal). Both cards are on file before secured chat opens.

### 3.2 Secured chat state machine

| # | State | Actor | Action | Timeout | On timeout |
|---|-------|-------|--------|---------|------------|
| 1 | `INITIATED` | system | provision mailbox via Mailcow API; generate invoice; open secured chat | — | — |
| 2 | `WAITING_PAYMENT` | B | click "TO'LOV QILDIM" (MVP) | 30 min | `ORPHANED` |
| 3 | `WAITING_EMAIL_CHANGE` | S | change Konami email to provisioned address; click "O'ZGARTIRDIM" | 30 min | `ORPHANED` |
| 4 | `VERIFYING_KONAMI_LINK` | worker | trigger `rotate` forgot-password; poll IMAP for Konami email | 30 min (retry button available inside window) | `ORPHANED` |
| 5 | `WAITING_PASSWORD` | S | send Konami password via one-time password field | 30 min | `ORPHANED` |
| 6 | `WAITING_BUYER_VERIFY` | B | reveal credentials; log into eFootball; if 2FA prompted, worker forwards code from IMAP | 24 h | `REJECTED` |
| 7 | `BUYER_DECISION` | B | click "TASDIQLAYMAN" or "AKKAUNT NOTO'G'RI" | (same 24 h envelope as #6) | `REJECTED` |
| 8 | terminal | system | route mailbox and (future) payout per outcome | — | — |

Terminal outcomes:
- `SUCCESS` — mailbox handed to B; payout intent to S.
- `REJECTED` — mailbox handed to S; refund intent to B.
- `ORPHANED` — mailbox goes to admin dashboard; no automatic refund.

**No cancellation:** once STATE_1 begins, the only exits are the timeouts and terminal states above. There is no user-initiated cancel.

### 3.3 STATE_4 retry semantics

- One initial `rotate` call on entering STATE_4.
- User-visible: "QAYTA TEKSHIR" button. Clicking re-polls IMAP; **does not** re-trigger `rotate` (avoid Konami rate-limits).
- Rate limit on button: max 1 click / 5 min, up to 5 clicks within the 30-minute state window.
- If no Konami email arrives within the window, the trade moves to `ORPHANED` like any other state timeout.

## 4. Architecture

### 4.1 Service boundaries

Smart-admin is delivered as **two new services** plus frontend surfaces. Existing services (`auth-service`, `marketplace-service`, `recommendation-service`, `bot`) are not modified except for a small hand-off in the marketplace chat UI.

```
┌───────────────────────────────────────────────────────────────┐
│ Frontend (Next.js/React)                                       │
│  - /marketplace/chat/:id         (existing → adds SAVDO BOSH) │
│  - /trade/:id                    (new: secured chat)          │
│  - /mail/:mailboxId              (new: mail viewer)           │
│  - /admin/orphaned-mails         (new: admin dashboard)       │
│  - /profile/cards                (new: saved cards)           │
└──────────────────┬────────────────────────────────────────────┘
                   │ REST + WSS via nginx
                   │
       ┌───────────┴───────────────────────┐
       ▼                                   ▼
┌─────────────────────────┐  ┌───────────────────────────────────┐
│ auth-service (existing) │  │ marketplace-service (existing)    │
│  JWT issue/verify       │  │  Listings, marketplace chat        │
└─────────────────────────┘  │  + tiny addition: renders          │
                             │    "trade proposal" system message │
                             │    from Kafka into the chat        │
                             └───────────────┬───────────────────┘
                                             │ Kafka
                                             ▼
┌───────────────────────────────────────────────────────────────┐
│ trade-service (NEW, Java Spring Boot, port 8085)               │
│  Bounded context: escrow trade lifecycle                       │
│    - REST: /api/v1/trades, /api/v1/mailboxes, /api/v1/cards,   │
│            /api/v1/admin/mailboxes                             │
│    - WSS: secured chat transport                               │
│    - Trade state machine (Spring StateMachine or hand-rolled)  │
│    - TradeChat + TradeMessage                                  │
│    - Mailbox metadata + encrypted password                     │
│    - Card entity                                               │
│    - PaymentAdapter (Mock / Uzum)                              │
│    - Mail viewer IMAP proxy (session-based)                    │
│    - Admin dashboard endpoints (TOTP-gated)                    │
│    - DB: postgres schema `trade`                               │
└──────────────────┬────────────────────────────────────────────┘
                   │ Kafka
                   ▼
┌───────────────────────────────────────────────────────────────┐
│ smart-admin-worker (NEW, Python 3.12, FastAPI + kafka-python)  │
│  Bounded context: Konami/mail automation                       │
│    - Mailcow API client (mailbox CRUD, password rotate)        │
│    - rotate.py wrapper (Konami forgot-password trigger)        │
│    - IMAP poller (Konami email detection, 2FA extraction)      │
│    - Stateless — DB-less; all state lives in trade-service     │
│    - Coordination: Kafka consumer group + Redis lock per       │
│      mailbox to prevent duplicate polling                      │
└───────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────────────────────┐
│ Mailcow (mail.efbazaar.uz) — email infrastructure              │
└───────────────────────────────────────────────────────────────┘
```

### 4.2 Rationale

- **Own service for trade (trade-service):** the escrow lifecycle is a **bounded context** distinct from listings and marketplace chat. Owning its own schema, endpoints, and deploy cadence lets us evolve trade rules without touching marketplace, and lets us scale trade traffic independently of listing browse traffic.
- **marketplace-service is barely touched:** it only gets a small consumer that renders `TradeProposal` system messages into the existing marketplace chat. This preserves the existing chat contract and avoids a large rewrite.
- **Worker in Python:** `rotate.py` is Python; IMAP libraries are mature in Python. Keeping Konami-specific integration in a single Python process avoids a Java rewrite and isolates the fragile-third-party surface.
- **Kafka boundary between trade-service and worker:** the worker exposes no HTTP inbound. Simpler ops, natural retry semantics, consumer-group parallelism.
- **Shared postgres, per-service schema:** avoids operational overhead of a second postgres instance while keeping data ownership clear. Cross-schema joins are disallowed by convention.

### 4.3 Scalability

- **trade-service is stateless** at the process level. All trade state persists in postgres; WSS sessions are user-scoped and reconnect-safe. Horizontal pod autoscaler by CPU + request rate.
- **smart-admin-worker is stateless.** Scale by Kafka consumer group. Per-mailbox singleton polling enforced by short-lived Redis lock (`SET NX PX 30000` keyed on `mailbox_id`). If two workers race, only one holds the lock and polls.
- **Kafka partitioning by `trade_id`.** Guarantees per-trade event ordering. Adding partitions later increases parallelism.
- **DB connections:** trade-service uses HikariCP with pool size tied to pod count × per-pod max. Worker uses no DB.
- **IMAP fan-out:** each active trade adds one poller. At 100 concurrent trades that's 100 IMAP sockets against Mailcow. Mailcow's Dovecot handles this comfortably; if scale grows beyond ~1000, we introduce IMAP IDLE (long-poll) instead of periodic poll.
- **Autoscale target:** trade-service and worker both containerised, ready for HPA on any Kubernetes cluster. MVP runs on the current Docker Compose host; no code change required to move to k8s.

## 5. Data Model

### 5.1 New entities (Java / JPA — owned by trade-service, schema `trade`)

```
trade
  id              UUID PK
  seller_id       FK users
  buyer_id        FK users
  listing_id      FK listings (nullable — direct trade)
  price_uzs       BIGINT (tiyin)
  state           ENUM(INITIATED, WAITING_PAYMENT, WAITING_EMAIL_CHANGE,
                       VERIFYING_KONAMI_LINK, WAITING_PASSWORD,
                       WAITING_BUYER_VERIFY, SUCCESS, REJECTED, ORPHANED)
  mailbox_id      FK mailbox
  seller_card_id  FK card
  buyer_card_id   FK card
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
  expires_at      TIMESTAMPTZ    -- global 24h chat close
  state_deadline  TIMESTAMPTZ    -- per-state timeout

trade_chat
  id              UUID PK
  trade_id        FK trade
  participant     ENUM(SELLER, BUYER)
  UNIQUE(trade_id, participant)

trade_message
  id              UUID PK
  trade_chat_id   FK trade_chat
  sender_type     ENUM(USER, SMART_ADMIN, SYSTEM)
  message_type    ENUM(TEXT, BUTTON_PROMPT, STATUS, PASSWORD_ONETIME)
  encrypted_body  BYTEA          -- AES-256-GCM ciphertext
  iv              BYTEA(12)
  tag             BYTEA(16)
  metadata        JSONB          -- button ids, status codes
  created_at      TIMESTAMPTZ

trade_audit_log
  id              BIGSERIAL PK
  trade_id        FK trade
  actor_type      ENUM(USER, WORKER, SYSTEM, ADMIN)
  actor_id        UUID nullable
  action          VARCHAR(64)    -- STATE_TRANSITION, PASSWORD_REVEALED, ...
  metadata        JSONB
  created_at      TIMESTAMPTZ    -- append-only

mailbox
  id              UUID PK
  email           VARCHAR(255) UNIQUE
  owner_user_id   FK users (nullable while trade in progress; admin when orphaned)
  trade_id        FK trade (nullable after handoff)
  encrypted_password  BYTEA
  iv              BYTEA(12)
  tag             BYTEA(16)
  created_at      TIMESTAMPTZ
  handed_off_at   TIMESTAMPTZ (nullable)
  deleted_at      TIMESTAMPTZ (nullable — soft delete when user removes)

card
  id              UUID PK
  owner_user_id   FK users
  encrypted_pan   BYTEA
  pan_iv          BYTEA(12)
  pan_tag         BYTEA(16)
  last4           CHAR(4)         -- unencrypted, for display
  expiry_month    SMALLINT
  expiry_year     SMALLINT
  brand           VARCHAR(16)     -- VISA, MC, UZCARD, HUMO
  encrypted_cvv   BYTEA (nullable — only for Visa temporarily; purged after use)
  cvv_iv          BYTEA(12) (nullable)
  cvv_tag         BYTEA(16) (nullable)
  saved_to_profile BOOLEAN        -- from "save" checkbox
  created_at      TIMESTAMPTZ
```

CVV is stored **only if** we cannot process the payment immediately (e.g., MVP mock). In production with Uzum Checkout, CVV never touches our servers — the checkbox saves only PAN + expiry.

### 5.2 Redis keys

- `trade:{id}:password-key:{message_id}` — 32-byte one-time key for a PASSWORD_ONETIME message. TTL 30 min. Deleted on first read.
- `trade:{id}:mail-session:{user_id}` — short-lived session token for mail viewer IMAP proxy. TTL 15 min.

## 6. Security

**Threat model, level 2+.** See separate security section.

- **AES-256-GCM** for at-rest encryption of `trade_message.encrypted_body`, `mailbox.encrypted_password`, `card.encrypted_pan`, `card.encrypted_cvv`.
- **Per-record derived keys** via HKDF-SHA256:
  - Master key: 32-byte random, stored as Docker secret (MVP), rotated via Vault later.
  - `trade_message` key = HKDF(master, `msg-` ‖ trade_id ‖ message_id)
  - `mailbox` key = HKDF(master, `mbox-` ‖ mailbox_id)
  - `card` key = HKDF(master, `card-` ‖ card_id)
- **One-time password messages** (`PASSWORD_ONETIME`) — this is how the **Konami account password** flows from S to B through the secured chat. A fresh 256-bit key is generated per message and stored in Redis with TTL 30 min. Redis key is deleted on first read → ciphertext becomes unrecoverable even to admins. Row remains in DB with a redacted marker. (Note: this is distinct from `mailbox.encrypted_password`, which is the Mailcow account password and stays recoverable to the current mailbox owner via the mail viewer with re-auth.)
- **Log hygiene:** dedicated `TradeMessageLogger` filter drops any `PASSWORD_ONETIME` payload. Standard SLF4J + Logback with a compiled-in redactor.
- **Audit log** (`trade_audit_log`): append-only, no delete/update endpoints. All state transitions, password reveals, admin actions written.
- **Admin dashboard MFA:** platform-level TOTP required for `/admin/*` routes (added in this scope).
- **Rate limits:**
  - STATE_4 recheck button: 1 / 5 min, max 5 per trade.
  - Mailbox password reveal on `/mail/:id`: 3 reveals / hour per user (re-auth required each time).
  - Card entry attempts on trade proposal modal: 3 per trade before re-login.

## 7. Payment

### 7.1 Adapter interface (Java)

```java
public interface PaymentAdapter {
    PaymentIntent  createCheckoutIntent(Trade trade);
    PaymentStatus  checkPaymentStatus(String intentId);
    PayoutIntent   createPayoutIntent(Trade trade, String recipientCardPan);
    PayoutStatus   confirmPayout(String payoutIntentId);
    PayoutStatus   checkPayoutStatus(String payoutIntentId);
}
```

### 7.2 Implementations

- **MockPaymentAdapter (MVP):** `createCheckoutIntent` returns a synthetic id; the "TO'LOV QILDIM" button flips the intent status to `PAID`. `createPayoutIntent` writes an audit entry only.
- **UzumPaymentAdapter (later):**
  - `createCheckoutIntent` — Uzum Checkout hosted URL. Return URL back to `/trade/{id}` after payment. Status via polling `receipt.check.id` until we confirm webhooks are available.
  - `createPayoutIntent` — `receipt.account.create.transfer` with corporate `sender` + buyer's saved card PAN.
  - `confirmPayout` — `receipt.account.confirm.transfer`.
  - Auth: HTTP Basic (creds in Docker secret).
- **Provider selection:** Uzum is the intended production provider. Click stays as a backup if Uzum onboarding is blocked.

### 7.3 MVP payment flow (mock)

```
STATE_2 entry:
    trade-service creates PaymentIntent via MockPaymentAdapter → INTENT_ID
    frontend shows "TO'LOV QILDIM" button referencing INTENT_ID
B clicks:
    POST /api/v1/trades/{id}/payments/{intentId}/confirm
    → MockPaymentAdapter.markPaid()
    → state transition WAITING_PAYMENT → WAITING_EMAIL_CHANGE
```

## 8. UI Flows

### 8.1 Trade proposal (in marketplace chat)

- New button in existing `Chat` message input footer: **SAVDO BOSH**.
- Opens modal: amount (UZS) + card entry (PAN, expiry, CVV if Visa) + optional "save to profile".
- Posts a system message `TradeProposalMessage` to marketplace chat with `[Qabul qilaman] [Rad etaman]` buttons.
- On accept, the receiving side goes through the same card modal (their own card) before redirect.
- On expiry (10 min), the message renders as "expired" and cannot be actioned.

### 8.2 Secured chat `/trade/:id`

Layout is a two-column view:

```
┌─────────────────────────────────────────────────────────┐
│  🔐 Savdo #12345    Rol: Sotuvchi                        │
│  Boshqa tomon: @buyer_x ⭐4.7                            │
│  Holat: WAITING_EMAIL_CHANGE — 28 daq qoldi              │
├─────────────────────────────────────────────────────────┤
│ [smart-admin messages, user replies, buttons]           │
│ …                                                        │
│ [text input]  [attach]  [PASSWORD YUBOR]                │
└─────────────────────────────────────────────────────────┘
```

- One route, `/trade/:id`, renders differently for S vs B based on `role` returned from the API.
- Message list is that party's `TradeChat` only. The other side's messages are never fetched.
- Status header reflects the shared `Trade.state` — both sides see the same current state, but the actionable widgets differ.
- Buttons per state are rendered from a client-side lookup table keyed on `state × role`.

### 8.3 Mail viewer `/mail/:mailboxId`

- **Custom efbazaar UI, matching platform design language.** Mailcow's own SOGo webmail (at `https://mail.efbazaar.uz/SOGo/`) is **not exposed to end users** — it stays admin-only. End users interact only through the custom viewer, so we control the look, feature scope (no send/reply), and every access is audited through trade-service.
- Owner-only route. Backend proxies IMAP; frontend never sees IMAP credentials directly.
- Sections:
  - Header: mailbox address, "Ko'rsatish" (reveal password one-shot), "Yangilash" (rotate password via Mailcow API).
  - Filter tabs: **Barchasi** | **Konami** | **2FA / Verification**.
  - Message list (subject, from, date).
  - Detail pane (sanitized HTML + plain text; DOMPurify or equivalent applied server-side and again client-side).
- Password reveal requires re-auth: platform password prompt → password returned to clipboard for 10 s. The revealed password is only useful if the user wants to configure an external mail client — day-to-day usage stays inside efbazaar.
- Rotate password: calls Mailcow API, updates `mailbox.encrypted_password`, invalidates IMAP session tokens.
- **No SOGo redirect anywhere in the app.** The nginx config for `mail.efbazaar.uz/SOGo/` should require basic auth (admin-only) or return 403 for non-admin sessions — enforcement lives in the reverse-proxy layer, defined together with the Mailcow reverse-proxy config.

### 8.4 Admin dashboard `/admin/orphaned-mails`

- List of orphaned mailboxes: email, trade id, orphan reason, orphaned_at.
- Actions per row: **View inbox** (read-only IMAP proxy), **Assign to user** (manual override), **Delete**.
- Requires TOTP for entry to `/admin/*`.
- Not exposed to non-admin users.

## 9. Kafka Events

Topic naming follows the existing `efbazaar.<service>.<event>` convention.

Events published by **trade-service** → consumed by smart-admin-worker:
- `efbazaar.trade.email-provision-request` `{ tradeId }`
- `efbazaar.trade.forgot-password-request` `{ tradeId, mailboxEmail, konamiId }`
- `efbazaar.trade.imap-poll-request` `{ tradeId, mailboxEmail, purpose }` where purpose ∈ `{VERIFY_LINK, WAIT_2FA_CODE}`
- `efbazaar.trade.mailbox-rotate-request` `{ mailboxId }`

Events published by **smart-admin-worker** → consumed by trade-service:
- `efbazaar.trade.email-provisioned` `{ tradeId, mailboxEmail, encryptedPassword, iv, tag }`
- `efbazaar.trade.konami-email-received` `{ tradeId, resetLinkPresent, sender, receivedAt }`
- `efbazaar.trade.imap-2fa-code` `{ tradeId, code, receivedAt }`
- `efbazaar.trade.mailbox-rotated` `{ mailboxId, encryptedPassword, iv, tag }`

Events published by **trade-service** → consumed by marketplace-service:
- `efbazaar.trade.proposal-created` `{ proposalId, marketplaceChatId, proposerUserId, amountUzs }` — marketplace-service renders a system message in the marketplace chat with accept/reject buttons.
- `efbazaar.trade.proposal-resolved` `{ proposalId, outcome }` where outcome ∈ `{ACCEPTED, REJECTED, EXPIRED}` — marketplace-service updates the system message state.

Event payloads carry only opaque identifiers and encrypted blobs; no plaintext passwords cross Kafka.

## 10. Deployment

### 10.1 smart-admin-worker

Path: `~/IdeaProjects/ef-bazaar/smart-admin-worker/`.

Docker Compose service:

```yaml
  smart-admin-worker:
    build: ./smart-admin-worker
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-smart-admin:${IMAGE_TAG:-latest}
    container_name: efbazaar-smart-admin
    restart: unless-stopped
    environment:
      KAFKA_BOOTSTRAP_SERVERS: kafka:9092
      MAILCOW_API_URL: https://mail.efbazaar.uz/api/v1
      MAILCOW_API_KEY_FILE: /run/secrets/mailcow_api_key
      IMAP_HOST: mail.efbazaar.uz
      IMAP_PORT: 993
      MASTER_KEY_FILE: /run/secrets/master_key
    secrets:
      - mailcow_api_key
      - master_key
    depends_on:
      - kafka
    mem_limit: 256m
    networks:
      - efbazaar-net
```

`rotate.py` is checked into `smart-admin-worker/rotate/` — moved out of its current location (task follow-up: relocate and add a thin `KonamiClient` wrapper around it).

### 10.2 Secrets

- `mailcow_api_key` — provisioned via Mailcow admin UI (API keys section).
- `master_key` — 32 random bytes, base64-encoded, stored via Docker secrets. Generated once by the operator.

### 10.3 trade-service (NEW)

Path: `~/IdeaProjects/ef-bazaar/backend/trade-service/`.

- Spring Boot 3.x, Java 21, port 8085.
- Root package `uz.efbazaar.trade`.
- Postgres schema: `trade` (own migrations dir; guard-migrations CI check applies).
- REST controllers:
  - `/api/v1/trades/proposals` — create, accept, reject a trade proposal.
  - `/api/v1/trades/{id}` — read trade state, submit state-specific actions ("TO'LOV QILDIM", "O'ZGARTIRDIM", "QAYTA TEKSHIR", "TASDIQLAYMAN", "AKKAUNT NOTO'G'RI").
  - `/api/v1/trades/{id}/messages` — trade chat messages (per participant).
  - `/api/v1/mailboxes/{id}` — mail viewer IMAP proxy.
  - `/api/v1/mailboxes/{id}/password` — reveal (re-auth) / rotate.
  - `/api/v1/cards` — list, save, delete cards.
  - `/api/v1/admin/mailboxes/orphaned` — admin dashboard endpoints (TOTP-gated).
- WSS transport at `/ws/trade` for live state updates and message push.
- Kafka producer/consumer for `efbazaar.trade.*` topics.
- Encryption helper `TradeCrypto` (AES-GCM + HKDF).
- Docker Compose service:

```yaml
  trade-service:
    build: ./backend/trade-service
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-trade:${IMAGE_TAG:-latest}
    container_name: efbazaar-trade
    restart: unless-stopped
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/efbazaar?currentSchema=trade
      KAFKA_BOOTSTRAP_SERVERS: kafka:9092
      MASTER_KEY_FILE: /run/secrets/master_key
      MAILCOW_API_URL: https://mail.efbazaar.uz/api/v1
      MAILCOW_API_KEY_FILE: /run/secrets/mailcow_api_key
    secrets:
      - master_key
      - mailcow_api_key
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
    mem_limit: 512m
    networks:
      - efbazaar-net
```

### 10.4 marketplace-service (light touch)

- Add a Kafka consumer for `efbazaar.trade.proposal-created` / `proposal-resolved` that inserts / updates a `ChatMessage` with `messageType=TRADE_PROPOSAL` into the referenced marketplace chat.
- Add a small `ChatMessage.messageType` field (`TEXT` default, `TRADE_PROPOSAL` new) via Flyway migration.
- No other changes.

### 10.5 Frontend additions

- Pages: `/trade/[id]`, `/mail/[mailboxId]`, `/admin/orphaned-mails`, `/profile/cards`.
- Components: `TradeChatView`, `SmartAdminMessage`, `PasswordOneTime`, `MailInbox`, `KonamiFilter`, `CardEntryModal`.
- WSS transport reusing the existing chat WebSocket contract, with a new subprotocol for trade events.

## 11. Open Follow-ups

These are known-and-deferred, not blockers for MVP implementation:

1. Real Uzum PaymentHub integration. Need Uzum sales contact, sandbox creds, Checkout callback contract, corporate account.
2. TOTP MFA for admin dashboard — reuse or build. Auth-service currently uses JWT; adding TOTP is a small extension.
3. rotate.py relocation into `smart-admin-worker/rotate/` with a stable Python interface (`trigger_reset(konami_id, mailbox_email) -> str`).
4. Konami sender allow-list. The IMAP poller needs a maintained list of legitimate Konami sender addresses to distinguish real messages from spam.
5. Refund path when a trade orphans after B already paid (post-MVP, tied to real payment integration).
6. GDPR/data retention policy for the audit log (append-only, but eventually needs an archival tier).
7. Rate limit on trade proposal creation to prevent spam (marketplace level).

## 12. Success Criteria for MVP

- A seller and buyer can complete a full happy-path trade end-to-end without operator intervention.
- Buyer rejection routes credentials to seller as designed.
- Timeouts orphan the trade correctly at each state boundary and surface it on the admin dashboard.
- The Konami password sent in-chat is one-time and unrecoverable after the first reveal (verified by an integration test); the mailbox password remains recoverable to the current owner via re-auth.
- Mailbox handoff survives service restart (Kafka events are replayed / trade state is durable).
- Encrypted at-rest: reading raw DB rows for `trade_message.encrypted_body`, `mailbox.encrypted_password`, `card.encrypted_pan` yields no plaintext.
