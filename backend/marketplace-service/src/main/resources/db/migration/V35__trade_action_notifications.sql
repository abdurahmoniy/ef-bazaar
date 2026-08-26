-- ==============================================================
-- marketplace-service V35 — trade action notification types
-- ==============================================================

ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type;
ALTER TABLE notifications ADD  CONSTRAINT chk_notifications_type
    CHECK (type IN ('CHAT_CREATED', 'CHAT_MESSAGE',
                    'TRUST_WARNING', 'TRUST_BLOCKED', 'TRUST_UNBLOCKED',
                    'TRADE_ADMIN_INVITED',
                    'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED',
                    'TRADE_MAILBOX_RECEIVED', 'TRADE_MAILBOX_RETURNED',
                    'TRADE_PROPOSAL_CREATED', 'TRADE_STARTED', 'TRADE_EMAIL_CHANGED',
                    'TRADE_PASSWORD_SENT', 'TRADE_SUCCESS', 'TRADE_REJECTED', 'TRADE_ORPHANED'));
