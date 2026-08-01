-- ==============================================================
-- meta_tier — NORMAL | META
--
-- Orthogonal to card type: bigtime/epic/showtime is *rarity*, derived from
-- the efhub_id prefix and immutable. Meta relevance shifts every patch, so
-- it is admin-editable from the panel (/admin/players).
--
-- Lives as a column rather than a side table because the value is hand
-- curated only — no provenance, no history, no nightly recompute. If auto
-- scoring ever lands, move to a `card_meta` side table instead of growing
-- meta_source / meta_score / meta_updated_at columns on all three tables.
--
-- Also applied at boot by marketplace-service's CardSchemaBootstrap — this DB
-- has no Flyway, so a code deploy can outrun setup-db.sh. Keep the two in
-- sync; this file additionally covers fresh DBs, where the tables don't exist
-- yet and only V1 can create them.
--
-- Safe across re-scrapes: infra/scrapers/efhub/load.py lists its columns
-- explicitly in ON CONFLICT DO UPDATE and meta_tier is not among them, so a
-- fresh scrape never resets curated tiers.
-- ==============================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['bigtime', 'epic', 'showtime'] LOOP
        EXECUTE format($f$
            ALTER TABLE %I ADD COLUMN IF NOT EXISTS meta_tier TEXT NOT NULL DEFAULT 'NORMAL';

            ALTER TABLE %I DROP CONSTRAINT IF EXISTS chk_%I_meta_tier;
            ALTER TABLE %I ADD CONSTRAINT chk_%I_meta_tier
                CHECK (meta_tier IN ('NORMAL', 'META'));

            -- Partial: META is a small curated subset, NORMAL is everything
            -- else and would never benefit from an index anyway.
            CREATE INDEX IF NOT EXISTS idx_%I_meta_tier ON %I (meta_tier)
                WHERE meta_tier <> 'NORMAL';
        $f$, t, t, t, t, t, t, t);
    END LOOP;
END $$;
