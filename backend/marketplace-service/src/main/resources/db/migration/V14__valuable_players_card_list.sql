-- ============================================================
-- valuable_players → CARD_LIST
--
-- Frontend picker was writing valuable_players as a JSONB array of plain
-- name strings ("Cristiano Ronaldo", "Lionel Messi", ...). The card filter
-- needs card-level granularity — sort exact-card matches before same-name
-- matches, search by any card field down the road — which is impossible
-- with just a name string.
--
-- Product decision: wipe existing listings and switch valuable_players to
-- a new CARD_LIST attribute type that stores full card entities:
--   [
--     { "efhub_id": 89123456789012, "name": "Cristiano Ronaldo",
--       "type": "BIGTIME", "overall_rating": 91, "playing_style":
--       "Goal Poacher", "position": "CF", "skills": [...], ... }
--   ]
--
-- Fresh start is safe here — the migration to Contabo is still recent
-- and the volume of legit listings is small.
-- ============================================================

-- 1. Wipe all listings and their downstream state. TRUNCATE CASCADE keeps
--    referential integrity (chats, likes, reports, participants, notifications
--    all reference listing_id).
TRUNCATE TABLE listings CASCADE;

-- 2. Extend the type-column CHECK to admit the new CARD_LIST value BEFORE
--    updating any row — otherwise the UPDATE below trips the constraint
--    installed in V5 and Flyway rolls the whole migration back.
ALTER TABLE attribute_definitions
    DROP CONSTRAINT chk_attribute_definitions_type;
ALTER TABLE attribute_definitions
    ADD CONSTRAINT chk_attribute_definitions_type CHECK (
        type IN ('INT', 'DECIMAL', 'BOOLEAN', 'STRING', 'TEXT', 'LIST_STRING', 'ENUM', 'CARD_LIST')
    );

-- 3. Retype the attribute definition.
UPDATE attribute_definitions
   SET type = 'CARD_LIST',
       constraints = jsonb_build_object('max_items', 12)
 WHERE key = 'valuable_players';

-- 3. GIN index on attributes so the JSONB `@>` filter used for card lookups
--    ("this card is somewhere in valuable_players") stays cheap even with
--    heavier browse traffic. jsonb_path_ops is smaller than the default
--    ops class and enough for our @> queries.
CREATE INDEX IF NOT EXISTS listings_attributes_gin_idx
    ON listings USING GIN (attributes jsonb_path_ops);
