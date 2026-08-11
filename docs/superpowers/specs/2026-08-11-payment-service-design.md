# payment-service Design — card rail

**Date:** 2026-08-11
**Status:** Design (approved via brainstorming)
**Owner:** Muxiddinov
**Supersedes:** `2026-07-27-payment-service-design.md` (inPAY aggregator rail, never built)
**Depends on:** Plan A (trade-service foundation), Plan B (trade lifecycle), Plan C (smart-admin-worker)

## 1. Purpose

Replace the trust-based payment stub in trade-service with a real money system.

Today `TradeActionController.paymentConfirmed()` calls `MockPaymentAdapter.markPaid()` and advances
the trade. No money moves. The buyer is asked *"are you sure the money left your card?"* and the
system believes them.

This spec introduces `payment-service`, which owns every UZS the platform touches, and
`humo-userbot`, which is how the platform learns that money arrived.

1. **Wallets.** Every user has a balance. The numbers live in `payment_db`; the actual money sits on
   the platform's own Humo cards.
2. **Deposits.** The user is given one of those cards and an exact amount to transfer. A Telegram
   userbot watching the Humo bot observes the incoming transfer and the deposit is credited.
3. **Escrow.** A trade freezes the buyer's funds, then either settles them to the seller (minus
   commission) or releases them back. No bank operation — pure ledger movement.
4. **Withdrawals.** The user opens a ticket; an admin transfers from a platform card by hand and
   closes it.
5. **Cards.** The platform's receiving cards are managed from the admin panel, ordered, and shown to
   users at invoice time.

The provider boundary is an interface from day one. `ByCard` is the first implementation. Click,
Payme and any hosted provider drop in behind the same contract; when they are added this document is
updated rather than replaced.

### 1.1 Why this rail

The previous design routed deposits through inPAY, an aggregator. It was never built: the merchant
credentials never arrived, and the design carried a T+7 settlement window that would have required
working-capital float the platform does not have.

Card-to-card transfer to a card the platform already owns settles instantly, costs no merchant
onboarding, and needs no contract. What it costs instead is **certainty**: there is no payment API,
no signed callback, and no second source of truth. The only evidence that money arrived is a Telegram
message from the Humo bot. Every decision below follows from that one constraint.

## 2. Non-goals

- **No automated payouts.** Withdrawals are fulfilled by an admin transferring from a platform card.
- **No card holds / two-phase authorisation.** Escrow freezing happens in our ledger, not on a card.
- **No P2P transfers between users.** Requires a payment-organisation licence (20 bln UZS charter
  capital). Out of scope permanently, not just for this iteration.
- **No dispute state machine.** `BUYER_REJECT` and `TIMEOUT` behaviour stays as it is today. See
  §14 — this is a known fraud channel, explicitly deferred by the owner.
- **No multi-currency.** UZS only, stored as tiyin in `BIGINT`.
- **No refunds through the rail.** A deposit made in error is returned by the same manual transfer
  that fulfils a withdrawal ticket.
- **No human-mode trade involvement.** Human trades move money off-platform between buyer and admin.
  payment-service must never see them. See §7.5.

## 3. Decisions and rationale

### 3.1 Wallet ledger, not per-trade card charges

A trade moves numbers between accounts in our ledger. No card is touched when a trade starts, settles
or fails. Carried forward unchanged from the previous design.

### 3.2 Money sits on platform cards, tracked per card

The physical location of the money is a set of Humo cards the platform owns. The ledger holds one
aggregate asset account; the per-card balance is tracked separately for reconciliation (§10.4), not
as a ledger account. A card is an operational detail, not an accounting entity.

### 3.3 The Telegram message is the only evidence

There is no bank API. A deposit is credited because a Humo bot notification said money arrived. This
is weaker than a signed provider callback and the design compensates in three places: the parser is
isolated and tested against captured real messages (§11.1), anything that does not match exactly one
invoice is never credited automatically (§6.4), and the userbot's liveness gates invoice creation
(§10.1).

### 3.4 Amount plus card tail is the matching key

The notification carries the amount and the last four digits of the receiving card. Nothing else
identifies the payer. Two invoices that share both values are indistinguishable, so the system's
central job is to guarantee no two live invoices ever share them (§6.2).

### 3.5 The user is credited what they asked for, not what they sent

When disambiguation forces a bump, the user transfers 100 100 and their wallet receives 100 000. The
100 lands in `PLATFORM_REVENUE`.

Owner's decision. The alternative — credit the full transferred amount — was recommended because it
keeps the ledger and the card movement identical, but the owner preferred the requested amount to be
what appears. The consequence is that the bump needs a ledger destination, which is why it is booked
to revenue rather than silently dropped.

### 3.6 One active invoice per user

Without this, a user can open many invoices and exhaust the `(card, amount)` slots for common
round numbers, forcing everyone else's bump tower higher. It also removes the question of which of
your three open invoices a payment belongs to.

### 3.7 Unmatched money is never credited automatically

