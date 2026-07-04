-- ==============================================================
-- marketplace-service — V12: chat message attachments
--
-- Media bytes live in Telegram (media topic, uploaded via bot) — the DB keeps
-- only the file_id + display metadata, same storage model as listing photos.
-- content stays NOT NULL: attachment-only messages store '' and the optional
-- caption otherwise.
-- ==============================================================

ALTER TABLE chat_messages
    ADD COLUMN attachment_type    VARCHAR(16),
    ADD COLUMN attachment_file_id VARCHAR(256),
    ADD COLUMN attachment_name    VARCHAR(255),
    ADD COLUMN attachment_mime    VARCHAR(128),
    ADD COLUMN attachment_size    BIGINT,

    ADD CONSTRAINT chk_chat_messages_attachment_type
        CHECK (attachment_type IS NULL OR attachment_type IN ('IMAGE', 'FILE', 'VOICE')),
    -- type and file_id come and go together
    ADD CONSTRAINT chk_chat_messages_attachment_pair
        CHECK ((attachment_type IS NULL) = (attachment_file_id IS NULL));
