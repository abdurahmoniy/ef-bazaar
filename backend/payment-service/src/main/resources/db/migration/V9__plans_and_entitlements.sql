-- ==============================================================
-- payment-service V9 — tarif rejalari va ular beradigan huquqlar.
--
-- MODEL HAQIDA. Rejaning o'zida "nechta pochta qutisi" degan ustun YO'Q va
-- bo'lmasligi ham kerak. Har yangi imkoniyat uchun ustun qo'shsak, bir necha
-- oydan keyin bu jadval yigirma ustunga aylanadi va har biri uchun yangi
-- migratsiya, yangi DTO maydoni, yangi consumer o'zgarishi kerak bo'ladi.
--
-- Shuning uchun reja faqat NOM, huquqlar esa alohida (kalit, qiymat) qatorlari:
--
--     STANDARD  mailbox.slots = 3
--     PRO       mailbox.slots = 10
--     MAX       mailbox.slots = NULL   (cheksiz)
--
-- Kod hech qachon "agar PRO bo'lsa" demaydi — u faqat `mailbox.slots` ni
-- so'raydi. Ertaga `trade.concurrent`, `listing.featured` yoki
-- `fee.discount_percent` qo'shilsa, birorta jadval ham, servis kodi ham
-- o'zgarmaydi: R__plan_entitlements.sql ga qator qo'shiladi, xolos.
--
-- Qiymatlar shu sababdan MATN: son, foiz, bayroq — hammasi bitta ustunga
-- sig'adi va o'qigan tomon o'zi talqin qiladi.
--
-- CHEKSIZ = NULL. Sehrli -1 emas: -1 ni unutgan har bir taqqoslash uni
-- "nol slot" deb o'qiydi, NULL esa e'tibordan chetda qolsa xato beradi.
--
-- OBUNA QATORI YO'Q = STANDARD. Shu qoida tufayli mavjud foydalanuvchilarga
-- backfill kerak emas va yangi ro'yxatdan o'tgan hech kim "rejasiz" qolmaydi.
-- ==============================================================

CREATE TABLE plans (
    code        VARCHAR(32) PRIMARY KEY,
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Frontend rejalarni shu tartibda ko'rsatadi. Nomlar ("Jaydari",
    -- "Boyvachcha", "Aristokrat") ataylab bu yerda emas: ular matn, va matn
    -- frontendning ishi.
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plan_entitlements (
    plan_code   VARCHAR(32)  NOT NULL REFERENCES plans(code) ON DELETE CASCADE,
    -- Nuqta bilan bo'lingan ad: `mailbox.slots`. Egalik qiladigan sohani
    -- oldinda saqlaymiz, shunda kalitlar o'z-o'zidan guruhlanadi.
    key         VARCHAR(64)  NOT NULL,
    -- NULL = cheksiz. Yuqoridagi izohga qarang.
    value       VARCHAR(64),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    PRIMARY KEY (plan_code, key)
);

CREATE TABLE user_subscriptions (
    user_id     UUID         PRIMARY KEY,
    plan_code   VARCHAR(32)  NOT NULL REFERENCES plans(code),
    started_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- NULL = muddatsiz. Hozircha rejalar qo'lda beriladi; to'lov bilan
    -- bog'langanda bu ustun ishlay boshlaydi.
    expires_at  TIMESTAMPTZ,
    -- Kim/nima berdi: 'ADMIN', 'PURCHASE', 'PROMO'. Qattiq CHECK qo'ymaymiz —
    -- yangi kanal qo'shilganda migratsiya yozib o'tirmaslik uchun.
    source      VARCHAR(32)  NOT NULL DEFAULT 'ADMIN',
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Muddati o'tganlarni supurish uchun: to'liq skan qilmasdan topish.
CREATE INDEX idx_user_subscriptions_expiring ON user_subscriptions (expires_at)
    WHERE expires_at IS NOT NULL;

-- Rejalarning o'zi. Qiymatlari R__plan_entitlements.sql da, chunki ular
-- vaqti-vaqti bilan sozlanadi; jadval qatorlari esa deyarli o'zgarmaydi.
INSERT INTO plans (code, sort_order) VALUES
    ('STANDARD', 1),
    ('PRO',      2),
    ('MAX',      3)
ON CONFLICT (code) DO NOTHING;
