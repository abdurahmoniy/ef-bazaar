# payment-service Design

**Date:** 2026-07-27
**Status:** Design (approved via brainstorming)
**Owner:** Muxiddinov
**Depends on:** Plan A (trade-service foundation), Plan B (trade lifecycle), Plan C (smart-admin-worker)

## 1. Purpose

Replace the trust-based payment stub in trade-service with a real money system.

Today `TradeActionController.paymentConfirmed()` calls `MockPaymentAdapter.markPaid()` and advances
the trade. No money moves. The buyer is asked *"are you sure the money left your card?"* and the
system believes them. `PaymentAdapter.createPayoutIntent()` exists but is never called from anywhere —
the seller leg was never built.

This spec introduces `payment-service`: a new microservice that owns every UZS the platform touches.

1. **Wallets.** Every user has a balance. The numbers live in `payment_db`; the actual money sits in
   one platform bank account.
2. **Deposits.** User tops up via an invoice against a payment provider; provider callback credits
   the wallet.
3. **Escrow.** A trade freezes the buyer's funds, then either settles them to the seller (minus
   commission) or releases them back. No bank operation — pure ledger movement.
4. **Withdrawals.** User opens a ticket; an admin performs the bank transfer by hand and records
   what was actually sent.
5. **Cards.** Moved out of trade-service, validated against the provider, and readable by an admin
   only when fulfilling a withdrawal ticket.

The provider boundary is an interface from day one so Uzum, ATMOS, Click and Payme are
interchangeable.

## 2. Non-goals

- **No automated payouts.** Withdrawals are fulfilled manually by an admin. The `PayoutProvider`
  interface is deliberately *not* built in this iteration.
- **No card holds / two-phase authorisation.** ATMOS `/hold/*` and Uzum pre-auth were evaluated and
  set aside; escrow freezing happens in our ledger, not on the card.
- **No P2P transfers or donations between users.** These require a payment-organisation licence
  (20 bln UZS minimum charter capital) and are out of scope permanently, not just for this iteration.
- **No dispute state machine.** `BUYER_REJECT` and `TIMEOUT` behaviour in `WAITING_BUYER_VERIFY` stay
  exactly as they are today. See §14 — this is a known open risk, explicitly deferred by the owner.
- **No multi-currency.** UZS only, stored as tiyin in `BIGINT`.
- **No admin UI framework.** Admin endpoints are plain REST guarded by `ROLE_ADMIN`; the UI is a
  follow-up.
- **No fiscalisation (OFD receipts).** Deferred until the provider contract is signed — see §14.

## 3. Decisions and rationale

Decisions reached during brainstorming, with the reasoning that produced them. Recorded because
several of them reverse an obvious-looking default.

### 3.1 Wallet ledger, not per-trade card charges

A card-per-trade model pays acquiring on every trade, pays a refund fee on every failed trade, and
pays a payout fee on every settlement. The wallet model moves the bank boundary to deposit and
withdrawal only. A trade becomes three rows in a table: free, instant, and trivially reversible.

`REJECTED` and `ORPHANED` trades — today the most common non-happy path — cost nothing.

### 3.2 Money stays in one platform bank account

Per-user bank sub-accounts (Uzum BaaS `accounts`) were considered and rejected for this iteration:
they require an agency agreement plus per-user KYC (passport / PINFL) at registration, which is a
large UX cost for a marketplace MVP.

The wallet is therefore a number in our database backed by a pooled balance in one account.

### 3.3 Legal position

Uzbek law (ZRU-578; CBU Board Decision No. 3431) permits electronic money issuance only to the
Central Bank and to banks. A payment organisation licence — which permits e-wallets in partnership
with a bank — requires 20 bln UZS charter capital.

A wallet that accepts deposits and permits withdrawals is, in substance, an electronic wallet. The
route that does **not** require a licence is the **payment agent** model: a non-bank legal entity
operating under an agency agreement with a bank or payment organisation needs no separate licence
(Kinstellar, *BaaS Uzbekistan*, item 3.7).