Late payments, payments with no invoice, and payments matching more than one invoice all go to an
admin queue. The reason is specific: an expired invoice frees its `(card, amount)` slot, so a new
invoice may already hold it. Auto-crediting a late payment would credit the wrong user.

### 3.8 Withdrawal freezes at ticket creation

The owner initially described deducting at close. Freezing at creation is mandatory: otherwise the
user spends the same money in a trade while the ticket sits in the queue, and the admin transfers
money the user no longer has.

### 3.9 The withdrawal amount is fixed

The admin transfers exactly the ticket amount or rejects the ticket. Partial fulfilment leaves a
difference that cannot be closed without an adjustment mechanism.

The transfer fee the bank charges the sending card is therefore a **platform cost**, not a deduction
from the user. It is booked to `PLATFORM_FEES`; without that account the per-card reconciliation in
§10.4 would drift by the fee on every withdrawal.

### 3.10 Commission is deducted from the seller's proceeds

Carried forward. The buyer freezes the listed price; the seller receives the price minus commission.

### 3.11 Provider abstraction is narrow, and webhooks are optional

`PaymentProvider` covers invoice creation and state. Webhook handling moves to a separate
`WebhookProvider` returned as `Optional` from the registry, because `ByCard` has no inbound webhook
and an interface method no implementation can honour is a defect, not a placeholder. This follows the
pattern the previous design already used for `CardBindingProvider` and `PayoutProvider`.

### 3.12 The userbot knows nothing about invoices

It parses and reports. All matching, crediting and money logic lives in payment-service inside a
transaction. This keeps the money rules in one testable place and means the userbot can be tested
without Telegram.

## 4. Architecture

### 4.1 Services

| Service | Stack | Port | Storage |
|---|---|---|---|
| `payment-service` | Java 21, Spring Boot 3.x | 8087 | `payment_db` (PostgreSQL) |
| `humo-userbot` | Python 3.12, Pyrogram | — | none; Telegram session file only |

nginx routes `/api/v1/payments/**` and `/api/v1/admin/payments/**` to payment-service. The userbot
exposes no HTTP surface and is not routed.

### 4.2 Provider interfaces

```java
public interface PaymentProvider {
    ProviderId    id();                                // BY_CARD | CLICK | PAYME | MOCK
    InvoiceResult createInvoice(InvoiceRequest r);
    InvoiceState  getInvoiceState(UUID invoiceId);
}

/** Only for providers that receive an inbound callback. ByCard does not. */
public interface WebhookProvider {
    ProviderResponse handleProviderRequest(ProviderRequest r);
}

/** Declared, deliberately unimplemented — withdrawals are manual. */
public interface PayoutProvider {
    PayoutResult createPayout(PayoutRequest r);
    PayoutState  getPayoutState(String providerRef);
}
```

`ProviderRegistry` resolves by `ProviderId` and returns `Optional<WebhookProvider>` /
`Optional<PayoutProvider>`, so "can this provider do X" is answered by the type system rather than at
runtime.

`InvoiceResult` is a sealed interface with two shapes, because a card invoice has no URL:

```java
public sealed interface InvoiceResult {
    record HostedCheckout(String payUrl, String providerRef) implements InvoiceResult {}
    record CardTransfer(String pan, String holderName, String expiry,
                        long transferAmountTiyin, Instant expiresAt) implements InvoiceResult {}
}
```

### 4.3 ByCard specifics

`ByCardProvider implements PaymentProvider`. `createInvoice` does not call anything external — it
allocates a `(card, amount)` slot (§6.2) and returns a `CardTransfer`. `getInvoiceState` reads our
own table. There is no `WebhookProvider` implementation.

`ByCardService` owns the matching logic invoked by the Kafka consumer. It is separate from
`ByCardProvider` because provider-facing invoice creation and credit-matching have different
lifetimes and different callers.

### 4.4 humo-userbot

A Pyrogram client logged in as **one** Telegram account — the account whose Humo bot holds every
platform card. It runs continuously; it does not start and stop with invoices, because reconnecting
churns the Telegram session and drops messages arriving during the gap.

Two responsibilities:

**Observe.** For each message in the `humocardbot` chat, decide whether it is a top-up. The Humo bot
also sends withdrawal notifications and messages about other cards; those must be ignored. A
misclassified withdrawal would be credited to a user as a deposit, so this filter is a correctness
boundary, not a convenience.

Parsed fields: amount, card last four, card balance after the movement, message timestamp. Published
to `efbazaar.payment.card-credit-observed` keyed by the Telegram message id.

**Report liveness.** A heartbeat to `efbazaar.payment.userbot-heartbeat` on a fixed interval.

The parser is a pure function over message text with no Telegram dependency (§11.1).

Reference implementation exists as a working prototype and is the source of the message grammar:

```
🎉 To'ldirish
➕ 30.000,00 UZS
📍 PAYME AJ P2P HUMO2H
💳 HUMOCARD *4556
🕓 20:41 10.08.2026
💰 31.659,16 UZS
```

