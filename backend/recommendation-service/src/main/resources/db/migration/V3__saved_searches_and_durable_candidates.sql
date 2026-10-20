ALTER TABLE listings_view ADD COLUMN published_at TIMESTAMPTZ;
ALTER TABLE listings_view ADD COLUMN publication_version BIGINT NOT NULL DEFAULT 0 CHECK (publication_version >= 0);
CREATE TABLE saved_searches (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,
    match_cards JSONB NOT NULL DEFAULT '[]',
    match_strictness INT NOT NULL CHECK (match_strictness BETWEEN 1 AND 10),
    min_price NUMERIC(19,2),
    max_price NUMERIC(19,2),
    fingerprint VARCHAR(64) NOT NULL,
    user_paused BOOLEAN NOT NULL DEFAULT false,
    limit_paused BOOLEAN NOT NULL DEFAULT false,
    priority INT NOT NULL,
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    baseline_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    generation BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, fingerprint),
    CHECK (min_price IS NULL OR min_price >= 0),
    CHECK (max_price IS NULL OR max_price >= 0),
    CHECK (min_price IS NULL OR max_price IS NULL OR min_price <= max_price)
);
CREATE INDEX saved_searches_user_priority_idx ON saved_searches(user_id, priority, created_at, id);
CREATE TABLE search_notification_intents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    listing_id UUID NOT NULL,
    publication_version BIGINT NOT NULL CHECK (publication_version > 0),
    published_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, listing_id, publication_version)
);
CREATE INDEX search_notification_pending_idx ON search_notification_intents(next_attempt_at) WHERE dispatched_at IS NULL;
CREATE TABLE search_notification_reasons (
    intent_id UUID NOT NULL REFERENCES search_notification_intents(id) ON DELETE CASCADE,
    search_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
    generation BIGINT NOT NULL,
    PRIMARY KEY(intent_id, search_id)
);
