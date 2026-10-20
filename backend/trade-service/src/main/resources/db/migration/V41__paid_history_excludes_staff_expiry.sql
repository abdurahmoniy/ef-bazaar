-- V35 originally backfilled every non-STANDARD finite expiry. STAFF is an
-- unpaid entitlement and must not anchor grace. Preserve V35's applied checksum.
-- These migrations run before consumers start; payment's canonical history replay
-- restores any independently known paid history after startup.
UPDATE user_plan_view SET last_paid_expires_at = NULL
 WHERE plan_code = 'STAFF' AND expires_at IS NOT NULL
   AND last_paid_expires_at = expires_at;
