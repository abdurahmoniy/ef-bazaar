-- ==============================================================
-- trade-service V4 — trades table.
-- Escrow trade root aggregate. State + deadlines are the only mutable
-- shape; identity of parties, mailbox, cards is fixed at creation.
-- Cards and mailboxes are referenced by UUID (no FK) to keep the trade
-- aggregate loose — Plan A entities live in the same DB but we don't
-- couple deletes.
-- ==============================================================

CREATE TABLE trades (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    seller_id         UUID          NOT NULL,
    buyer_id          UUID          NOT NULL,
    listing_id        UUID,

    price_uzs         BIGINT        NOT NULL,

    state             VARCHAR(32)   NOT NULL,

    mailbox_id        UUID          NOT NULL,
    seller_card_id    UUID          NOT NULL,
    buyer_card_id     UUID          NOT NULL,

    payment_intent_id VARCHAR(128),

    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ   NOT NULL,
    state_deadline    TIMESTAMPTZ,

    terminal_reason   VARCHAR(64),

    CONSTRAINT chk_trades_state CHECK (state IN (
        'INITIATED', 'WAITING_PAYMENT', 'WAITING_EMAIL_CHANGE',
        'VERIFYING_KONAMI_LINK', 'WAITING_PASSWORD',
        'WAITING_BUYER_VERIFY', 'SUCCESS', 'REJECTED', 'ORPHANED'
    )),

    CONSTRAINT chk_trades_parties_distinct CHECK (seller_id <> buyer_id),
    CONSTRAINT chk_trades_price_positive   CHECK (price_uzs > 0)
);

CREATE INDEX idx_trades_seller_id  ON trades (seller_id);
CREATE INDEX idx_trades_buyer_id   ON trades (buyer_id);
CREATE INDEX idx_trades_state      ON trades (state);
-- Timeout scheduler: cheap lookup for "trades whose state deadline is due".
CREATE INDEX idx_trades_deadline   ON trades (state_deadline)
    WHERE state_deadline IS NOT NULL;
CREATE UNIQUE INDEX uk_trades_mailbox_active ON trades (mailbox_id)
    WHERE state NOT IN ('SUCCESS', 'REJECTED', 'ORPHANED');
