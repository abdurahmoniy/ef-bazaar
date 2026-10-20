ALTER TABLE user_subscriptions ADD COLUMN last_paid_expires_at TIMESTAMPTZ;
UPDATE user_subscriptions SET last_paid_expires_at = expires_at
 WHERE plan_code IN ('PRO', 'MAX') AND expires_at IS NOT NULL;
UPDATE user_subscriptions s SET last_paid_expires_at = p.expires_at
 FROM (SELECT user_id, MAX(expires_at) expires_at FROM plan_purchases GROUP BY user_id) p
 WHERE s.user_id = p.user_id AND s.last_paid_expires_at IS NULL;

CREATE TABLE plan_notices (
 id UUID PRIMARY KEY, user_id UUID NOT NULL, kind VARCHAR(32) NOT NULL
   CHECK (kind IN ('EXPIRING','EXPIRED','GRACE_ENDED')),
 paid_expires_at TIMESTAMPTZ NOT NULL, grace_ends_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL, read_at TIMESTAMPTZ,
 telegram_id BIGINT, telegram_status VARCHAR(32) NOT NULL DEFAULT 'NOT_CONFIGURED'
   CHECK (telegram_status IN ('NOT_CONFIGURED','PENDING','SENDING','SENT','UNCONFIRMED')),
 UNIQUE (user_id, kind, paid_expires_at)
);
CREATE INDEX plan_notices_user ON plan_notices(user_id, created_at DESC);
CREATE INDEX plan_notices_pending ON plan_notices(created_at) WHERE telegram_status = 'PENDING';
CREATE INDEX user_subscriptions_paid_end ON user_subscriptions(last_paid_expires_at);