`30.000,00` is UZS with `.` as thousands separator and `,` as decimal; it converts to 3 000 000
tiyin. The trailing `💰` line is the card balance after the movement.

### 4.5 The admin Telegram topic

Every invoice is announced in a dedicated thread topic of the admin Telegram group, so the people who
own the cards can watch money arriving without opening the admin panel.

The lifecycle is a **replacement, not an edit**:

1. Invoice created → post a message carrying the card, the exact transfer amount, the requested
   amount, the payer and the deadline. Keep the returned Telegram `message_id` on the invoice row.
2. Invoice paid → **delete** that message, then post a fresh one saying the payment completed, with
   the same invoice details.
3. Invoice expired → delete the message and post nothing. An expired invoice is not news, and leaving
   it would fill the topic with transfers that will never arrive.

Deleting rather than editing is the owner's choice: an unanswered invoice sitting in the topic is a
to-do item, and a completed one is a receipt. Editing in place would make the topic a list of things
that all look alike.

**payment-service does not talk to Telegram.** It calls `bot`, which already owns the token and a
`TelegramApiClient`, over the internal HTTP surface `bot` already exposes at `/bot/internal/**`. That
call is synchronous because the `message_id` must come back — Kafka would need a second topic to
return it, for no gain.

Failure to notify never blocks money. If `bot` is unreachable the invoice is still created and the
payment still credits; the notification is logged and skipped. A Telegram outage must not stop
deposits.

The thread topic id is configuration, held in the environment beside the bot token, never in git.

### 4.6 Kafka topics

| Topic | Producer | Consumer | Payload |
|---|---|---|---|
| `efbazaar.payment.card-credit-observed` | humo-userbot | payment-service | telegramMessageId, cardLast4, amountTiyin, cardBalanceTiyin, observedAt, rawText |
| `efbazaar.payment.userbot-heartbeat` | humo-userbot | payment-service | sentAt |
| `efbazaar.payment.deposit-credited` | payment-service | marketplace-service | userId, amountTiyin, invoiceId |
| `efbazaar.payment.withdrawal-requested` | payment-service | marketplace-service | ticketId, userId, amountTiyin |

The last two drive user and admin notifications. Kafka rather than HTTP for the credit topic is
deliberate: if payment-service is down when money arrives, the broker holds the message until it
returns. An HTTP call would need the userbot to build its own durable queue.

## 5. Data model

All amounts are `BIGINT` tiyin. 1 UZS = 100 tiyin.

### 5.1 Wallets

```sql
CREATE TABLE wallet_accounts (
    user_id                 UUID PRIMARY KEY,
    available_tiyin         BIGINT      NOT NULL DEFAULT 0,
    held_tiyin              BIGINT      NOT NULL DEFAULT 0,
    withdraw_pending_tiyin  BIGINT      NOT NULL DEFAULT 0,
    lifetime_deposited_tiyin BIGINT     NOT NULL DEFAULT 0,
    lifetime_earned_tiyin   BIGINT      NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_wallet_non_negative
        CHECK (available_tiyin >= 0 AND held_tiyin >= 0 AND withdraw_pending_tiyin >= 0)
);
```

The balance columns are a materialised projection of the ledger, not the source of truth. §10.3
defines the invariant that ties them together.

### 5.2 Ledger

```sql
CREATE TABLE wallet_transactions (
    id              UUID PRIMARY KEY,
    kind            VARCHAR(24) NOT NULL,   -- DEPOSIT | TRADE_HOLD | TRADE_SETTLE |
                                            -- TRADE_RELEASE | WITHDRAW_RESERVE |
                                            -- WITHDRAW_FULFIL | WITHDRAW_CANCEL | ADJUSTMENT
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,                   -- admin id for ADJUSTMENT, else null
    note            TEXT
);

CREATE TABLE ledger_entries (
    id             BIGSERIAL PRIMARY KEY,
    transaction_id UUID        NOT NULL REFERENCES wallet_transactions(id),
    account        VARCHAR(24) NOT NULL,
    user_id        UUID,                    -- null for platform accounts
    amount_tiyin   BIGINT      NOT NULL,    -- signed; debit positive, credit negative
    CONSTRAINT chk_entry_non_zero CHECK (amount_tiyin <> 0)
);
```

| Account | Type | Meaning |
|---|---|---|
| `PLATFORM_CARDS` | asset | real UZS sitting on the platform's Humo cards |
| `USER_AVAILABLE` | liability | owed to a user, spendable |
| `USER_HELD` | liability | owed to a user, frozen by an active trade |
| `WITHDRAW_PENDING` | liability | owed to a user, payout in progress |
| `PLATFORM_REVENUE` | equity | earned commission and disambiguation bumps |
| `PLATFORM_FEES` | expense | bank transfer fees the platform absorbs (§3.9) |

### 5.3 Platform cards

