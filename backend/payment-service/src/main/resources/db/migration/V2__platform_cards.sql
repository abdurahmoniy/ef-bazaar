-- payment-service V2 — the platform's own receiving cards.
--
-- These are shown to users: a deposit works by the user transferring to one of
-- them. The PAN is encrypted at rest against a database dump, not for PCI --
-- a card you publish deliberately is not customer cardholder data.

CREATE TABLE platform_cards (
    id                  UUID PRIMARY KEY,
    pan_encrypted       BYTEA       NOT NULL,
    pan_iv              BYTEA       NOT NULL,
    pan_tag             BYTEA       NOT NULL,
    last4               VARCHAR(4)  NOT NULL,
    holder_name         VARCHAR(64) NOT NULL,
    expiry_month        SMALLINT    NOT NULL,
    expiry_year         SMALLINT    NOT NULL,
    brand               VARCHAR(16) NOT NULL,
    display_order       INT         NOT NULL,
    active              BOOLEAN     NOT NULL DEFAULT TRUE,
    balance_tiyin       BIGINT,
    balance_observed_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID        NOT NULL,
    CONSTRAINT chk_platform_cards_expiry
        CHECK (expiry_month BETWEEN 1 AND 12 AND expiry_year BETWEEN 2000 AND 2100)
);

-- An incoming transfer is attributed by last4 alone. Two active cards sharing
-- it would make the payment unattributable, so the database refuses.
CREATE UNIQUE INDEX uk_platform_cards_last4_active
    ON platform_cards (last4) WHERE active;

-- display_order is the order the slot allocator walks; ties would make
-- allocation non-deterministic.
CREATE UNIQUE INDEX uk_platform_cards_order_active
    ON platform_cards (display_order) WHERE active;

CREATE TABLE platform_card_audit (
    id         BIGSERIAL PRIMARY KEY,
    card_id    UUID        NOT NULL,
    action     VARCHAR(24) NOT NULL,
    actor_id   UUID        NOT NULL,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_platform_card_audit_card ON platform_card_audit (card_id, created_at DESC);
