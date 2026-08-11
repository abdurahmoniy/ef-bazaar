-- payment-service V1 — wallets and the double-entry ledger.
--
-- wallet_accounts is a PROJECTION of ledger_entries, not the source of truth.
-- It exists so a balance read is one row rather than an aggregate over the
-- whole ledger. LedgerService is the only writer of both and keeps them equal.

CREATE TABLE wallet_accounts (
    user_id                  UUID PRIMARY KEY,
    available_tiyin          BIGINT      NOT NULL DEFAULT 0,
    held_tiyin               BIGINT      NOT NULL DEFAULT 0,
    withdraw_pending_tiyin   BIGINT      NOT NULL DEFAULT 0,
    lifetime_deposited_tiyin BIGINT      NOT NULL DEFAULT 0,
    lifetime_earned_tiyin    BIGINT      NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_wallet_non_negative CHECK (
        available_tiyin >= 0
        AND held_tiyin >= 0
        AND withdraw_pending_tiyin >= 0)
);

CREATE TABLE wallet_transactions (
    id              UUID PRIMARY KEY,
    kind            VARCHAR(24)  NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by      UUID,
    note            TEXT
);

CREATE TABLE ledger_entries (
    id             BIGSERIAL PRIMARY KEY,
    transaction_id UUID        NOT NULL REFERENCES wallet_transactions(id),
    account        VARCHAR(24) NOT NULL,
    user_id        UUID,
    amount_tiyin   BIGINT      NOT NULL,
    CONSTRAINT chk_entry_non_zero CHECK (amount_tiyin <> 0)
);

CREATE INDEX ix_ledger_entries_tx   ON ledger_entries (transaction_id);
CREATE INDEX ix_ledger_entries_user ON ledger_entries (user_id, account)
    WHERE user_id IS NOT NULL;
