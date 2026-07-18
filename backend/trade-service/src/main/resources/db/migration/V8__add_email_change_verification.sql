-- Konami sends a 6-digit verification code to the escrow mailbox during
-- email update; smart-admin's IMAP detector publishes it and this consumer
-- persists it so the seller sees it in the trade panel without opening the
-- webmail themselves. TTL is Konami-side (5 min) — we don't enforce it,
-- just record what arrived.
ALTER TABLE trades
    ADD COLUMN email_change_verification_code VARCHAR(16),
    ADD COLUMN email_change_verification_code_at TIMESTAMPTZ;
