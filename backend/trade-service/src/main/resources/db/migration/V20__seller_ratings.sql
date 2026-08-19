-- ==============================================================
-- trade-service V20 — 1–5 star ratings of a seller after successful trade.
--
-- Only buyers may rate sellers within a configured window after SUCCESS.
-- Unique constraint ensures at most one rating per trade.
-- Moderation hides the comment text while maintaining the star rating.
-- ==============================================================

CREATE TABLE seller_ratings (
    id          UUID PRIMARY KEY,
    trade_id    UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    seller_id   UUID        NOT NULL,
    rater_id    UUID        NOT NULL,
    stars       SMALLINT    NOT NULL,
    comment     VARCHAR(500),
    hidden_at   TIMESTAMPTZ,
    hidden_by   UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_sr_stars CHECK (stars BETWEEN 1 AND 5),
    CONSTRAINT uk_sr_trade  UNIQUE (trade_id),
    CONSTRAINT chk_sr_hidden CHECK (
        (hidden_at IS NULL AND hidden_by IS NULL)
     OR (hidden_at IS NOT NULL AND hidden_by IS NOT NULL))
);

CREATE INDEX ix_sr_seller ON seller_ratings (seller_id, created_at DESC);
