-- ==============================================================
-- recommendation-service — initial schema
-- Skeleton stage: placeholder. Real schema (user_interactions,
-- listing_signals, recommendation_cache) keyingi bosqichda.
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schema_placeholder (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_placeholder (note) VALUES ('recommendation-service schema initialized');
