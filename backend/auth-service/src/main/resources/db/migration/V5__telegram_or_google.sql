-- ==============================================================
-- Auth becomes symmetric: either Telegram or Google is a valid signup
-- path, and `verified` follows from having both.
--
-- Before:
--   telegram_id NOT NULL, google_id nullable, verified stored as bool.
--   Google login was link-only — /auth/google/login 404'd if the caller's
--   google_id wasn't already attached to a Telegram user.
--
-- After:
--   telegram_id and google_id both nullable, but a CHECK guarantees at
--   least one is present per row. verified is a computed property in the
--   application layer (googleId != null && telegramId != null), so we drop
--   the column — a single source of truth avoids the classic "DB says
--   verified=true but the linked identity was removed" drift.
-- ==============================================================

ALTER TABLE users
    ALTER COLUMN telegram_id DROP NOT NULL;

ALTER TABLE users
    ADD CONSTRAINT chk_users_at_least_one_identity
        CHECK (telegram_id IS NOT NULL OR google_id IS NOT NULL);

ALTER TABLE users
    DROP COLUMN verified;
