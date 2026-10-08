ALTER TABLE notifications ADD COLUMN verification_code VARCHAR(8);
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
                    'PARTNER_APPROVED', 'PARTNER_REJECTED', 'PARTNER_CANCELLED', 'TRADE_EMAIL_CHANGE_CODE', 'TRADE_LOGIN_CODE'));

CREATE UNIQUE INDEX uq_notifications_verification_event
 ON notifications (user_id, trade_id, type, verification_code, created_at)
 WHERE verification_code IS NOT NULL;
