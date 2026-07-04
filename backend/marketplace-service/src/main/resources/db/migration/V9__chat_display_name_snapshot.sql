-- ==============================================================
-- marketplace-service — V9: snapshot buyer/seller display names on chats
-- Marketplace-service has no direct access to auth's user table (CLAUDE.md
-- rule: services never touch another service's DB). At chat creation time
-- ChatService resolves both names via auth-service's /internal endpoint and
-- freezes them here — the UI can render "Sotuvchi bilan chat" → real name
-- without any per-request lookup, and stays intact even if the caller later
-- renames themselves in auth.
-- ==============================================================

ALTER TABLE chats
    ADD COLUMN buyer_display_name  VARCHAR(64),
    ADD COLUMN seller_display_name VARCHAR(64);
