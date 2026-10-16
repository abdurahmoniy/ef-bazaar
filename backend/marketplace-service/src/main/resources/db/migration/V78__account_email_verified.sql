-- Platforma Konami ulanishini tasdiqlagan email. Savdodan kelgan (PLATFORM)
-- manzil tasdiqlangan hisoblanadi: uni platforma o'zi o'tkazgan.
ALTER TABLE user_accounts ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
UPDATE user_accounts SET email_verified = true
 WHERE email_source = 'PLATFORM' AND email IS NOT NULL AND email <> '';

-- Custom quti bo'shadi bildirishnomasi.
ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type;
ALTER TABLE notifications ADD  CONSTRAINT chk_notifications_type
    CHECK (type IN ('CHAT_CREATED', 'CHAT_MESSAGE',
                    'TRUST_WARNING', 'TRUST_BLOCKED', 'TRUST_UNBLOCKED',
                    'TRADE_ADMIN_INVITED',
                    'WALLET_CREDITED',
                    'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED',
                    'TRADE_MAILBOX_RECEIVED', 'TRADE_MAILBOX_RETURNED',
                    'TRADE_PROPOSAL_CREATED', 'TRADE_STARTED', 'TRADE_EMAIL_CHANGED',
                    'TRADE_PASSWORD_SENT', 'TRADE_SUCCESS', 'TRADE_REJECTED', 'TRADE_ORPHANED',
                    'PARTNER_APPROVED', 'PARTNER_REJECTED', 'PARTNER_CANCELLED', 'TRADE_EMAIL_CHANGE_CODE', 'TRADE_LOGIN_CODE',
                    'CUSTOM_MAILBOX_FREED'));
