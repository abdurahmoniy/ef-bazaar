-- ==============================================================
-- marketplace-service — V13: per-user read cursor
--
-- Powers the unread badge in the chat list and the "Yangi xabarlar" divider
-- inside an open chat. Updated by POST /chats/{id}/read whenever the viewer
-- opens (or is watching) the conversation.
--
-- Backfill to NOW() so the rollout doesn't mark all history as unread.
-- ==============================================================

ALTER TABLE chat_participants
    ADD COLUMN last_read_at TIMESTAMPTZ;

UPDATE chat_participants SET last_read_at = NOW();