```sql
CREATE TABLE platform_cards (
    id                  UUID PRIMARY KEY,
    pan_encrypted       BYTEA       NOT NULL,
    pan_iv              BYTEA       NOT NULL,
    pan_tag             BYTEA       NOT NULL,
    last4               CHAR(4)     NOT NULL,
    holder_name         VARCHAR(64) NOT NULL,   -- stored upper-case
    expiry_month        SMALLINT    NOT NULL,
    expiry_year         SMALLINT    NOT NULL,
    display_order       INT         NOT NULL,
    active              BOOLEAN     NOT NULL DEFAULT TRUE,
    balance_tiyin       BIGINT,                 -- last observed, null until first message
    balance_observed_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID        NOT NULL,
    CONSTRAINT chk_platform_cards_expiry
        CHECK (expiry_month BETWEEN 1 AND 12 AND expiry_year BETWEEN 2000 AND 2100)
);

-- Matching keys on last4 alone. Two active cards sharing it would make an
-- incoming transfer unattributable.
CREATE UNIQUE INDEX uk_platform_cards_last4_active
    ON platform_cards (last4) WHERE active;

CREATE UNIQUE INDEX uk_platform_cards_order_active
    ON platform_cards (display_order) WHERE active;
```

The PAN is encrypted at rest with the existing `TradeCrypto` / `FileMasterKeyProvider` mechanism.
This is prudence against a database dump, not PCI compliance: the card is the platform's own and is
shown to users by design (§9).

### 5.4 Invoices

```sql
CREATE TABLE invoices (
    id                     UUID PRIMARY KEY,
    user_id                UUID        NOT NULL,
    provider               VARCHAR(16) NOT NULL,   -- BY_CARD | CLICK | PAYME | MOCK
    provider_ref           VARCHAR(128),           -- hosted providers only; null for BY_CARD
    card_id                UUID        REFERENCES platform_cards(id),  -- BY_CARD only; null otherwise
    requested_amount_tiyin BIGINT      NOT NULL,   -- credited to the wallet
    transfer_amount_tiyin  BIGINT      NOT NULL,   -- what the user must send
    status                 VARCHAR(16) NOT NULL,   -- PENDING | PAID | EXPIRED | CANCELLED
    expires_at             TIMESTAMPTZ NOT NULL,
    paid_at                TIMESTAMPTZ,
    admin_notice_message_id BIGINT,                -- Telegram message in the admin topic
    observation_id         UUID,                   -- no FK: invoices and observations
                                                   -- reference each other, so one side
                                                   -- stays a plain column
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_invoices_amounts
        CHECK (requested_amount_tiyin > 0 AND transfer_amount_tiyin >= requested_amount_tiyin)
);

-- The slot. This is what makes concurrent allocation safe: two requests for the
-- same amount cannot both take the same card. Application-level checking cannot
-- close that race.
CREATE UNIQUE INDEX uk_invoices_live_slot
    ON invoices (card_id, transfer_amount_tiyin) WHERE status = 'PENDING';

-- §3.6
CREATE UNIQUE INDEX uk_invoices_one_live_per_user
    ON invoices (user_id) WHERE status = 'PENDING';
```

### 5.5 Card credit observations

Every top-up the userbot saw, matched or not. Doubles as the reconciliation queue.

```sql
CREATE TABLE card_credit_observations (
    id                  UUID PRIMARY KEY,
    telegram_message_id BIGINT      NOT NULL UNIQUE,
    card_last4          CHAR(4)     NOT NULL,
    amount_tiyin        BIGINT      NOT NULL,
    card_balance_tiyin  BIGINT,
    observed_at         TIMESTAMPTZ NOT NULL,
    raw_text            TEXT        NOT NULL,
    status              VARCHAR(24) NOT NULL,   -- MATCHED | UNMATCHED | MANUALLY_RESOLVED | IGNORED
    invoice_id          UUID        REFERENCES invoices(id),
    resolved_by         UUID,
    resolved_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_observations_unmatched
    ON card_credit_observations (observed_at) WHERE status = 'UNMATCHED';
```

`raw_text` is kept deliberately: when the Humo bot changes its format, the failures are diagnosable
from stored evidence rather than from guesswork.

### 5.6 Withdrawal tickets

```sql
CREATE TABLE withdrawal_tickets (
    id                UUID PRIMARY KEY,
    user_id           UUID        NOT NULL,
    amount_tiyin      BIGINT      NOT NULL,
    user_card_id      UUID        NOT NULL REFERENCES user_cards(id),
    holder_name       VARCHAR(64) NOT NULL,
    contact_phone     VARCHAR(24) NOT NULL,
    status            VARCHAR(16) NOT NULL,   -- PENDING | PAID | REJECTED | CANCELLED
    paid_by           UUID,
    paid_at           TIMESTAMPTZ,
    paid_from_card_id UUID REFERENCES platform_cards(id),
    fee_tiyin         BIGINT,                 -- what the transfer cost the platform
    admin_note        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_tickets_amount CHECK (amount_tiyin > 0)
);
```

