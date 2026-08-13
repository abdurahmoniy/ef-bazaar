-- The Telegram message announcing this invoice in the admin payments topic.
-- Null means the announcement never landed (bot down, topic unconfigured) --
-- which is allowed: notification failure must not block a deposit.

ALTER TABLE invoices
    ADD COLUMN admin_notice_message_id BIGINT;
