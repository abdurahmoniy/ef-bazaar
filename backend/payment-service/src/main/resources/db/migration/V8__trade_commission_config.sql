-- ==============================================================
-- payment-service V8 — Dinamik Smart Admin savdo komissiyasi konfiguratsiyasi.
--
-- Har bir savdoda olinadigan platforma xizmat haqi parametrlari:
--   - band_som: stavka o'zgarish chegarasi (masalan, 100 000 so'm)
--   - low_rate_percent: chegara ostidagi komissiya foizi (masalan, 10.0%)
--   - high_rate_percent: chegara va undan yuqori komissiya foizi (masalan, 7.5%)
--   - low_min_som: pastki chegara minimal summasi (floor, masalan, 5 000 so'm)
--   - high_min_som: yuqori chegara minimal summasi (floor, masalan, 10 000 so'm)
-- ==============================================================

CREATE TABLE trade_commission_configs (
    id                VARCHAR(32) PRIMARY KEY,
    band_som          BIGINT           NOT NULL DEFAULT 100000,
    low_rate_percent  DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    high_rate_percent DOUBLE PRECISION NOT NULL DEFAULT 7.5,
    low_min_som       BIGINT           NOT NULL DEFAULT 5000,
    high_min_som      BIGINT           NOT NULL DEFAULT 10000,
    is_active         BOOLEAN          NOT NULL DEFAULT TRUE,
    updated_at        TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_by        UUID,
    CONSTRAINT chk_band_positive CHECK (band_som > 0),
    CONSTRAINT chk_rates_valid CHECK (low_rate_percent >= 0 AND low_rate_percent <= 100 AND high_rate_percent >= 0 AND high_rate_percent <= 100),
    CONSTRAINT chk_mins_valid CHECK (low_min_som >= 0 AND high_min_som >= 0)
);

INSERT INTO trade_commission_configs (
    id,
    band_som,
    low_rate_percent,
    high_rate_percent,
    low_min_som,
    high_min_som,
    is_active,
    updated_at
) VALUES (
    'DEFAULT',
    100000,
    10.0,
    7.5,
    5000,
    10000,
    TRUE,
    now()
);
