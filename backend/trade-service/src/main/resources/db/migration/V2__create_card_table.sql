-- ==============================================================
-- trade-service — card storage.
-- PAN is encrypted at rest with per-card HKDF-derived AES-256-GCM.
-- CVV is only stored when strictly needed (mock adapter); production
-- payment providers must never see our servers hold CVV.
-- ==============================================================

CREATE TABLE cards (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    owner_user_id     UUID         NOT NULL,

    encrypted_pan     BYTEA        NOT NULL,
    pan_iv            BYTEA        NOT NULL,
    pan_tag           BYTEA        NOT NULL,

    last4             CHAR(4)      NOT NULL,
    expiry_month      SMALLINT     NOT NULL,
    expiry_year       SMALLINT     NOT NULL,
    brand             VARCHAR(16)  NOT NULL,

    encrypted_cvv     BYTEA,
    cvv_iv            BYTEA,
    cvv_tag           BYTEA,

    saved_to_profile  BOOLEAN      NOT NULL DEFAULT FALSE,

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cards_brand    CHECK (brand IN ('VISA', 'MC', 'UZCARD', 'HUMO')),
    CONSTRAINT chk_cards_month    CHECK (expiry_month BETWEEN 1 AND 12),
    CONSTRAINT chk_cards_year     CHECK (expiry_year BETWEEN 2020 AND 2099),
    CONSTRAINT chk_cards_cvv_all_or_nothing
        CHECK ((encrypted_cvv IS NULL AND cvv_iv IS NULL AND cvv_tag IS NULL)
            OR (encrypted_cvv IS NOT NULL AND cvv_iv IS NOT NULL AND cvv_tag IS NOT NULL))
);

CREATE INDEX idx_cards_owner_user_id ON cards (owner_user_id);
