-- payment-service V4 — every top-up the userbot saw, matched or not.
--
-- Doubles as the reconciliation queue: WHERE status = 'UNMATCHED'. A separate
-- queue table would have to be kept in step with this one for no benefit.

CREATE TABLE card_credit_observations (
    id                  UUID PRIMARY KEY,
    telegram_message_id BIGINT      NOT NULL UNIQUE,
    card_last4          VARCHAR(4)  NOT NULL,
    amount_tiyin        BIGINT      NOT NULL,
    card_balance_tiyin  BIGINT,
    observed_at         TIMESTAMPTZ NOT NULL,
    raw_text            TEXT        NOT NULL,
    status              VARCHAR(24) NOT NULL,
    invoice_id          UUID        REFERENCES invoices(id),
    resolved_by         UUID,
    resolved_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The admin queue's lookup, oldest first.
CREATE INDEX ix_observations_unmatched
    ON card_credit_observations (observed_at) WHERE status = 'UNMATCHED';
