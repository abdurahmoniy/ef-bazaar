-- ==============================================================
-- marketplace-service — V14: message reply + edit support
--
-- reply_to_id: Telegram-style quoting. ON DELETE SET NULL keeps replies
-- intact when the quoted message is deleted (frontend shows a neutral
-- "o'chirilgan xabar" placeholder for dangling references).
-- edited_at: set on every content edit; UI shows a "tahrirlangan" label.
-- Deletes are hard (Telegram semantics: gone for both sides).
-- ==============================================================

ALTER TABLE chat_messages
    ADD COLUMN reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    ADD COLUMN edited_at   TIMESTAMPTZ;
