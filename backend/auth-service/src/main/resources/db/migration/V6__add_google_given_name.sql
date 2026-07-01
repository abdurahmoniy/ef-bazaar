-- ==============================================================
-- V5 hot-patch — the entity introduced `google_given_name` alongside the
-- Google-first user path but the accompanying migration forgot to add the
-- column, so schema validation refused to boot the service after deploy.
-- Splitting into V6 (rather than editing V5) keeps Flyway happy: V5's
-- checksum on production is now frozen and any attempt to mutate it would
-- fail with a checksum mismatch.
-- ==============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS google_given_name VARCHAR(128);