**Action, not a blocker:** the provider contract — needed regardless — must be framed as an agency
agreement rather than a plain merchant acquiring contract. Raise this during contract negotiation.

Note that the agent model also obliges us to give the customer a document confirming the service was
rendered. That is the fiscalisation requirement deferred in §2 and tracked in §14.

### 3.4 Manual withdrawal by ticket

Automating payouts requires a second provider integration (Uzum BaaS or ATMOS Payout), a funded
deposit account, and its own reconciliation. A ticket queue that an admin clears by hand delivers the
same user-visible outcome at a fraction of the build cost, and gives a human review point on every
outbound UZS while volume is low.

The ledger is written so that swapping in an automated `PayoutProvider` later changes only who calls
`WithdrawService.markPaid()`.

### 3.5 Withdrawal fee is an estimate, not revenue

The percentage quoted to the user covers the transaction cost the admin will incur making the
transfer. The admin may choose to send the full amount. Therefore the ticket reserves the **entire**
requested amount at creation, and the split between payout and fee is recorded only when the admin
reports what was actually sent. Booking the fee at creation time would report revenue we may never
earn.

### 3.6 Commission is deducted from the seller's proceeds

Flat 5 000 UZS per successful trade, taken at settlement. The listing price is always the
buyer-facing price.

The "you receive 75 000" checkbox on the listing form is a **frontend calculator only**
(`price = net + 5000`). No backend field, no per-trade commission mode. Storing a per-trade
"commission inside or on top" flag would make historical trades misread when the commission rate
changes.

### 3.7 Provider abstraction is narrow

Because payouts are manual and escrow is internal, a provider needs to do exactly three things:
create an invoice, report its state, and parse a callback. Every provider in the market offers this.
The `CardBindingProvider` and `PayoutProvider` interfaces are declared but only the former is
implemented, and only for validation.

Capability-split interfaces rather than one fat interface: Click and Payme do not offer payouts, and
a single interface would force `UnsupportedOperationException` stubs that compile but fail at
runtime.

## 4. Architecture

```
backend/payment-service/          Spring Boot 3.3.4, Java 21, uz.efbazaar.payment
  port 8087                       (8086 is smart-admin-worker)
  DB   payment_db                 own database; no other service connects to it
```

Three layers, with a hard rule at each boundary:

```
┌─ Provider layer ─────────  knows the bank API and nothing else.
│  UzumPaymentProvider        Does not know what a trade, a wallet or a
│  AtmosPaymentProvider       commission is. Only: create invoice, read
│  MockPaymentProvider        state, verify callback.
│
├─ Ledger layer ───────────  knows money and nothing else.
│  LedgerService              Does not know what a bank is. Only: move
│                             value between internal accounts atomically
│                             without breaking the invariant.
│
└─ Orchestration ──────────  binds the two.
   DepositService              invoice -> provider -> callback -> ledger
   WithdrawService             ticket -> ledger reserve -> admin -> ledger
   EscrowService               trade lifecycle -> ledger only, never provider
   CardService                 card CRUD + provider validation
```

`EscrowService` never touches a provider. That is what makes a failed trade free.

### 4.1 nginx routing

Added to `nginx/conf.d/api.conf`, following the existing trade-service block.

| Path | auth | Notes |
|---|---|---|
| `/api/v1/wallet/**` | `auth_request` | balance, transaction history |
| `/api/v1/cards/**` | `auth_request` | **moved from trade-service** |
| `/api/v1/deposits/**` | `auth_request` | create invoice, poll status |
| `/api/v1/withdrawals/**` | `auth_request` | create and list own tickets |
| `/api/v1/admin/withdrawals/**` | `auth_request` + `ROLE_ADMIN` | ticket queue, fulfilment |
| `/api/v1/payments/callbacks/{provider}` | **none** | signature + IP allowlist |
| `/internal/**` | **not exposed via nginx** | service-to-service only |

Two edits to the existing config:

1. Remove `cards` from the trade-service regex at `api.conf:139`.
2. The callback location must not carry `auth_request` — the provider does not present a JWT.
   Authenticity is established by `PaymentProvider.parseCallback()` verifying the signature, plus an
   nginx `allow`/`deny` IP allowlist. This location is deliberately given a path prefix distinct from
   every authenticated route so it cannot be confused with one during future edits.

