-- ==============================================================
-- marketplace-service V27 — human trade-admin support.
--
-- 1) TRADE_ADMIN_INVITED notification type, so an invitation lands in
--    the bell the admin already has instead of a second one.
--
-- 2) BUG FIX, pre-existing: chk_notifications_type has permitted only
--    CHAT_CREATED and CHAT_MESSAGE since V11, but NotificationType has
--    carried TRUST_WARNING / TRUST_BLOCKED / TRUST_UNBLOCKED since the
--    trust module shipped and TrustService writes all three. Every trust
--    notification insert has been failing on this CHECK. All six values
--    are enumerated below.
--
-- 3) chats.system_important — a live trade holds its chat open past the
--    24h sweep. Separate from chats.is_important because that column is
--    recomputed as the OR of both participants' stars (V10), so reusing
--    it would wipe a user's own star when the trade closed.
-- ==============================================================

ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type;
ALTER TABLE notifications ADD  CONSTRAINT chk_notifications_type
    CHECK (type IN ('CHAT_CREATED', 'CHAT_MESSAGE',
                    'TRUST_WARNING', 'TRUST_BLOCKED', 'TRUST_UNBLOCKED',
                    'TRADE_ADMIN_INVITED'));

ALTER TABLE notifications ADD COLUMN trade_id UUID;

ALTER TABLE chats ADD COLUMN system_important BOOLEAN NOT NULL DEFAULT FALSE;

-- The V2 partial index predicate must include the new column, or findExpired
-- stops using it and falls back to a sequential scan.
DROP INDEX idx_chats_expiry_candidates;
CREATE INDEX idx_chats_expiry_candidates ON chats (last_message_at)
    WHERE status = 'ACTIVE' AND is_important = FALSE AND system_important = FALSE;
