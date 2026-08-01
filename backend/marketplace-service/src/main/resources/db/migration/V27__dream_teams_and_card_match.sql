-- ============================================================
-- Dream team + fuzzy card matching
--
-- Two pieces:
--   1. card_match_score() — how well a listing's valuable_players covers a
--      wanted squad. Lives in SQL so the filter, the ordering and the
--      pagination all happen in one query; scoring in Java would mean
--      fetching every candidate listing to sort them.
--   2. dream_teams — a user's saved 11-slot squad. Slots are JSONB for the
--      same reason valuable_players is (V14): a slot holds a full card
--      snapshot, and the shape changes more often than a table should.
-- ============================================================

-- ---------- 1. match scoring ----------
--
-- `wanted` is a JSON array of slots, passed as TEXT so JPA Criteria can bind
-- it as a plain parameter (binding jsonb through cb.function means fighting
-- Hibernate's type inference):
--
--   [{"id": 89123456789012, "name": "Lionel Messi", "w": 2}, ...]
--
--   id   — exact card. A listing holding this exact card scores 1.0.
--   name — same player, any card. Scores 0.75: an 89-rated Messi is not the
--          92 you asked for, but it is emphatically not "no Messi", and
--          treating it as a miss makes every real account score near zero.
--   w    — slot weight, default 1. Lets "must have" slots outweigh filler.
--
-- Returns 0..1. NULL/empty wanted returns 0 so it never filters anything in.
CREATE OR REPLACE FUNCTION card_match_score(attrs jsonb, wanted text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
               WHEN COALESCE(SUM(s.weight), 0) = 0 THEN 0
               ELSE ROUND(SUM(s.weight * s.best) / SUM(s.weight), 4)
           END
    FROM (
        SELECT
            COALESCE((slot ->> 'w')::numeric, 1) AS weight,
            CASE
                WHEN slot ->> 'id' IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                             COALESCE(attrs -> 'valuable_players', '[]'::jsonb)) p
                    WHERE jsonb_typeof(p) = 'object'
                      AND p ->> 'efhub_id' = slot ->> 'id'
                ) THEN 1.0
                WHEN slot ->> 'name' IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                             COALESCE(attrs -> 'valuable_players', '[]'::jsonb)) p
                    WHERE jsonb_typeof(p) = 'object'
                      AND lower(p ->> 'name') = lower(slot ->> 'name')
                ) THEN 0.75
                ELSE 0
            END AS best
        FROM jsonb_array_elements(
                 COALESCE(NULLIF(wanted, '')::jsonb, '[]'::jsonb)) slot
        WHERE jsonb_typeof(slot) = 'object'
    ) s;
$$;

COMMENT ON FUNCTION card_match_score(jsonb, text) IS
    'Fuzzy squad coverage 0..1: exact card 1.0, same player different card 0.75, weighted per slot.';

-- ---------- 2. saved squads ----------

CREATE TABLE IF NOT EXISTS dream_teams (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL,
    name       VARCHAR(80)  NOT NULL,
    -- Free-form ("4-3-3", "4-2-3-1") — the pitch layout is a frontend concern
    -- and new formations should not need a migration.
    formation  VARCHAR(16)  NOT NULL DEFAULT '4-3-3',
    -- [{"index":0,"position":"GK","w":1,"card":{...full snapshot...}}, ...]
    -- Empty slots are simply absent.
    slots      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dream_teams_user_idx ON dream_teams (user_id, created_at DESC);