### 4.2 Provider interfaces

```java
public interface PaymentProvider {
    ProviderId    id();                                 // UZUM | ATMOS | CLICK | PAYME | MOCK
    InvoiceResult createInvoice(InvoiceRequest r);      // amount, orderId, returnUrl
    InvoiceState  getInvoiceState(String providerRef);  // reconciliation
    ProviderEvent parseCallback(CallbackEnvelope raw);  // throws on bad signature
}

/** Declared for the card-validation flow. Optional per provider. */
public interface CardBindingProvider {
    CardBindResult beginBind(CardBindRequest r);
    BoundCard      completeBind(String bindRef, String otp);
    void           unbind(String cardToken);
}

/** Declared, deliberately unimplemented in this iteration — see §2. */
public interface PayoutProvider {
    PayoutResult createPayout(PayoutRequest r);
    PayoutState  getPayoutState(String providerRef);
}
```

`ProviderRegistry` resolves by `ProviderId` and returns `Optional<CardBindingProvider>` /
`Optional<PayoutProvider>`, so "can this provider do X" is answered by the type system rather than at
runtime.

`MockPaymentProvider` is `@Profile({"local","docker","test"})`, mirroring the existing
`MockPaymentAdapter` convention. The real provider is `@Profile("!mock")` and takes over
automatically.

Deposit provider is selected by configuration, so a cheaper acquirer can be swapped in without code
changes:

```yaml
payment:
  deposit-provider: ${PAYMENT_DEPOSIT_PROVIDER:MOCK}
```

## 5. Data model

Flyway `V1__init.sql` onwards in `payment-service`, following the project migration rule: `V<n>__` is
immutable once merged.

### 5.1 Wallets

```sql
CREATE TABLE wallet_accounts (
    user_id                   UUID PRIMARY KEY,
    available_tiyin           BIGINT NOT NULL DEFAULT 0 CHECK (available_tiyin >= 0),
    held_tiyin                BIGINT NOT NULL DEFAULT 0 CHECK (held_tiyin >= 0),
    lifetime_deposited_tiyin  BIGINT NOT NULL DEFAULT 0,
    lifetime_earned_tiyin     BIGINT NOT NULL DEFAULT 0,
    version                   BIGINT NOT NULL DEFAULT 0,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`CHECK (available_tiyin >= 0)` makes overdraft impossible at the database level, independent of
application correctness. `version` gives JPA optimistic locking so two concurrent debits cannot
interleave.

The two `lifetime_*` counters are not used in any business rule. They exist for the admin reviewing a
withdrawal ticket: *deposited 5 000 000, earned 0* is the single most useful signal that a
cash-out attempt is in progress.

### 5.2 Ledger

```sql
CREATE TABLE wallet_transactions (
    id               UUID PRIMARY KEY,
    initiator_id     UUID,                    -- NULL for system-initiated
    type             VARCHAR(32) NOT NULL,
    amount_tiyin     BIGINT      NOT NULL CHECK (amount_tiyin > 0),
    idempotency_key  VARCHAR(128) NOT NULL UNIQUE,
    trade_id         UUID,
    invoice_id       UUID,
    ticket_id        UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT wallet_transactions_type_chk CHECK (type IN (
        'DEPOSIT', 'TRADE_HOLD', 'TRADE_SETTLE', 'TRADE_RELEASE',
        'WITHDRAW_RESERVE', 'WITHDRAW_PAID', 'WITHDRAW_CANCELLED',
        'ADJUSTMENT'))
);

CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    transaction_id  UUID        NOT NULL REFERENCES wallet_transactions(id),
    account_kind    VARCHAR(24) NOT NULL,
    user_id         UUID,                       -- NULL for platform accounts
    direction       CHAR(1)     NOT NULL CHECK (direction IN ('D','C')),
    amount_tiyin    BIGINT      NOT NULL CHECK (amount_tiyin > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ledger_entries_account_kind_chk CHECK (account_kind IN (
        'USER_AVAILABLE', 'USER_HELD', 'WITHDRAW_PENDING',
        'PLATFORM_BANK', 'PLATFORM_REVENUE'))
);
CREATE INDEX ix_ledger_entries_txn  ON ledger_entries (transaction_id);
CREATE INDEX ix_ledger_entries_user ON ledger_entries (user_id, created_at DESC);
```

Two field semantics that are easy to get wrong:

- **`initiator_id` is not "whose money this is".** A `TRADE_SETTLE` moves value between two users, so
  no single owner exists. Per-user attribution lives exclusively in `ledger_entries.user_id`.
  `initiator_id` records who triggered the operation — the buyer for `TRADE_HOLD`, the withdrawing
  user for `WITHDRAW_RESERVE`, the admin for `WITHDRAW_PAID`, `NULL` for scheduler-driven work.
- **`amount_tiyin` is the principal of the operation, not the sum of its entries.** For
  `TRADE_SETTLE` on an 80 000 trade it is 80 000, even though the entries split into 75 000 and
  5 000. It exists for indexing and reporting; the ledger is the source of truth.

There is no `COMMISSION` transaction type. Commission is always a `PLATFORM_REVENUE` entry inside the
transaction that earned it, never a standalone movement — otherwise a settle and its commission could
succeed independently.

`ledger_entries` is append-only. No repository method updates or deletes a row, and a corrective
movement is a new `ADJUSTMENT` transaction, never an edit.

Account kinds, in accounting terms:

| Account | Type | Meaning |
|---|---|---|
| `PLATFORM_BANK` | asset | real UZS in the platform bank account |
| `USER_AVAILABLE` | liability | owed to a user, spendable |
| `USER_HELD` | liability | owed to a user, frozen by an active trade |
| `WITHDRAW_PENDING` | liability | owed to a user, payout in progress |
| `PLATFORM_REVENUE` | equity | earned commission |

**Invariant:** for every `transaction_id`, `SUM(amount) WHERE direction='D'` equals
`SUM(amount) WHERE direction='C'`. Enforced in `LedgerService` before commit, and re-checked by the
nightly reconciliation job (§10.3).

### 5.3 Invoices

```sql
CREATE TABLE invoices (
    id            UUID PRIMARY KEY,
    user_id       UUID        NOT NULL,
    amount_tiyin  BIGINT      NOT NULL CHECK (amount_tiyin > 0),  -- credited to wallet
    fee_tiyin     BIGINT      NOT NULL DEFAULT 0,                 -- acquiring, added on top
    charge_tiyin  BIGINT      NOT NULL,                           -- amount + fee, charged to card
    provider      VARCHAR(16) NOT NULL,
    provider_ref  VARCHAR(128),
    checkout_url  TEXT,
    status        VARCHAR(16) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at       TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ NOT NULL,
    CONSTRAINT invoices_status_chk CHECK (status IN ('PENDING','PAID','FAILED','EXPIRED')),
    CONSTRAINT invoices_charge_chk CHECK (charge_tiyin = amount_tiyin + fee_tiyin)
);
CREATE UNIQUE INDEX ux_invoices_provider_ref ON invoices (provider, provider_ref)
    WHERE provider_ref IS NOT NULL;
```

The user names the amount they want in their wallet; acquiring is added on top and shown explicitly
before they confirm.

### 5.4 Withdrawal tickets

```sql
CREATE TABLE withdrawal_tickets (
    id                     UUID PRIMARY KEY,
    user_id                UUID         NOT NULL,
    amount_tiyin           BIGINT       NOT NULL CHECK (amount_tiyin > 0),
    estimated_fee_tiyin    BIGINT       NOT NULL DEFAULT 0,
    actual_payout_tiyin    BIGINT,      -- set by admin at fulfilment
    card_id                UUID         NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
    full_name              VARCHAR(128) NOT NULL,
    contact_phone          VARCHAR(32)  NOT NULL,
    telegram_username      VARCHAR(64),
    status                 VARCHAR(16)  NOT NULL,
    admin_id               UUID,
    admin_note             TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at            TIMESTAMPTZ,
    CONSTRAINT withdrawal_tickets_status_chk CHECK (status IN ('PENDING','PAID','REJECTED')),
    CONSTRAINT withdrawal_tickets_payout_chk CHECK (
        actual_payout_tiyin IS NULL OR actual_payout_tiyin <= amount_tiyin)
);
CREATE INDEX ix_withdrawal_tickets_pending ON withdrawal_tickets (created_at)
    WHERE status = 'PENDING';
