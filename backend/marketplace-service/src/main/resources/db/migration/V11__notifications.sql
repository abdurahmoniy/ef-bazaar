-- ==============================================================
-- marketplace-service — V11: per-user web notifications
--
-- Backs the in-app notification center (bell + read/unread). Rows are
-- produced by ChatService (chat created → seller; new message → recipient).
-- CHAT_MESSAGE rows are UPSERTed per (user, chat) while unread so a burst of
-- messages yields one bumped notification instead of N rows.
-- ==============================================================

CREATE TABLE notifications (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL,
    type               VARCHAR(32) NOT NULL,
    chat_id            UUID,
    listing_id         UUID,
    actor_display_name VARCHAR(64),
    read_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_notifications_type CHECK (type IN ('CHAT_CREATED', 'CHAT_MESSAGE'))
);

-- Bell badge: "how many unread"
CREATE INDEX idx_notifications_user_unread
    ON notifications (user_id) WHERE read_at IS NULL;
-- Dropdown list: newest first
CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC);
