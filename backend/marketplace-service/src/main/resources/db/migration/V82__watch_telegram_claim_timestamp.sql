ALTER TABLE watch_deliveries ADD COLUMN telegram_claimed_at TIMESTAMPTZ;
-- Pre-column claims have an unknown outcome; never automatically resend them.
UPDATE watch_deliveries SET telegram_state='UNCONFIRMED' WHERE telegram_state='SENDING';
