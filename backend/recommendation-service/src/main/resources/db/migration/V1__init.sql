-- recommendation-service — boshlang'ich sxema.
-- *_view jadvallar marketplace snapshot'larining projection'i: faqat Kafka
-- consumer'lari yozadi, `version` eski xabarni to'sadi.

CREATE TABLE listings_view (
    listing_id  UUID PRIMARY KEY,
    seller_id   UUID             NOT NULL,
    status      VARCHAR(16)      NOT NULL,
    price       NUMERIC(19, 2)   NOT NULL,
    value_score DOUBLE PRECISION,
    version     BIGINT           NOT NULL,
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX listings_view_active_idx
    ON listings_view (value_score DESC NULLS LAST, listing_id)
    WHERE status = 'ACTIVE';

-- Snapshot kelganda e'lonning kartalari to'liq almashtiriladi.
CREATE TABLE listing_cards_view (
    listing_id UUID   NOT NULL REFERENCES listings_view (listing_id) ON DELETE CASCADE,
    efhub_id   BIGINT NOT NULL,
    player_id  UUID   NOT NULL,
    PRIMARY KEY (listing_id, efhub_id)
);

CREATE INDEX listing_cards_view_player_idx ON listing_cards_view (player_id);

-- Karta katalogi nusxasi (efbazaar DB'dagi bigtime/epic/showtime + identity).
CREATE TABLE cards_view (
    efhub_id       BIGINT PRIMARY KEY,
    player_id      UUID,
    type           VARCHAR(16),
    overall_rating INTEGER,
    meta_tier      VARCHAR(16),
    meta_priority  INTEGER     NOT NULL DEFAULT 0,
    active_from    TIMESTAMPTZ,
    active_until   TIMESTAMPTZ,
    version        BIGINT      NOT NULL
);

CREATE INDEX cards_view_player_idx ON cards_view (player_id);

-- Unlike → liked = false (qator o'chmaydi, aks holda eski "like" event'i qaytib tirilardi).
CREATE TABLE user_likes (
    user_id    UUID    NOT NULL,
    listing_id UUID    NOT NULL,
    liked      BOOLEAN NOT NULL,
    version    BIGINT  NOT NULL,
    PRIMARY KEY (user_id, listing_id)
);

-- marketplace'dagi bilan bir xil shakl (V27 + V31): bitta foydalanuvchiga bitta jamoa.
CREATE TABLE dream_teams (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL,
    name       VARCHAR(80) NOT NULL,
    formation  VARCHAR(16) NOT NULL DEFAULT '4-3-3',
    slots      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dream_teams_user_unique_idx ON dream_teams (user_id);

-- Login qilgan foydalanuvchi qaysi kartaga qiziqqani (shaxsiy lenta uchun).
-- 90 kundan eski qatorlar RetentionJob bilan o'chiriladi.
CREATE TABLE user_card_interest (
    user_id  UUID        NOT NULL,
    efhub_id BIGINT      NOT NULL,
    last_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, efhub_id)
);

CREATE INDEX user_card_interest_last_at_idx ON user_card_interest (last_at);

CREATE TABLE consumed_events (
    idempotency_key VARCHAR(200) PRIMARY KEY,
    consumed_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX consumed_events_consumed_at_idx ON consumed_events (consumed_at);