```

`ON DELETE RESTRICT` prevents deleting a card that a pending ticket depends on — otherwise the admin
opens the ticket to pay and the destination has vanished.

`full_name` and `contact_phone` are typed by the user. `telegram_username` is populated from the
`X-User-Name` header nginx already forwards. Telegram phone number is **not** available — nginx
forwards only `X-User-Id`, `X-User-Roles`, `X-Telegram-Id`, `X-User-Name` (`api.conf:159-166`) — so
the user supplies it.

`estimated_fee_tiyin` is a snapshot of what the user was warned about, kept for support disputes. It
never appears in the ledger.

### 5.5 Cards

Migrated from trade-service `V2__create_card_table.sql`, with two changes:

- **`encrypted_cvv`, `cvv_iv`, `cvv_tag` are dropped.** They are not needed for a manual bank
  transfer, and storing CVV after authorisation is prohibited under PCI DSS 3.2 in any form,
  including encrypted.
- **`provider_card_token`, `provider`, `holder_name` added.** The card is validated against the
  provider when added; the returned cardholder name is stored so an admin can compare it against the
  `full_name` on a withdrawal ticket. A mismatch is the clearest signal that someone is withdrawing
  to a card that is not theirs.

`encrypted_pan` stays. The admin needs a readable card number to make the transfer, so PAN
tokenisation alone is not sufficient while payouts are manual. Every decryption is written to
`card_reveal_audit` (§10.2).

Data migration: trade-service `cards` rows are copied into `payment_db`, ciphertext unchanged, using
the same `TradeCrypto` master key. CVV columns are not copied.

## 6. Money flows

Worked through with the owner's own example: buyer holds 100 000, seller holds 0, account listed at
80 000, commission 5 000, withdrawal fee estimated at 1%.

### 6.1 Deposit

```
1. User requests a top-up of amount A
2. fee    = commission_policy(DEPOSIT).apply(A)
   charge = A + fee                        <- shown before confirming
3. invoice(status=PENDING) created; no ledger movement yet
4. PaymentProvider.createInvoice() -> checkout_url
5. User pays; money arrives in the platform bank account
6. Provider callback -> signature verified -> idempotency key checked
      PLATFORM_BANK      D A
      user.USER_AVAILABLE  C A
   invoice.status = PAID; lifetime_deposited_tiyin += A
```

A callback may arrive twice, or never. Both are handled by the same code path: the
`wallet_transactions.idempotency_key` unique constraint makes a repeat a no-op, and a reconciliation
job polls `PENDING` invoices via `getInvoiceState()` every 30 seconds. Whichever arrives first wins;
the second is a no-op.

### 6.2 Trade escrow

No bank operation at any point.

```
Trade starts (80 000)
      buyer.USER_AVAILABLE  D 80 000
      buyer.USER_HELD         C 80 000
      buyer: available 20 000 | held 80 000

Buyer confirms
      buyer.USER_HELD       D 80 000
      seller.USER_AVAILABLE   C 75 000
      PLATFORM_REVENUE        C  5 000
      seller: available 75 000; lifetime_earned_tiyin += 75 000

Trade fails (REJECTED / ORPHANED)
      buyer.USER_HELD       D 80 000
      buyer.USER_AVAILABLE    C 80 000
```

### 6.3 Withdrawal

```
1. User picks a saved card, types full_name and contact_phone, names an amount
   Validation: amount >= withdraw.minimum (10 000 UZS), amount <= available
2. The FULL amount is reserved immediately:
      seller.USER_AVAILABLE  D 75 000
      WITHDRAW_PENDING         C 75 000
   Reserving at creation is mandatory: otherwise the user spends the same money
   on a trade while the ticket sits in the queue.
   UI warns: "approximately 74 250 will reach your card; transaction fee up to 1%"
