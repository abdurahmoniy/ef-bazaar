-- ==============================================================
-- max_overall_rating — OVR at max level.
--
-- `overall_rating` is what efhub reports for a level-1 card, which is not the
-- number anyone trades on: Messi 89138556575063 stores 90 but plays as 106.
-- Buyers read the maxed value, so that is what the UI shows and what sorting
-- keys on; the base rating stays for reference and diffing.
--
-- Nullable on purpose — cards scraped before the parser learned this field
-- have no value, and the readers fall back to overall_rating rather than
-- rendering a hole.
-- ==============================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['bigtime', 'epic', 'showtime'] LOOP
        EXECUTE format($f$
            ALTER TABLE %I ADD COLUMN IF NOT EXISTS max_overall_rating SMALLINT;

            CREATE INDEX IF NOT EXISTS idx_%I_max_overall_rating
                ON %I (COALESCE(max_overall_rating, overall_rating) DESC);
        $f$, t, t, t);
    END LOOP;
END $$;