The user's PAN is readable by an admin fulfilling the ticket and by nobody else. Every decryption
writes a `card_reveal_audit` row: admin id, ticket id, timestamp.

### 5.6.1 User cards move here in Plan 2

trade-service **already owns a complete user-card feature**: `card/` package with `Card`,
`CardBrand`, `LuhnValidator`, `CardService` and `CardController` on `/api/v1/cards`, backed by
`V2__create_card_table.sql`, plus a profile "Kartalar" tab in the frontend with `card-detect.ts`
mirroring the backend's brand and Luhn rules.

Cards are a payment concern, so Plan 2 migrates that table into `payment_db` as `user_cards` with the
same shape, moves the package, and drops it from trade-service. `trades.seller_card_id` and
`trades.buyer_card_id` are plain UUID columns with **no foreign key**, so the move breaks no
referential integrity; they become loose references to a table in another service, which is what they
already are in spirit.

Nothing in this area is written from scratch. `LuhnValidator`, `CardBrand` and the frontend's
`card-detect.ts` are moved and reused. A plan that reimplements them is wrong.

### 5.7 Card audit and commission policy

```sql
CREATE TABLE platform_card_audit (
    id         BIGSERIAL PRIMARY KEY,
    card_id    UUID        NOT NULL,
    action     VARCHAR(24) NOT NULL,   -- CREATED | DEACTIVATED | REORDERED | ACTIVATED
    actor_id   UUID        NOT NULL,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE commission_policy (
    leg         VARCHAR(16) PRIMARY KEY,   -- DEPOSIT | TRADE
    percent_bp  INT    NOT NULL DEFAULT 0,
    flat_tiyin  BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Rates are basis points to avoid floating point. A tariff change is one `UPDATE`, no deployment.

## 6. Money flows

### 6.1 Deposit, end to end

```
1. User requests a top-up of amount A            (A >= deposit.minimum-uzs)
2. Guard: userbot heartbeat is fresh (§10.1), else refuse with a clear message
3. Guard: user has no other PENDING invoice      (§3.6)
4. Allocate a (card, transfer_amount) slot       (§6.2)
5. invoice(status=PENDING, expires_at=now+15m); no ledger movement yet
6. Announce the invoice in the admin Telegram topic (§4.5); keep the message id
7. Return card PAN, holder name, exact transfer amount, countdown, and the
   warning that the amount must match to the tiyin
8. User transfers from their own bank app
9. Humo bot notifies the platform Telegram account
10. userbot parses and publishes card-credit-observed
11. payment-service matches                      (§6.4)
12. On a credit: delete the announcement, post a completion message
```

### 6.2 Slot allocation

```
bump := 0
loop:
    for card in active cards ordered by display_order:
        transfer := A + bump
        try to insert invoice(card, transfer)      -- uk_invoices_live_slot
        on success: return (card, transfer)
        on conflict: continue
    bump := bump + 100 UZS
    if bump > deposit.max-bump-uzs: refuse, ask the user to retry shortly
```

The insert *is* the allocation. There is no read-then-write, so there is no race: the unique index
decides the winner. A conflict is an ordinary control-flow signal here, not an error.

The user is told the transfer amount differs from the requested amount and why. Their wallet receives
the requested amount (§3.5).

`deposit.max-bump-uzs` bounds the tower. Hitting it means every card is busy at every nearby amount,
which at realistic volumes means something is wrong rather than that the platform is popular; refusing
is safer than issuing an invoice a user cannot reason about.

### 6.3 Ledger movement on a credited deposit

For A = 100 000 UZS credited from a 100 100 UZS transfer:

```
PLATFORM_CARDS        D 100 100
  user.USER_AVAILABLE   C 100 000
  PLATFORM_REVENUE      C     100
```

### 6.4 Matching an observation

```
1. Insert observation row; unique telegram_message_id makes a replay a no-op
2. If card_last4 matches no active card -> IGNORED (a card we do not own)
3. Find invoices WHERE status = PENDING
                   AND card_id = <card>
                   AND transfer_amount_tiyin = <amount>
                   AND expires_at > observed_at
4. Exactly one   -> invoice PAID, ledger movement (§6.3), observation MATCHED,
                    publish deposit-credited
   Zero or many  -> observation UNMATCHED, nothing credited, admin queue
5. Update the card's balance_tiyin / balance_observed_at from the message
```

Step 4's "zero or many" branch is the one that protects users' money, and it is the branch a test
must exercise (§11.2).

An expired invoice never matches. Its slot has been released and may already belong to somebody
else's live invoice; crediting on amount alone would credit the wrong user (§3.7).

### 6.5 Manual resolution

An admin opens the unmatched queue, sees amount, card, time and raw message, and either attributes it
to a user — which credits that user through an `ADJUSTMENT` transaction carrying the admin's id and a
mandatory note — or marks it ignored. Both write `resolved_by` and `resolved_at`.

### 6.6 Trade escrow

No bank operation at any point.

```
Trade starts (80 000)
      buyer.USER_AVAILABLE  D 80 000
      buyer.USER_HELD         C 80 000

