-- ==============================================================
-- Attribute definitions — logical-consistency cleanup.
--
-- Problems fixed here (see product review 2026-07-08):
--   1. `allow_exchange` + `allow_exchange_plus_surcharge` modelled 4 boolean
--      combinations but only 3 are meaningful. Collapse into a single ENUM
--      `exchange_mode` so the invalid `surcharge=true, exchange=false` state
--      is unrepresentable.
--   2. `highest_division_level` was later flipped to `required=false` via the
--      admin panel — this is the strongest single value signal for an
--      account, restore `required=true`.
--   3. `team_strength` had `min=0` and no max; realistic eFootball range is
--      roughly 1000..5000.
--   4. `players_count` (added at runtime, position 0) sat in front of the
--      much more important team_strength / division fields, with a
--      nonsensical `min=0`. Move to position 25, `min=11` (legal squad).
--   5. `has_google_play_link` + `has_game_center_link` are platform-binding
--      fields, not monetization. Move both to a `platform` group.
--
-- Cross-field consistency (android_coins requires Google Play link, iOS
-- coins require Game Center link) is enforced in AttributeValidator — it
-- needs both values in scope and would be awkward as a DB CHECK.
--
-- allow_exchange* rows are soft-deleted (active=false). Historical listings
-- may reference them; hiding from the form is enough. The migration is
-- idempotent — runtime-added rows (players_count, has_game_center_link)
-- use INSERT ... ON CONFLICT so a fresh DB and an existing dev DB converge
-- on the same state.
-- ==============================================================

-- ---- (1) new attribute type: fresh installs need CARD_LIST already (V14)
--         plus the exchange_mode ENUM row uses the ENUM type introduced in V5.

-- ---- (2) upsert the runtime-added attributes so a fresh DB gains them and
--          an existing dev DB is corrected in place.

INSERT INTO attribute_definitions (key, label_uz, type, required, position, group_key, constraints, searchable)
VALUES
    ('players_count',        'Jami o''yinchilar',         'INT',     FALSE, 25, 'squad',    '{"min":11,"max":80}'::jsonb, TRUE),
    ('has_game_center_link', 'Game Center ulangan',       'BOOLEAN', FALSE, 65, 'platform', '{}'::jsonb, TRUE),
    ('exchange_mode',        'Obmen shartlari',           'ENUM',    FALSE, 80, 'price',    '{"options":["NONE","EXCHANGE_ONLY","EXCHANGE_WITH_SURCHARGE","BOTH"]}'::jsonb, TRUE)
ON CONFLICT (key) DO UPDATE SET
    label_uz    = EXCLUDED.label_uz,
    type        = EXCLUDED.type,
    required    = EXCLUDED.required,
    position    = EXCLUDED.position,
    group_key   = EXCLUDED.group_key,
    constraints = EXCLUDED.constraints,
    searchable  = EXCLUDED.searchable,
    active      = TRUE,
    updated_at  = NOW();

-- ---- (3) correct existing rows.

UPDATE attribute_definitions
   SET required    = TRUE,
       position    = 10,
       group_key   = 'gameplay',
       constraints = '{"min":1,"max":9}'::jsonb,
       updated_at  = NOW()
 WHERE key = 'highest_division_level';

UPDATE attribute_definitions
   SET required    = TRUE,
       position    = 20,
       group_key   = 'squad',
       constraints = '{"min":1000,"max":5000}'::jsonb,
       updated_at  = NOW()
 WHERE key = 'team_strength';

UPDATE attribute_definitions
   SET group_key  = 'platform',
       position   = 70,
       label_uz   = 'Google Play ulangan',
       updated_at = NOW()
 WHERE key = 'has_google_play_link';

-- ---- (4) retire the overlapping boolean pair. Soft-delete keeps historical
--          listing values readable via the admin panel.

UPDATE attribute_definitions
   SET active     = FALSE,
       updated_at = NOW()
 WHERE key IN ('allow_exchange', 'allow_exchange_plus_surcharge');
