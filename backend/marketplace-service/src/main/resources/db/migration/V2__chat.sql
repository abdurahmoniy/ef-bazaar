-- ==============================================================
-- marketplace-service — V2: chats + chat_messages
-- Chat: xaridor listing egasiga "Egasi bilan bog'lanish" tugmasi orqali boshlaydi.
-- Bir xaridor bir listing uchun faqat bitta aktiv chat (spam oldini olish).
-- Closed chatdan keyin yangi chat ochilishi mumkin.
-- ==============================================================

CREATE TABLE chats (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    buyer_id        UUID NOT NULL,
    seller_id       UUID NOT NULL,

    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    is_important    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Auto-close 24h dan keyin (last_message_at asosida)
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,

    CONSTRAINT chk_chats_status   CHECK (status IN ('ACTIVE', 'CLOSED')),
    CONSTRAINT chk_chats_buyer_ne_seller CHECK (buyer_id <> seller_id)
);

-- Partial unique: bir xaridor + bir listing = bitta AKTIV chat (CLOSED holatida ko'pi ruxsat)
CREATE UNIQUE INDEX uk_chats_active_buyer_listing
    ON chats (buyer_id, listing_id)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_chats_seller_status     ON chats (seller_id, status);
CREATE INDEX idx_chats_buyer_status      ON chats (buyer_id, status);
CREATE INDEX idx_chats_listing           ON chats (listing_id);
-- Scheduler uchun (active + ekspire bo'lishi mumkinlarni topish)
CREATE INDEX idx_chats_expiry_candidates ON chats (last_message_at)
    WHERE status = 'ACTIVE' AND is_important = FALSE;

-- -------------------- chat_messages --------------------
CREATE TABLE chat_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id     UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_chat_created ON chat_messages (chat_id, created_at);
