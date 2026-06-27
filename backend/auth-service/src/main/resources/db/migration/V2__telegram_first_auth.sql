-- ==============================================================
-- Telegram-first auth model:
--   * Register = Telegram (telegram_id mandatory for all new users)
--   * Verify   = Google link in profile (sets google_id + email)
--   * Login    = either Telegram OR Google (google_id lookup)
--
-- Drops legacy username/password_hash columns (no production data).
-- ==============================================================

DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_users_email;

ALTER TABLE users DROP COLUMN IF EXISTS username;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN google_id  VARCHAR(255),
    ADD COLUMN verified   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
CREATE UNIQUE INDEX idx_users_email     ON users (LOWER(email)) WHERE email IS NOT NULL;
