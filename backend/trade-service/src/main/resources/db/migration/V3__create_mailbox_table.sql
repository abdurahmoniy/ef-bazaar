-- ==============================================================
-- trade-service — mailbox metadata.
-- The real mailbox lives inside Mailcow (mail.efbazaar.uz).
-- This table stores the address, current owner, and the encrypted
-- Mailcow password so a trade winner can re-fetch it via re-auth.
-- ==============================================================

CREATE TABLE mailboxes (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                VARCHAR(255) NOT NULL UNIQUE,

    owner_user_id        UUID,
    trade_id             UUID,

    encrypted_password   BYTEA        NOT NULL,
    password_iv          BYTEA        NOT NULL,
    password_tag         BYTEA        NOT NULL,

    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    handed_off_at        TIMESTAMPTZ,
    deleted_at           TIMESTAMPTZ
);

CREATE INDEX idx_mailboxes_owner_user_id ON mailboxes (owner_user_id);
CREATE INDEX idx_mailboxes_trade_id      ON mailboxes (trade_id);
