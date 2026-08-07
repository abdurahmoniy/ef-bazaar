-- ==============================================================
-- trade-service V14 — trade admin profiles.
--
-- Row exists  ⇔  "I work as a trade admin". Holding ROLE_TRADE_ADMIN
-- without a profile row keeps you out of the catalogue.
--
-- Owned by trade-service (not auth-service) because every number here
-- is derived from trades: ratings, close times, abandonment.
-- auth-service knows only the role bit.
-- ==============================================================

CREATE TABLE trade_admin_profiles (
    user_id               UUID PRIMARY KEY,

    -- Negotiation band. The per-trade fee is agreed inside it and paid
    -- OFF-PLATFORM; no ledger entry corresponds to it.
    min_fee_uzs           BIGINT  NOT NULL,
    max_fee_uzs           BIGINT  NOT NULL,

    bio                   VARCHAR(500),
    accepting_orders      BOOLEAN NOT NULL DEFAULT TRUE,
    max_concurrent_trades INT     NOT NULL DEFAULT 3,
    -- FALSE once auth-service reports the role was revoked. Never deleted:
    -- the rating history has to survive.
    active                BOOLEAN NOT NULL DEFAULT TRUE,

    rating_sum            INT     NOT NULL DEFAULT 0,
    rating_count          INT     NOT NULL DEFAULT 0,
    completed_count       INT     NOT NULL DEFAULT 0,
    abandoned_count       INT     NOT NULL DEFAULT 0,
    cancelled_count       INT     NOT NULL DEFAULT 0,
    -- accepted → admin pressed close. What the catalogue displays.
    total_work_seconds    BIGINT  NOT NULL DEFAULT 0,
    -- accepted → SUCCESS. Includes the parties' confirm latency; analysis only.
    total_close_seconds   BIGINT  NOT NULL DEFAULT 0,

    version               BIGINT  NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tap_fee_range   CHECK (min_fee_uzs > 0 AND max_fee_uzs >= min_fee_uzs),
    CONSTRAINT chk_tap_concurrent  CHECK (max_concurrent_trades BETWEEN 1 AND 20),
    CONSTRAINT chk_tap_rating_sane CHECK (rating_count >= 0 AND rating_sum >= 0)
);

CREATE INDEX ix_tap_catalog ON trade_admin_profiles (active, accepting_orders);
