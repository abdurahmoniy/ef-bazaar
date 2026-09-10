CREATE TABLE listing_views (
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    viewer_key VARCHAR(42) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (listing_id, viewer_key)
);

-- Preserve historical page-open totals in view_count. The display now uses
-- this separate unique-view metric because old totals lack viewer identities.
ALTER TABLE listings ADD COLUMN unique_view_count BIGINT NOT NULL DEFAULT 0 CHECK (unique_view_count >= 0);
