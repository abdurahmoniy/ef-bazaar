ALTER TABLE user_plan_view ADD COLUMN last_paid_expires_at timestamptz;
UPDATE user_plan_view SET last_paid_expires_at = expires_at
 WHERE plan_code <> 'STANDARD' AND expires_at IS NOT NULL;
