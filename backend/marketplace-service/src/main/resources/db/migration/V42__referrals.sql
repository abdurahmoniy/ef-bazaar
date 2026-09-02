-- Referal dasturi. Hamkorlikdan mustaqil: taklif qilish har bir
-- foydalanuvchining imkoniyati, hamkor esa shunchaki kanali bor odam.

-- Har foydalanuvchiga bitta taklif kodi. Kod tasodifiy: ismdan yasalgani
-- ism o'zgarganda buziladi, ketma-ket raqam esa birovning kodini taxmin
-- qilib, uning nomidan taklif qilishga imkon beradi.
CREATE TABLE user_referral_codes (
    user_id    uuid        PRIMARY KEY,
    code       text        NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Mukofot summasi. Bitta qatorli sozlama — partner_settings kabi.
CREATE TABLE referral_settings (
    id         smallint      PRIMARY KEY,
    reward_som numeric(14,2) NOT NULL,
    updated_at timestamptz   NOT NULL DEFAULT now(),
    updated_by uuid,

    CONSTRAINT chk_referral_settings_singleton CHECK (id = 1),
    CONSTRAINT chk_referral_settings_reward    CHECK (reward_som >= 0)
);
INSERT INTO referral_settings (id, reward_som) VALUES (1, 5000.00);

-- Kim kimni olib keldi.
--
-- referred_user_id PRIMARY KEY — "bitta ro'yxat, bitta referal" qoidasi
-- shu yerda, kodda emas. Ikkinchi taklif qiluvchi o'sha odamni da'vo
-- qila olmaydi, chunki baza qatorni qabul qilmaydi.
--
-- rewarded_at ayni paytda "faqat birinchi savdo" qorovuli ham: uni
-- birinchi muvaffaqiyatli savdo muhrlaydi, keyingilari muhrlangan holda
-- topadi. Foydalanuvchining savdolarini sanash bir haqiqatning ikkinchi
-- manbasi bo'lardi.
CREATE TABLE referrals (
    referred_user_id   uuid          PRIMARY KEY,
    referrer_user_id   uuid          NOT NULL,
    -- Hamkor kanali orqali kelgan bo'lsa. Ikkinchi bosqichgacha NULL.
    partner_channel_id uuid,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    rewarded_at        timestamptz,
    reward_som         numeric(14,2),

    CONSTRAINT chk_referrals_not_self CHECK (referrer_user_id <> referred_user_id),
    -- To'langan bo'lsa summa ham bor: yarim yozilgan qator hisobotni
    -- jimgina buzadi.
    CONSTRAINT chk_referrals_reward_pair CHECK (
        (rewarded_at IS NULL     AND reward_som IS NULL)
     OR (rewarded_at IS NOT NULL AND reward_som IS NOT NULL))
);

CREATE INDEX idx_referrals_referrer ON referrals (referrer_user_id, created_at DESC);

-- Botga kelgan, lekin hali akkounti yo'q odamning kodi.
--
-- Botda baza yo'q, shuning uchun u /start yukini shu yerga darhol
-- uzatadi. Qator `efbazaar.auth.user-registered` kelganda, o'sha
-- telegram_id bilan, haqiqiy referal qatoriga aylanadi.
--
-- Aylanmagan qator — havolani bosganida allaqachon ro'yxatdan o'tgan
-- odam. Bu nosozlik emas, to'g'ri natija: mavjud akkount hech kimning
-- referali emas.
CREATE TABLE pending_referrals (
    telegram_id bigint      PRIMARY KEY,
    code        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
