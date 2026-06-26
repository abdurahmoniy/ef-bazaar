-- ==============================================================
-- marketplace-service — initial schema
-- listings + listing_likes + cart_items
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------- listings --------------------
CREATE TABLE listings (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    seller_id                UUID NOT NULL,

    description              TEXT NOT NULL,

    -- Search/recommendation uchun (TEXT[] + GIN index)
    valuable_players         TEXT[] NOT NULL DEFAULT '{}',

    has_google_play_link     BOOLEAN NOT NULL DEFAULT FALSE,
    highest_division_level   INTEGER NOT NULL,

    android_coins            INTEGER NOT NULL DEFAULT 0,
    ios_coins                INTEGER NOT NULL DEFAULT 0,
    team_strength            INTEGER NOT NULL DEFAULT 0,

    price                    NUMERIC(19,2) NOT NULL,
    is_price_negotiable      BOOLEAN NOT NULL DEFAULT FALSE,

    media_message_ids        TEXT[] NOT NULL DEFAULT '{}',

    status                   VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    forward_count            INTEGER NOT NULL DEFAULT 0,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_listings_status   CHECK (status IN ('ACTIVE', 'SOLD', 'DELETED')),
    CONSTRAINT chk_listings_division CHECK (highest_division_level BETWEEN 1 AND 9),
    CONSTRAINT chk_listings_coins_ge0       CHECK (android_coins >= 0 AND ios_coins >= 0),
    CONSTRAINT chk_listings_team_ge0        CHECK (team_strength >= 0),
    CONSTRAINT chk_listings_price_ge0       CHECK (price >= 0)
);

CREATE INDEX idx_listings_seller_id         ON listings (seller_id);
CREATE INDEX idx_listings_status_created_at ON listings (status, created_at DESC);
CREATE INDEX idx_listings_status_price      ON listings (status, price);
CREATE INDEX idx_listings_valuable_players  ON listings USING GIN (valuable_players);

-- -------------------- listing_likes --------------------
CREATE TABLE listing_likes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_listing_likes_listing_user UNIQUE (listing_id, user_id)
);

CREATE INDEX idx_listing_likes_user ON listing_likes (user_id);

-- -------------------- cart_items --------------------
CREATE TABLE cart_items (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL,
    listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_cart_items_user_listing UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_cart_items_user ON cart_items (user_id);