3. Ticket appears in the admin queue
4. Admin makes the transfer and records what was ACTUALLY sent, e.g. 74 250:
      WITHDRAW_PENDING  D 75 000
      PLATFORM_BANK       C 74 250
      PLATFORM_REVENUE    C    750
   If the admin sends the full 75 000, PLATFORM_REVENUE receives nothing.
5. If the admin rejects the ticket:
      WITHDRAW_PENDING       D 75 000
      seller.USER_AVAILABLE    C 75 000
```

### 6.4 Balance check

End state of the worked example:

```
PLATFORM_BANK            100 000 - 74 250  =  25 750   (asset)
User liabilities         20 000 + 0        =  20 000
PLATFORM_REVENUE         5 000 + 750       =   5 750   (equity)
                         20 000 + 5 750    =  25 750   OK
```

## 7. trade-service integration

Two call shapes with different correctness requirements.

### 7.1 HOLD — synchronous, inside the transition

Insufficient balance must prevent the trade from advancing. `TradeActionController.paymentConfirmed()`
calls payment-service before `trades.transition(...)`:

```
POST /internal/escrow/hold
  { tradeId, buyerId, amountTiyin, idempotencyKey }
  200 OK                      -> transition proceeds
  409 INSUFFICIENT_FUNDS      -> transition rejected, user told to top up
