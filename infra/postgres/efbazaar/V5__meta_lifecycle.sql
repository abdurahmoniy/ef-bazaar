-- Auditable, time-bounded META curation. Existing META rows stay active because
-- both window bounds default to NULL (unbounded).
DO $$
DECLARE
    card_table TEXT;
BEGIN
    FOREACH card_table IN ARRAY ARRAY['bigtime', 'epic', 'showtime']
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS meta_priority SMALLINT NOT NULL DEFAULT 0', card_table);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS meta_active_from TIMESTAMPTZ', card_table);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS meta_active_until TIMESTAMPTZ', card_table);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS meta_reason VARCHAR(240)', card_table);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS meta_updated_by UUID', card_table);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS meta_updated_at TIMESTAMPTZ', card_table);
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS chk_%s_meta_priority', card_table, card_table);
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT chk_%s_meta_priority CHECK (meta_priority BETWEEN 0 AND 100)', card_table, card_table);
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS chk_%s_meta_window', card_table, card_table);
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT chk_%s_meta_window CHECK (meta_active_until IS NULL OR meta_active_from IS NULL OR meta_active_until > meta_active_from)', card_table, card_table);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_meta_active ON %I (meta_priority DESC, meta_active_from, meta_active_until) WHERE meta_tier = ''META''', card_table, card_table);
    END LOOP;
END $$;
