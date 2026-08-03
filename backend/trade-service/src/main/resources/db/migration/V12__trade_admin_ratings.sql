-- ==============================================================
-- trade-service V12 — 1–5 star ratings of a human admin.
--
-- Both parties may rate, optionally, within a configured window after
-- SUCCESS. Not a chat message, so it still works after the chat closes.
--
-- Hiding a comment hides the TEXT only: rating_sum / rating_count are
-- never adjusted on hide, otherwise a platform admin could raise an
-- admin's score by moderating comments.
-- ==============================================================

CREATE TABLE trade_admin_ratings (
    id          UUID PRIMARY KEY,
    trade_id    UUID       NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    admin_id    UUID       NOT NULL,
    rater_id    UUID       NOT NULL,
    rater_role  VARCHAR(8) NOT NULL,
    stars       SMALLINT   NOT NULL,
    comment     VARCHAR(500),
    hidden_at   TIMESTAMPTZ,
    hidden_by   UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tar_stars CHECK (stars BETWEEN 1 AND 5),
    CONSTRAINT chk_tar_role  CHECK (rater_role IN ('SELLER', 'BUYER')),
    CONSTRAINT uk_tar_rater  UNIQUE (trade_id, rater_id),
    CONSTRAINT chk_tar_hidden CHECK (
        (hidden_at IS NULL AND hidden_by IS NULL)
     OR (hidden_at IS NOT NULL AND hidden_by IS NOT NULL))
);

CREATE INDEX ix_tar_admin ON trade_admin_ratings (admin_id, created_at DESC);
