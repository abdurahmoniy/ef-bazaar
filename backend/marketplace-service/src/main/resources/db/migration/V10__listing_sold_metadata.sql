-- Track when a listing was marked SOLD (via listing-sold Kafka consumer)
-- so the UI can render "5 daqiqa oldin sotildi" relative timestamps.
-- Nullable — historical rows and never-sold listings stay NULL.
ALTER TABLE listings
    ADD COLUMN sold_at TIMESTAMPTZ,
    ADD COLUMN sold_to_user_id UUID;

-- Speeds up the browse sort "ACTIVE first, then SOLD by recency" that the
-- ListingService now applies to every catalog page.
CREATE INDEX idx_listings_status_created ON listings (status, created_at DESC);
