-- marketplace V58 — the notification a user gets when their wallet is topped up.
--
-- Two new columns rather than a new table: this is one more row in the bell the
-- user already has, and a second notification store would have to be merged
-- back together on every read.
--
-- amount_tiyin: the bell says HOW MUCH arrived, so it has to be stored. The
-- balance afterwards deliberately is NOT: a notification list is read days
-- later, and a balance frozen at the moment of one row would be wrong by then
-- while looking authoritative. The row links to the wallet, which is live.
--
-- payment_ref: the ledger transaction. Kafka is at-least-once, so a redelivery
-- would otherwise write the same "your wallet was topped up" twice. The invoice
-- id cannot serve as the key — a payment an admin attributes by hand has no
-- invoice at all.

ALTER TABLE notifications ADD COLUMN amount_tiyin BIGINT;
ALTER TABLE notifications ADD COLUMN payment_ref  UUID;

-- The dedupe lookup, and only for the rows that carry a reference.
CREATE INDEX ix_notifications_payment_ref
    ON notifications (user_id, payment_ref) WHERE payment_ref IS NOT NULL;

-- The CHECK enumerates every legal type, so a new one is unwritable until it is
-- listed here. That has bitten this table twice: the trust types were rejected
-- from V11 until V29 noticed, and the withdrawal types from the day they
-- shipped until V34 — meaning not one payout notification was ever stored, and
-- nothing in the sending code ever complained.
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
                    'PARTNER_APPROVED', 'PARTNER_REJECTED', 'PARTNER_CANCELLED'));
