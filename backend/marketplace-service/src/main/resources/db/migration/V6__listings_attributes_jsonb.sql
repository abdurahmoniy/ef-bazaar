-- ==============================================================
-- Phase 1b — move listing gameplay fields into JSONB.
--
-- Every field previously modelled as a typed column moves into the
-- listings.attributes JSONB payload, keyed by the same snake_case identifier
-- the seed rows in V5 introduced. Once the column is populated we drop the
-- typed columns and their CHECK constraints; validation moves to the
-- application layer (AttributeValidator) driven by attribute_definitions.
--
-- After this migration listing writes/reads deal exclusively with:
--   description, price, priceNegotiable, status  → typed columns (transactional)
--   attributes                                    → JSONB (dynamic)
--   media_message_ids, seller_id, timestamps      → system-level, unchanged
-- ==============================================================

-- ---- 1. Add JSONB column with empty default so existing rows don't break ----
ALTER TABLE listings
    ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---- 2. Backfill from typed columns ----
UPDATE listings SET attributes = jsonb_strip_nulls(jsonb_build_object(
    'highest_division_level', highest_division_level,
    'team_strength',          team_strength,
    'valuable_players',       to_jsonb(valuable_players),
    'android_coins',          android_coins,
    'ios_coins',              ios_coins,
    'has_google_play_link',   has_google_play_link
));

-- ---- 3. Drop DB-level CHECK constraints (validation moves to app layer) ----
ALTER TABLE listings DROP CONSTRAINT IF EXISTS chk_listings_division;
ALTER TABLE listings DROP CONSTRAINT IF EXISTS chk_listings_coins_ge0;
ALTER TABLE listings DROP CONSTRAINT IF EXISTS chk_listings_team_ge0;

-- ---- 4. Drop typed columns + their dedicated index ----
DROP INDEX IF EXISTS idx_listings_valuable_players;

ALTER TABLE listings
    DROP COLUMN valuable_players,
    DROP COLUMN has_google_play_link,
    DROP COLUMN highest_division_level,
    DROP COLUMN android_coins,
    DROP COLUMN ios_coins,
    DROP COLUMN team_strength;

-- ---- 5. GIN index for JSONB containment queries (attributes @> filter) ----
-- jsonb_path_ops is smaller/faster for @> predicates than default jsonb_ops.
CREATE INDEX idx_listings_attributes ON listings USING GIN (attributes jsonb_path_ops);
