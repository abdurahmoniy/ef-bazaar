-- ==============================================================
-- payment-service V15 — tarif narxlari, xaridlar va admin boshqaradigan slotlar.
--
-- Narx va slot sonlarini endi ADMIN boshqaradi. Shuning uchun ular shu yerda
-- bir marta seed qilinadi va R__plan_entitlements.sql ularni yozmaydi: R__
-- har content o'zgarishida qayta ishlaydi va admin qarorini ustidan yozardi.
-- ==============================================================

CREATE TABLE plan_prices (
    plan_code    VARCHAR(32) NOT NULL REFERENCES plans(code),
    period       VARCHAR(8)  NOT NULL CHECK (period IN ('MONTH', 'YEAR')),
    price_tiyin  BIGINT      NOT NULL CHECK (price_tiyin > 0),
    -- NULL = migratsiya seed'i, aks holda o'zgartirgan admin.
    updated_by   UUID,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_code, period)
);

INSERT INTO plan_prices (plan_code, period, price_tiyin) VALUES
    ('PRO', 'MONTH',  1000000),
    ('PRO', 'YEAR',  10000000),
    ('MAX', 'MONTH',  3000000),
    ('MAX', 'YEAR',  25000000)
ON CONFLICT (plan_code, period) DO NOTHING;

CREATE TABLE plan_purchases (
    id                   UUID         PRIMARY KEY,
    user_id              UUID         NOT NULL,
    plan_code            VARCHAR(32)  NOT NULL REFERENCES plans(code),
    period               VARCHAR(8)   NOT NULL CHECK (period IN ('MONTH', 'YEAR')),
    price_tiyin          BIGINT       NOT NULL CHECK (price_tiyin > 0),
    starts_at            TIMESTAMPTZ  NOT NULL,
    expires_at           TIMESTAMPTZ  NOT NULL,
    ledger_tx_id         UUID         NOT NULL,
    idempotency_key      VARCHAR(128) NOT NULL UNIQUE,
    -- Xarid paytidagi Telegram chat — eslatma shu yerga boradi. NULL = Telegram'siz.
    telegram_id          BIGINT,
    reminded_before_at   TIMESTAMPTZ,
    reminded_expired_at  TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_purchases_user ON plan_purchases (user_id, created_at DESC);
CREATE INDEX idx_plan_purchases_expiring ON plan_purchases (expires_at);

ALTER TABLE plan_entitlements ADD COLUMN updated_by UUID;

-- Bir martalik mahsulot qarori; keyin faqat admin panel. UPSERT: eski bazada
-- qator bor (R__ oldin yozgan), yangi bazada yo'q — ikkalasida ham to'g'ri qiymat.
INSERT INTO plan_entitlements (plan_code, key, value, updated_at) VALUES
    ('STANDARD', 'mailbox.slots', '3',  now()),
    ('PRO',      'mailbox.slots', '5',  now()),
    ('MAX',      'mailbox.slots', '10', now())
ON CONFLICT (plan_code, key) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_at = now();

INSERT INTO plan_entitlements (plan_code, key, value, updated_at) VALUES
    ('STANDARD', 'mailbox.custom_slots', '0', now()),
    ('PRO',      'mailbox.custom_slots', '1', now()),
    ('MAX',      'mailbox.custom_slots', '3', now())
ON CONFLICT (plan_code, key) DO NOTHING;
