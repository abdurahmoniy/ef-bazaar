-- Ownership does not grant access to the previous owner's mail history.
ALTER TABLE mailboxes ADD COLUMN owner_mail_visible_from TIMESTAMPTZ;

-- Backfill only when a matching audit proves the latest ownership came from
-- this trade. Later manual reassignment is newer than the audit and uses the
-- safe handoff-time fallback instead. Include both exchange sides and legacy
-- trades without sides. Never widen access based on email address alone.
UPDATE mailboxes m
   SET owner_mail_visible_from = COALESCE((
       SELECT t.created_at
         FROM trades t
         JOIN trade_audit_log a ON a.trade_id = t.id
        WHERE t.created_at <= m.handed_off_at
          AND a.created_at >= m.handed_off_at
          AND (
              (((a.action = 'TRADE_SUCCESS' AND t.state = 'SUCCESS')
                OR (a.action = 'TRADE_REJECTED' AND t.state = 'REJECTED')
                OR (a.action = 'TRADE_ORPHANED' AND t.state = 'ORPHANED'
                    AND a.metadata->>'mailboxesHandedBack' = 'true'))
               AND (
                   EXISTS (
                       SELECT 1 FROM trade_sides s
                        WHERE s.trade_id = t.id AND s.mailbox_id = m.id
                          AND m.owner_user_id = CASE
                              WHEN (t.state = 'SUCCESS' AND s.role = 'SELLER')
                                OR (t.state IN ('REJECTED', 'ORPHANED') AND s.role = 'BUYER')
                              THEN t.buyer_id ELSE t.seller_id END
                   )
                   OR (t.mailbox_id = m.id
                       AND NOT EXISTS (SELECT 1 FROM trade_sides s WHERE s.trade_id = t.id)
                       AND m.owner_user_id = CASE WHEN t.state = 'SUCCESS'
                                                 THEN t.buyer_id ELSE t.seller_id END)
               ))
              OR (t.mode = 'HUMAN' AND t.state IN ('IN_PROGRESS', 'WAITING_CLOSE_CONFIRM')
                  AND t.mailbox_id = m.id AND t.assigned_admin_id = m.owner_user_id
                  AND t.admin_accepted_at IS NOT NULL AND t.admin_accepted_at <= m.handed_off_at
                  AND a.action = 'STATE_TRANSITION' AND a.actor_id = m.owner_user_id
                  AND a.metadata->>'event' = 'ADMIN_ACCEPTED')
          )
        ORDER BY a.created_at DESC
        LIMIT 1
   ), m.handed_off_at, m.created_at);
