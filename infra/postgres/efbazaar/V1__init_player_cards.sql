-- ==============================================================
-- efbazaar DB — eFootball player cards
-- Manba: efhub.com (Big Time, Epic, Showtime card turlari)
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Umumiy struktura — uchala jadval bir xil. DDL'ni qisqartirish uchun
-- template orqali yaratamiz.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['bigtime', 'epic', 'showtime'] LOOP
        EXECUTE format($f$
            CREATE TABLE IF NOT EXISTS %I (
                id                  BIGSERIAL PRIMARY KEY,
                efhub_id            BIGINT      NOT NULL UNIQUE,

                name                VARCHAR(120) NOT NULL,
                name_ja             VARCHAR(120),
                name_zh             VARCHAR(120),

                team                VARCHAR(120),
                league              VARCHAR(120),
                nationality         VARCHAR(60),
                nationality_code    VARCHAR(8),

                position            VARCHAR(8),
                playing_style       VARCHAR(60),
                overall_rating      SMALLINT,
                player_type         SMALLINT    NOT NULL,
                age                 SMALLINT,
                height              SMALLINT,
                weight              SMALLINT,
                preferred_foot      VARCHAR(10),
                weak_foot_usage     SMALLINT,
                weak_foot_accuracy  SMALLINT,

                image_url           TEXT,

                -- 25 base stats
                offensive_awareness SMALLINT,
                ball_control        SMALLINT,
                dribbling           SMALLINT,
                tight_possession    SMALLINT,
                low_pass            SMALLINT,
                lofted_pass         SMALLINT,
                finishing           SMALLINT,
                heading             SMALLINT,
                set_piece_taking    SMALLINT,
                curl                SMALLINT,
                speed               SMALLINT,
                acceleration        SMALLINT,
                kicking_power       SMALLINT,
                jump                SMALLINT,
                physical_contact    SMALLINT,
                balance             SMALLINT,
                stamina             SMALLINT,
                defensive_awareness SMALLINT,
                ball_winning        SMALLINT,
                tracking_back       SMALLINT,
                aggression          SMALLINT,
                gk_awareness        SMALLINT,
                gk_catching         SMALLINT,
                gk_clearing         SMALLINT,
                gk_reflexes         SMALLINT,
                gk_reach            SMALLINT,

                skills              TEXT[]      NOT NULL DEFAULT '{}',
                com_skills          TEXT[]      NOT NULL DEFAULT '{}',
                additional_positions JSONB,
                raw_data            JSONB,

                scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_%I_overall_rating ON %I (overall_rating DESC);
            CREATE INDEX IF NOT EXISTS idx_%I_team           ON %I (team);
            CREATE INDEX IF NOT EXISTS idx_%I_position       ON %I (position);
            CREATE INDEX IF NOT EXISTS idx_%I_name_trgm      ON %I USING gin (name gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_%I_skills         ON %I USING gin (skills);
        $f$, t, t, t, t, t, t, t, t, t, t, t);
    END LOOP;
END $$;
