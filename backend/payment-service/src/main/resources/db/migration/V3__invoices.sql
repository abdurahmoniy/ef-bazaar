-- payment-service V3 — deposit invoices.
--
-- An incoming transfer identifies itself by amount and the receiving card's
-- last four digits, and nothing else. The two partial unique indexes below are
-- what make that enough to attribute a payment.

CREATE TABLE invoices (
    id                     UUID PRIMARY KEY,
    user_id                UUID        NOT NULL,
    provider               VARCHAR(16) NOT NULL,
    provider_ref           VARCHAR(128),
    card_id                UUID        REFERENCES platform_cards(id),
    requested_amount_tiyin BIGINT      NOT NULL,
    transfer_amount_tiyin  BIGINT      NOT NULL,
    status                 VARCHAR(16) NOT NULL,
    expires_at             TIMESTAMPTZ NOT NULL,
    paid_at                TIMESTAMPTZ,
    observation_id         UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_invoices_amounts CHECK (
        requested_amount_tiyin > 0
        AND transfer_amount_tiyin >= requested_amount_tiyin)
);

-- THE SLOT. Two live invoices may never share a card and an amount, because a
-- Humo notification carrying that pair could not then be attributed. This is
-- also how concurrent allocation is made safe: the insert is the claim.
CREATE UNIQUE INDEX uk_invoices_live_slot
    ON invoices (card_id, transfer_amount_tiyin) WHERE status = 'PENDING';

-- One live invoice per user: without it a user can exhaust the slots for
-- common round numbers and drive everyone else's bump tower higher.
CREATE UNIQUE INDEX uk_invoices_one_live_per_user
    ON invoices (user_id) WHERE status = 'PENDING';

-- The expiry sweeper's lookup.
CREATE INDEX ix_invoices_pending_expiry
    ON invoices (expires_at) WHERE status = 'PENDING';
