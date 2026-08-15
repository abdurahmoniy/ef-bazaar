-- ==============================================================
-- payment-service V6 — hamyondan pul yechish tiketlari.
--
-- Foydalanuvchi tiket ochadi, admin qo'lda pul tashlaydi va tiketni
-- yopadi. Pul tiket OCHILGANDA muzlatiladi (available -> withdraw_pending),
-- yopilganda esa butunlay chiqadi.
--
-- Nega ochilganda: aks holda tiket ochiq turgan vaqtda foydalanuvchi o'sha
-- pulni savdoda muzlatib qo'yishi mumkin, va admin allaqachon to'lab
-- bo'lganidan keyin ayirish chk_wallet_non_negative ga urilib qoladi —
-- ya'ni pul bir tarafdan chiqib, ikkinchi tarafga yozilmay qolardi.
-- Ledger buni oldindan ko'zda tutgan: WITHDRAW_PENDING hisobi va
-- WITHDRAW_RESERVE / _FULFIL / _CANCEL turlari V1 dan beri turibdi.
--
-- Karta raqami shifrlangan holda saqlanadi va faqat admin tiket oynasida
-- ochiladi — admin aynan o'sha kartaga pul tashlaydi. Ro'yxatlarda,
-- loglarda va Telegram xabarida faqat oxirgi 4 raqam ko'rinadi.
-- ==============================================================

CREATE TABLE withdrawal_tickets (
    id                 UUID PRIMARY KEY,
    user_id            UUID         NOT NULL,

    amount_tiyin       BIGINT       NOT NULL,

    -- Karta: ulangan kartadan tanlangan yoki qo'lda kiritilgan. Ikkalasida
    -- ham raqamning o'zi shu yerda shifrlanadi — admin uni ochib pul
    -- tashlaydi, boshqa joydan qidirmaydi.
    pan_encrypted      BYTEA        NOT NULL,
    pan_iv             BYTEA        NOT NULL,
    pan_tag            BYTEA        NOT NULL,
    last4              VARCHAR(4)   NOT NULL,
    holder_name        VARCHAR(64)  NOT NULL,

    -- Bog'lanish uchun. Telegram username auth'dan keladi, telefon esa
    -- foydalanuvchi o'zi kiritadi — auth'da telefon ustuni yo'q.
    phone              VARCHAR(32)  NOT NULL,
    telegram_username  VARCHAR(64),

    status             VARCHAR(16)  NOT NULL DEFAULT 'OPEN',

    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    closed_at          TIMESTAMPTZ,
    closed_by          UUID,
    -- Rad etilganda foydalanuvchiga ko'rsatiladigan sabab.
    close_note         VARCHAR(256),

    CONSTRAINT chk_wt_status  CHECK (status IN ('OPEN', 'PAID', 'REJECTED')),
    CONSTRAINT chk_wt_amount  CHECK (amount_tiyin > 0),
    CONSTRAINT chk_wt_holder  CHECK (holder_name = upper(holder_name)),
    -- Yopilgan tiket kim va qachon yopganini bilishi shart; ochig'i bilmasligi.
    CONSTRAINT chk_wt_closed  CHECK (
        (status =  'OPEN' AND closed_at IS NULL     AND closed_by IS NULL) OR
        (status <> 'OPEN' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
    )
);

-- Bir vaqtda bitta ochiq tiket. Ikkitasi bo'lsa foydalanuvchi balansidan
-- ko'proq pul so'ray oladi va navbat qaysi biriga tegishli ekani chalkashadi.
CREATE UNIQUE INDEX uk_wt_open_per_user
    ON withdrawal_tickets (user_id)
    WHERE status = 'OPEN';

CREATE INDEX idx_wt_status_created ON withdrawal_tickets (status, created_at DESC);
CREATE INDEX idx_wt_user_created   ON withdrawal_tickets (user_id, created_at DESC);