Buyer confirms (commission 5 000)
      buyer.USER_HELD       D 80 000
      seller.USER_AVAILABLE   C 75 000
      PLATFORM_REVENUE        C  5 000

Trade fails (REJECTED / ORPHANED)
      buyer.USER_HELD       D 80 000
      buyer.USER_AVAILABLE    C 80 000
```

### 6.7 Withdrawal

```
1. User opens a ticket: amount, card PAN, holder name, contact phone
   Validation: amount >= withdraw.minimum-uzs, amount <= available
2. Reserved immediately (§3.8):
      user.USER_AVAILABLE  D 75 000
      WITHDRAW_PENDING       C 75 000
3. Ticket appears in the admin queue; withdrawal-requested published
4. Admin transfers exactly 75 000 from a platform card, records which card and
   what the transfer cost (fee 750):
      WITHDRAW_PENDING  D 75 000
      PLATFORM_FEES     D    750
        PLATFORM_CARDS    C 75 750
5. If the admin rejects:
      WITHDRAW_PENDING       D 75 000
        user.USER_AVAILABLE    C 75 000
```

Step 4 is where §3.9 becomes concrete: the user receives the full ticket amount and the platform
absorbs the fee, so the card is debited more than the ticket. `PLATFORM_FEES` is what keeps the books
equal to the card.

## 7. trade-service integration

### 7.1 HOLD — synchronous, inside the transition

Insufficient balance must prevent the trade from advancing.

```
POST /internal/escrow/hold
  { tradeId, buyerId, amountTiyin, idempotencyKey }
  200 OK                      -> transition proceeds
  409 INSUFFICIENT_FUNDS      -> transition rejected, user told to top up
