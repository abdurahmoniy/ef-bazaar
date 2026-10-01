SET lock_timeout = '5s';
-- "Katta bozor" tartibi: narx + kartalar kuchi + META (formula: ValueScoreCalculator).
-- NULL — hali hisoblanmagan; ValueScoreBackfill startup'da to'ldiradi, sort'da oxirida turadi.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS value_score DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS idx_listings_value_score
    ON listings (value_score DESC NULLS LAST, id) WHERE status = 'ACTIVE';
