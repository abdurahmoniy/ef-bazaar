-- ==============================================================
-- marketplace-service — V10: per-user chat state (star + hide)
--
-- "Delete" is one-sided: hiding a chat removes it from MY list only; the
-- partner keeps chatting. A new incoming message clears hidden_at so the
-- conversation resurfaces (WhatsApp "Delete for me" semantics).
--
-- Star ("Muhim") likewise becomes per-user. chats.is_important stays as the
-- AGGREGATE (true when either side starred) because the expiry scheduler and
-- its partial index key off it — recomputed on every toggle.
-- ==============================================================

CREATE TABLE chat_participants (
    chat_id      UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL,
    is_important BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_at    TIMESTAMPTZ,
    PRIMARY KEY (chat_id, user_id)
);

-- Chat list query: "my visible chats"
CREATE INDEX idx_chat_participants_visible ON chat_participants (user_id) WHERE hidden_at IS NULL;

-- Backfill: both sides inherit the legacy shared flag
INSERT INTO chat_participants (chat_id, user_id, is_important)
SELECT id, buyer_id, is_important FROM chats
UNION ALL
SELECT id, seller_id, is_important FROM chats;