```

Nothing has moved when this fails, so there is no partial state to repair.

`ProposalController.accept()` additionally performs a read-only balance check and refuses to open the
trade if the buyer cannot cover the price — this avoids provisioning a mailbox, which is real
smart-admin-worker capacity, for a trade that cannot be paid for.

### 7.2 SETTLE / RELEASE — outbox with retry

These fire on terminal transitions, which must not be blocked by a network failure. A trade that
reached `SUCCESS` with the money still frozen is the worst possible outcome.

trade-service writes a `payment_outbox` row inside the same transaction as the state change. A
scheduler drains it, retrying until payment-service acknowledges. payment-service is idempotent on
`idempotencyKey` (`{tradeId}:{event}`).

```sql
CREATE TABLE payment_outbox (             -- in trade_db
    id              UUID PRIMARY KEY,
    trade_id        UUID        NOT NULL,
    operation       VARCHAR(16) NOT NULL,   -- SETTLE | RELEASE
    payload         JSONB       NOT NULL,
    attempts        INT         NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    last_error      TEXT
);
```

Backoff is exponential. Rows still incomplete after 10 attempts surface in the admin queue rather
than being dropped.

### 7.3 Internal API authentication

`/internal/**` is not routed through nginx and is reachable only from inside `efbazaar-net`. Requests
carry `X-Internal-Token` compared against `PAYMENT_INTERNAL_TOKEN`. These endpoints do not read
`X-User-Id`; the caller is a service and the user identity is an explicit field in the body.

### 7.4 Changes inside trade-service

- `payment/` package deleted: `PaymentAdapter`, `MockPaymentAdapter`, `PaymentIntent`,
  `PayoutIntent`, `PaymentStatus`, `PayoutStatus`.
- New `payment/PaymentGatewayClient` — a thin REST client for `/internal/escrow/*`.
- `Trade.paymentIntentId` is kept (nullable, no new writes) so historic rows stay readable.
- `TradeStateHandler.onEnter()` writes a `payment_outbox` row for `SUCCESS` (`SETTLE`) and for
  `REJECTED` / `ORPHANED` (`RELEASE`).

### 7.5 Human mode must not reach payment-service

Human trades move money off-platform, directly between buyer and admin. There is no hold, no
settlement and no commission.

`TradeStateHandler` must check `mode == SMART` before writing a `payment_outbox` row. Without that
guard a human trade reaching `SUCCESS` would try to settle a hold that was never taken, and the
outbox would retry it ten times before surfacing as a false admin alert.

The same applies to `paymentConfirmed()`: `WAITING_PAYMENT` does not exist on the human path, so the
hold call is unreachable there by construction — but the guard on the outbox write is not, and is
mandatory.

### 7.6 Frontend

`WaitingPaymentBuyerPanel` changes meaning. The button is no longer *"I have paid"* — it is *"freeze
the money"*. The confirm modal shows the current balance, the amount to be frozen, and the balance
afterwards. If the balance is insufficient it links to the top-up flow instead of the action.

## 8. Commission and configuration

```yaml
payment:
  deposit-provider: ${PAYMENT_DEPOSIT_PROVIDER:BY_CARD}
  deposit:
    minimum-uzs: 1000
    invoice-ttl-minutes: 15
    bump-step-uzs: 100
    max-bump-uzs: 1000
  commission:
    deposit: { percent-bp: 0,   flat-uzs: 0 }
    trade:   { percent-bp: 0,   flat-uzs: 5000 }
  withdraw:
    minimum-uzs: 10000
  userbot:
    heartbeat-timeout-seconds: 180
  admin-telegram:
    enabled: ${PAYMENT_ADMIN_TELEGRAM_ENABLED:true}
    bot-base-url: ${BOT_INTERNAL_BASE_URL:http://bot:8084}
    chat-id: ${PAYMENT_ADMIN_CHAT_ID:}
    thread-id: ${PAYMENT_ADMIN_THREAD_ID:}
```

```yaml
# humo-userbot
telegram:
  api-id: ${TELEGRAM_API_ID}
  api-hash: ${TELEGRAM_API_HASH}
  session-name: humo_userbot_session
  source-chat: humocardbot
heartbeat-interval-seconds: 60
```

The Telegram session file is a mounted secret volume, never in the image and never in git.

## 9. Cards

Two different card concepts, deliberately in separate tables:

**Platform cards** (`platform_cards`) are the platform's own receiving cards. The PAN is *published*
to any authenticated user creating an invoice — that is the product. Encryption at rest protects a
database dump; there is no PCI obligation arising from displaying a card you own.

**User withdrawal cards** live in `user_cards`, migrated from trade-service in Plan 2 (§5.6.1). This
is cardholder data belonging to someone else. It is encrypted at rest, decrypted only when an admin
opens a `PENDING` ticket, never returned in a list view, never returned to a non-admin caller, and
every decryption is audited.

Both kinds validate by Luhn using trade-service's existing `LuhnValidator`, and brand detection uses
its existing `CardBrand` — moved, not rewritten. Platform card creation additionally rejects a
`last4` already held by an active card (§5.3).

Luhn proves a number is well-formed, not that it exists. For a platform card that is acceptable: a
wrong number fails visibly on the first transfer attempt, in front of an admin.

## 10. Security, invariants and failure paths

### 10.1 The userbot's liveness gates deposits

If the Telegram session dies, the container stops, or the network drops, invoices continue to be
created and users continue to pay — and nothing is credited. They wait, and the platform does not
know.

payment-service tracks the last heartbeat. Older than `heartbeat-timeout-seconds` and invoice
creation is refused with an explicit message. Accepting money that cannot be observed is worse than
declining to take it.

An admin-visible banner shows the userbot's state so the outage is diagnosed in seconds rather than
from a pile of unmatched payments.

### 10.2 Idempotency

Three independent guards, all at the database level:

- `card_credit_observations.telegram_message_id` unique — a replayed Kafka message credits once.
- `wallet_transactions.idempotency_key` unique — a retried outbox delivery settles once.
- Invoice status moves `PENDING → PAID` only; there is no path back.

### 10.3 Ledger invariants

- Every `wallet_transactions` row's entries sum to zero.
- `wallet_accounts` projections equal the sum of that user's `ledger_entries` per account.
- No wallet column is ever negative — enforced by `chk_wallet_non_negative`, so a bug aborts the
  transaction rather than corrupting a balance.

The first two are asserted by tests (§11.2), not merely intended.

### 10.4 Per-card reconciliation

payment-service knows what each card should hold: matched credits minus withdrawals fulfilled from
it. Each Humo message carries the card's actual balance. A divergence means a message was missed —
the only signal available that the userbot was silently degraded.

The admin panel shows expected and observed side by side and flags the difference. Nothing is
corrected automatically; a divergence is a prompt to look at the unmatched queue, not something to
paper over.

### 10.5 Trust boundary, stated plainly

The platform credits real money on the strength of a Telegram message. If the Humo bot changes its
wording, deposits stop matching and pile up in the unmatched queue. That is the designed failure mode
— degraded, visible, and manually recoverable — rather than silent mis-crediting. The parser is
isolated so a format change is one file and one fixture.

## 11. Testing

### 11.1 humo-userbot

Pure parser tests over captured message text; no Telegram, no network. Fixtures come from real
captured messages.

Required cases: a top-up parses to the right amount and last four; the decimal and thousands
separators convert correctly; a **withdrawal** message is not treated as a top-up; a message about a
card the platform does not own is ignored; a malformed message is reported rather than silently
dropped.

### 11.2 payment-service

Testcontainers (PostgreSQL, Kafka), matching the existing project pattern.

- **Slot allocation under concurrency.** Two threads request the same amount simultaneously and
  receive different slots. The guard is the partial unique index; the test must use real threads and
  a non-transactional test base, as `TradeAdminAssignmentIT` does for the trade-admin capacity lock.
- **Matching.** Exactly one live invoice credits; zero credits nothing; two credit nothing. The
  negative cases matter more than the positive one.
- **Expiry.** An expired invoice releases its slot, and a payment arriving afterwards is not credited
  even though amount and card match.
- **Idempotency.** The same Telegram message id twice yields one credit.
- **Ledger invariant.** Every transaction sums to zero, including the bump case and escrow.
- **Withdrawal.** Reserve on creation blocks spending the reserved amount; rejection restores it;
  fulfilment with a fee balances through `PLATFORM_FEES`.
- **Heartbeat gate.** A stale heartbeat refuses invoice creation.

### 11.3 trade-service

The existing suite must show that a **human** trade reaching `SUCCESS` writes no `payment_outbox`
row (§7.5).

## 12. Deployment

`docker-compose.yml` gains `payment-service` (8087, `payment_db`) and `humo-userbot`. The userbot
mounts its Telegram session file from a secret volume and needs no ports.

CI deploys by path as usual: `backend/payment-service/**` and `humo-userbot/**`.

The userbot's first login is interactive — it requires a phone code and, if enabled, a 2FA password.
This is a one-time operator step producing the session file; it cannot be automated in CI and must be
documented in the deployment runbook.

## 13. Build order

Three plans. **Each plan carries its own frontend**: a slice is finished when a person can use it in
a browser, not when its endpoints respond. Deferring the UI to a fourth plan would leave the first
two unusable and untested by anyone but a test suite, and would let the backend settle on DTO shapes
the screens then have to work around — the mistake §7.6 already inherited once.

**Plan 1 — deposit rail.**
*Backend:* payment-service skeleton, wallets and ledger, `platform_cards` with admin CRUD and audit,
invoices and slot allocation, `humo-userbot`, the credit consumer, matching, the unmatched queue, the
heartbeat gate.
*Frontend:* the wallet page with balance and history; the top-up flow showing the card, holder name,
exact amount, live countdown and the exact-amount warning; the admin card manager — cards rendered as
cards, with number, holder, expiry and last observed balance on the face, plus reordering,
activate/deactivate and the add form with automatic upper-casing of the holder name; the unmatched
credits queue with manual attribution; the userbot status banner.
*Delivers:* a user tops up and spends nothing else.

**Plan 2 — withdrawal.**
*Backend:* tickets, reserve and release, admin notification, fulfilment with fee recording, per-card
reconciliation.
*Frontend:* the withdrawal request form (amount, card, holder name, phone) with the reserved-balance
explanation; the user's ticket list and status; the admin ticket queue with the PAN reveal, the
fulfil action and the reject action; expected-versus-observed card balances.

**Plan 3 — trade integration.**
*Backend:* escrow hold/settle/release, commission, the outbox in trade-service, removal of
`MockPaymentAdapter`, the `mode == SMART` guard.
*Frontend:* `WaitingPaymentBuyerPanel` rewritten per §7.6 — "freeze the money" with balance before
and after, and a link to top up when the balance is short.

## 14. Open questions and accepted risks

**Deferred by owner — `WAITING_BUYER_VERIFY` economics.** The state machine maps both `BUYER_REJECT`
and `TIMEOUT` to `REJECTED`. At that point the seller has already handed over the account: the email
is on the escrow mailbox and the password has been revealed. Once money is real, a buyer can take the
credentials, change the Konami email and password, then stay silent for 24 hours or press "account is
wrong", and receive a full release. The seller loses both the account and the payment. The proposed
remedy was `TIMEOUT → SUCCESS` and `BUYER_REJECT → DISPUTED`. The owner set this aside; until it is
addressed, released funds are a fraud-loss channel and should be monitored.

**Single point of failure.** One Telegram account observes every deposit. If it is banned,
rate-limited or logged out, the deposit rail stops. Mitigated by the heartbeat gate (§10.1), which
converts a silent failure into a visible refusal, but not eliminated. A second observer account is
the obvious hardening if volume justifies it.

**Message format coupling.** The parser depends on the Humo bot's exact wording and emoji. A format
change breaks matching until the parser is updated. Accepted; §10.5 describes the containment.

**Bump ceiling.** `max-bump-uzs` is set to 1 000 as a starting value. The right figure depends on how
often round amounts collide in practice, which is unknown until the rail carries traffic.

**Transfer fee is unmeasured.** §6.7 books the fee to `PLATFORM_FEES`, but the actual card-to-card
cost is not yet known and is entered by the admin per ticket. If it turns out to be predictable it
should become a configured rate with the admin entry as an override.

**Card-add authority.** Any `ROLE_ADMIN` may add a receiving card, with every action audited
(§5.7). Whoever controls that list controls where deposits flow. A dedicated finance role or
two-person activation was considered and set aside for the audit trail alone. Revisit before the
admin group grows beyond people who already have full platform access.

**Withdrawal cards are unvalidated.** The user types their own PAN and holder name. Luhn is the only
check. A typo surfaces when the admin's transfer fails, which is visible but wastes an admin round
trip.