```

Nothing has moved when this fails, so there is no partial state to repair.

`ProposalController.accept()` additionally performs a read-only balance check
(`GET /internal/wallet/{userId}/balance`) and refuses to open the trade if the buyer cannot cover the
price. This prevents provisioning a mailbox — real smart-admin-worker capacity — for a trade that
cannot be paid for.

### 7.2 SETTLE / RELEASE — outbox with retry

These fire on terminal transitions, which must not be blocked by a network failure. A trade that
reached `SUCCESS` with the money still frozen is the worst possible outcome.

trade-service writes a `payment_outbox` row inside the same transaction as the state change. A
scheduler drains it, retrying until payment-service acknowledges. payment-service is idempotent on
`idempotencyKey` (`{tradeId}:{event}`), so repeated delivery is safe.

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

Backoff is exponential. Rows still incomplete after 10 attempts are surfaced to the admin queue
rather than dropped — with manual payouts already in the design, a human is the correct fallback.

Kafka was considered and rejected here: the outbox needs an at-least-once guarantee tied to a
database transaction, which is exactly what an outbox table gives, and a Kafka round trip adds a
second failure domain for no benefit at this volume.

### 7.3 Internal API authentication

`/internal/**` is not routed through nginx and is therefore reachable only from inside
`efbazaar-net`. Requests carry a shared `X-Internal-Token` compared against
`PAYMENT_INTERNAL_TOKEN`. These endpoints do not read `X-User-Id` — the caller is a service, not a
user, and the user identity is an explicit field in the request body.

### 7.4 Changes inside trade-service

- `payment/` package deleted: `PaymentAdapter`, `MockPaymentAdapter`, `PaymentIntent`,
  `PayoutIntent`, `PaymentStatus`, `PayoutStatus`.
- `card/` package deleted; `V<n>__drop_cards.sql` after the data migration is verified.
- New `payment/PaymentGatewayClient` — a thin REST client for `/internal/escrow/*`.
- `Trade.paymentIntentId` is unused once the ledger is authoritative. It is **kept** (nullable, no
  new writes) rather than dropped, so the migration guard rule is not stressed and historic rows stay
  readable.
- `TradeStateHandler.onEnter()` writes a `payment_outbox` row for `SUCCESS` (`SETTLE`) and for
  `REJECTED` / `ORPHANED` (`RELEASE`).

### 7.5 Frontend

`WaitingPaymentBuyerPanel` (`trade-panel.tsx:446`) changes meaning. The button is no longer *"I have
paid"* — it is *"freeze the money"*. The confirm modal shows the current balance, the amount to be
frozen, and the balance afterwards. If the balance is insufficient it links to the top-up flow
instead of the action.

## 8. Commission

```yaml
payment:
  commission:
    deposit:  { percent-bp: 0,   flat-uzs: 0 }      # acquiring, added on top
    trade:    { percent-bp: 0,   flat-uzs: 5000 }   # deducted from seller proceeds
  withdraw:
    minimum-uzs: 10000
    estimated-fee-percent-bp: 100                   # 1%, UI warning only
```

Deposit and trade legs live in a `commission_policy` table keyed by leg, read through a cached
service, so a tariff change is one `UPDATE` and no deployment. Rates are basis points to avoid
floating point.

The withdrawal figure is deliberately **not** in `commission_policy`: it is a UI estimate, never
applied by the ledger. See §3.5.

## 9. Cards and PCI

The card table remains in PCI DSS scope because a readable PAN is required for manual payouts.
Mitigations that are in scope for this iteration:

- CVV is never stored — columns dropped, field removed from `CardCreateRequest`.
- PAN stays AES-GCM encrypted via the existing `TradeCrypto` / `FileMasterKeyProvider`, master key
  from a Docker secret.
- PAN is decrypted only when an admin opens a `PENDING` withdrawal ticket, never in a list view, and
  never returned to a non-admin caller.
- Every decryption writes a `card_reveal_audit` row: admin id, card id, ticket id, timestamp.
- Card creation calls `CardBindingProvider.beginBind()` for real validation. Luhn stays as a
  client-side pre-check only — `4111 1111 1111 1111` passes Luhn and must not pass card creation.

When automated payouts land, the PAN can be replaced by `provider_card_token` and this section
becomes obsolete. The `provider_card_token` column is populated from day one so that migration is a
delete, not a backfill.

## 10. Security, invariants and failure paths

### 10.1 Callback handling

`parseCallback()` verifies the provider signature and throws on mismatch; nginx additionally
restricts the location to the provider IP range. A callback for an unknown or already-terminal
invoice is acknowledged with 200 and ignored — providers retry on non-2xx, and a stuck retry loop is
worse than a dropped duplicate.

Callback bodies are persisted raw before processing, so a signature-scheme change can be replayed.

### 10.2 Authorisation

Every wallet, deposit and withdrawal endpoint scopes by `X-User-Id`; no endpoint accepts a user id in
the request body. Admin endpoints require `ROLE_ADMIN` from `X-User-Roles` and record `admin_id` on
every mutation.

### 10.3 Reconciliation

A nightly job asserts, for every wallet, that `available_tiyin` and `held_tiyin` equal the signed sum
of that user's `ledger_entries`, and that the global identity `assets = liabilities + equity` holds.
Any drift is logged at ERROR with the affected user ids and does not self-heal — a corrective
`ADJUSTMENT` is a human decision.

### 10.4 Concurrency

Wallet mutations take a pessimistic row lock (`SELECT ... FOR UPDATE`) on `wallet_accounts` ordered
by `user_id` to avoid deadlock when a single transaction touches two wallets. The `CHECK` constraints
are the backstop if a code path forgets.

### 10.5 Known failure paths

| Failure | Behaviour |
|---|---|
| Callback never arrives | 30-second poll of `PENDING` invoices reaches the same end state |
| Callback arrives twice | Unique `idempotency_key` makes the second a no-op |
| `SETTLE` call fails | Outbox retries with backoff; escalates to admin after 10 attempts |
| Admin pays but crashes before recording | Ticket stays `PENDING`; admin re-checks the bank statement. Double payment is possible and is accepted — manual fulfilment implies manual care |
| Provider returns an unknown status | Invoice stays `PENDING` until poll resolves it or it expires |
| Card deleted with pending ticket | Prevented by `ON DELETE RESTRICT` |

## 11. Testing

Following the existing trade-service pattern — Testcontainers, `AbstractPostgresIT`,
`AuthHeaderRequestPostProcessor`.

- **`LedgerServiceTest`** — the debit/credit invariant, overdraft rejection, idempotency replay.
- **`LedgerPropertyTest`** — random sequences of deposit / hold / settle / release / withdraw; assert
  after every step that assets equal liabilities plus equity and no balance is negative. This is the
  single highest-value test in the service.
- **`EscrowServiceIT`** — hold with insufficient funds, settle, release, and each replayed twice.
- **`DepositFlowIT`** — invoice creation, callback with a valid signature, callback with an invalid
  signature (rejected), duplicate callback, poll-resolves-before-callback.
- **`WithdrawFlowIT`** — below minimum, above balance, reserve, admin pays partial, admin pays full,
  admin rejects.
- **`CardControllerIT`** — migrated from trade-service; adds a case asserting CVV is not accepted and
  a Luhn-valid but provider-invalid PAN is rejected.
- **`TradeE2EIT`** in trade-service — extended so the happy path asserts real balance movement, with
  payment-service stubbed by WireMock.
- **Migration test** — trade-service cards decrypt correctly in payment-service under the same master
  key.

`MockPaymentProvider` covers local and CI; no provider sandbox credentials are required to run the
suite.

## 12. Configuration and deployment

New `.env` keys: `PAYMENT_DB_NAME`, `PAYMENT_INTERNAL_TOKEN`, `PAYMENT_DEPOSIT_PROVIDER`, and the
provider credential pair once the contract is signed.

`docker-compose.yml` gains a `payment-service` block modelled on `trade-service`: same memory
discipline (`mem_limit: 384m`, `-Xmx280m`, SerialGC), same `depends_on` health conditions, and the
`master_key` secret mounted so card ciphertext from trade-service remains readable.

`.github/workflows/deploy.yml` gains a path-filtered job for `backend/payment-service/**`.

## 13. Build order

1. Service skeleton, `payment_db`, Flyway baseline, health endpoint, compose and nginx wiring.
2. Ledger: schema, `LedgerService`, invariant tests, property test.
3. Wallet read API and balance endpoint.
4. Escrow: `/internal/escrow/*`, idempotency, service tests.
5. trade-service integration: `PaymentGatewayClient`, outbox, `TradeStateHandler` wiring, frontend
   panel change.
6. Cards: migration from trade-service, CVV removal, provider validation, reveal audit.
7. Deposit: invoices, `MockPaymentProvider`, callback endpoint, reconciliation poll.
8. Withdrawal: tickets, reserve, admin queue, fulfilment.
9. Real provider implementation once the contract and credentials land.

Steps 1–8 need no provider contract. Only step 9 does.

## 14. Open questions and deferred risks

**Deferred by owner — `WAITING_BUYER_VERIFY` economics.** The state machine currently maps both
`BUYER_REJECT` and `TIMEOUT` to `REJECTED` (`TradeStateMachine`). At that point the seller has already
handed over the account: the email is on the escrow mailbox and the password has been revealed. Once
money is real, a buyer can take the credentials, change the Konami email and password, then stay
silent for 24 hours or press "account is wrong", and receive a full release. The seller loses both
the account and the payment. The proposed remedy was `TIMEOUT -> SUCCESS` (silence is acceptance) and
`BUYER_REJECT -> DISPUTED` (admin adjudicates). The owner set this aside for a later iteration; it is
recorded here so it is not lost. Until it is addressed, released funds should be treated as a
fraud-loss channel and monitored.

**Provider selection.** Uzum and ATMOS are both viable. Uzum has the cheapest published acquiring
(0.8–1.5%) and a contract path already open; ATMOS has publicly readable documentation, a sandbox,
and native UZCARD/HUMO with OTP. Because the required surface is now only invoice + callback, this
choice does not block steps 1–8.

**Fiscalisation.** The payment-agent model obliges us to give the customer a document confirming the
service. ATMOS returns an OFD receipt URL on capture; Uzum sells fiscalisation as a separate product.
To be settled during contract negotiation.

**Tariffs.** Acquiring percentage, per-transfer cost, and any monthly minimum are contract-specific
and unpublished. `commission_policy` is configurable precisely so these can be set without a
deployment.

**Withdrawal fee percentage.** Set to 1% as a placeholder for the UI warning. The real figure follows
from what the admin's transfer actually costs.
