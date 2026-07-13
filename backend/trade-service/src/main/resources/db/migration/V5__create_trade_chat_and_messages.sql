-- ==============================================================
-- trade-service V5 — per-party chats + encrypted messages.
-- Each trade has exactly two chats — one for the SELLER and one for
-- the BUYER — enforced by the unique (trade_id, participant) index.
-- Neither party sees the other party's chat.
-- ==============================================================

CREATE TABLE trade_chats (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id      UUID          NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    participant   VARCHAR(8)    NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_trade_chats_participant CHECK (participant IN ('SELLER', 'BUYER')),
    CONSTRAINT uk_trade_chats_trade_participant UNIQUE (trade_id, participant)
);

CREATE INDEX idx_trade_chats_trade ON trade_chats (trade_id);

CREATE TABLE trade_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_chat_id   UUID          NOT NULL REFERENCES trade_chats(id) ON DELETE CASCADE,

    sender_type     VARCHAR(16)   NOT NULL,
    message_type    VARCHAR(24)   NOT NULL,

    encrypted_body  BYTEA,
    iv              BYTEA,
    tag             BYTEA,

    metadata        JSONB,

    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_trade_messages_sender  CHECK (sender_type IN ('USER', 'SMART_ADMIN', 'SYSTEM')),
    CONSTRAINT chk_trade_messages_type    CHECK (message_type IN ('TEXT', 'BUTTON_PROMPT', 'STATUS', 'PASSWORD_ONETIME')),
    -- Body columns must be all-null (for STATUS/BUTTON_PROMPT with no user text)
    -- or all-non-null (for TEXT and PASSWORD_ONETIME).
    CONSTRAINT chk_trade_messages_body_shape CHECK (
        (encrypted_body IS NULL AND iv IS NULL AND tag IS NULL)
     OR (encrypted_body IS NOT NULL AND iv IS NOT NULL AND tag IS NOT NULL)
    )
);

CREATE INDEX idx_trade_messages_chat_created
    ON trade_messages (trade_chat_id, created_at);
