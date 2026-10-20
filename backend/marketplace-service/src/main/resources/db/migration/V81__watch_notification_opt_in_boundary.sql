-- Delayed broker candidates from before an explicit opt-in boundary are not a new subscription.
ALTER TABLE watch_preferences ADD COLUMN notifications_since TIMESTAMPTZ NOT NULL DEFAULT '-infinity';
