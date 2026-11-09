-- Kampaniya havolalari: foydalanuvchi qaysi manbadan kelgani.
--
-- Referaldan MUSTAQIL. Referal — "kim olib keldi" (odam, mukofot bilan);
-- kampaniya — "qayerdan keldi" (guruhdagi post, ijtimoiy tarmoq, tanishlar).
-- Bitta odam ikkalasiga ham ega bo'lishi mumkin va ular bir-birini bosib
-- o'tmaydi.

-- Admin yaratgan havola. Kod tasodifiy: nomdan yasalsa nom o'zgarganda
-- eski postlardagi havolalar buzilardi.
CREATE TABLE acquisition_campaigns (
    id          uuid        PRIMARY KEY,
    code        text        NOT NULL UNIQUE,
    name        text        NOT NULL,
    kind        text        NOT NULL,
    created_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    -- To'xtatilgan havola bosilishni ham, biriktirishni ham yozmaydi,
    -- lekin uning tarixiy raqamlari adminkada qoladi.
    archived_at timestamptz,

    CONSTRAINT chk_acquisition_campaigns_kind
        CHECK (kind IN ('TELEGRAM_GROUP', 'SOCIAL', 'FRIENDS', 'OFFLINE', 'OTHER')),
    CONSTRAINT chk_acquisition_campaigns_name
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)
);

-- Bosilishlar jurnali — voronkaning birinchi bosqichi. Anonim bosish ham
-- yoziladi: hali ro'yxatdan o'tmagan odam aynan kampaniya olib kelgan odam.
CREATE TABLE campaign_clicks (
    id          bigserial   PRIMARY KEY,
    campaign_id uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    channel     text        NOT NULL,
    user_id     uuid,
    telegram_id bigint,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_campaign_clicks_channel CHECK (channel IN ('WEB', 'BOT'))
);

CREATE INDEX idx_campaign_clicks_campaign ON campaign_clicks (campaign_id, created_at DESC);

-- Foydalanuvchi qaysi kampaniyadan kelgani.
--
-- user_id PRIMARY KEY — BIRINCHI MANBA G'OLIB, va bu qoida kodda emas,
-- shu yerda. Keyin boshqa havolani bosgan odam manbasini o'zgartirmaydi:
-- uni platformaga birinchi havola olib kelgan.
CREATE TABLE user_acquisitions (
    user_id     uuid        PRIMARY KEY,
    campaign_id uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_acquisitions_campaign ON user_acquisitions (campaign_id);

-- Botga /start c_<kod> bilan kelgan, lekin hali akkounti yo'q odam.
-- `efbazaar.auth.user-registered` kelganda shu telegram_id bilan
-- haqiqiy biriktirishga aylanadi — pending_referrals bilan bir xil.
CREATE TABLE pending_campaign_attributions (
    telegram_id bigint      PRIMARY KEY,
    code        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
