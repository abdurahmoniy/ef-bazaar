-- Hamkorlik reklama bozori: kanal, buyurtma, post.

-- Tasdiqlangan hamkorlikning reklama yuzasi.
--
-- ATAYLAB partner_applications DAN AJRATILGAN. Ariza — qabul qilingan
-- qarorning o'zgarmas yozuvi; kanal esa hamkorlik davomida o'zgarib
-- turadigan sozlamalarni olib yuradi (narx, obunachi soni, to'lov
-- rejimi). Ikkalasini bitta qatorga qo'shsak, arizaning tarixiy
-- qiymatlari ustiga yozilardi.
CREATE TABLE partner_channels (
    id                   uuid          PRIMARY KEY,
    partner_user_id      uuid          NOT NULL,
    application_id       uuid          NOT NULL UNIQUE,
    telegram_channel_id  bigint        NOT NULL UNIQUE,
    title                text          NOT NULL,
    username             text,
    photo_file_id        text,
    subscriber_count     integer       NOT NULL,
    subscriber_synced_at timestamptz   NOT NULL DEFAULT now(),
    -- Tasodifiy, ismdan yasalmagan: kanal nomi o'zgarsa havola
    -- buzilmasin va birovning kodini taxmin qilib bo'lmasin.
    link_code            text          NOT NULL UNIQUE,
    post_price_som       numeric(14,2) NOT NULL,
    -- NULL = global sozlamaga ergashadi. Global qiymatni yaratilish
    -- paytida NUSXALAB olsak, admin keyin global sozlamani
    -- o'zgartirganda bu kanal jimgina eski shartda qolardi — bu
    -- aynan adminning kutganiga zid.
    payout_mode          text,
    trade_percent_bp     integer,
    fixed_monthly_som    numeric(14,2),
    active               boolean       NOT NULL DEFAULT true,
    created_at           timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_partner_channels_price CHECK (post_price_som >= 0),
    CONSTRAINT chk_partner_channels_mode  CHECK (payout_mode IS NULL OR payout_mode IN ('PERCENT', 'FIXED')),
    CONSTRAINT chk_partner_channels_bp    CHECK (trade_percent_bp IS NULL OR (trade_percent_bp >= 0 AND trade_percent_bp <= 10000)),
    CONSTRAINT chk_partner_channels_fixed CHECK (fixed_monthly_som IS NULL OR fixed_monthly_som >= 0)
);

-- Qidiruv: bo'sh so'rovda obunachi bo'yicha reyting. Faqat faol
-- kanallar ko'rinadi.
CREATE INDEX idx_partner_channels_ranking
    ON partner_channels (subscriber_count DESC) WHERE active;

-- E'lonning kanalga joylanishi.
--
-- order_id bitta tanlash amalida buyurilgan postlarni guruhlaydi:
-- sotuvchi TO'PLAMGA rozi bo'ladi va pul ham shu to'plam uchun bir
-- yo'la ushlanadi. Usiz 12 000 so'mi bor odam uchta 5 000 lik kanal
-- tanlab, ikkitasini olib qolardi — uchtasini tanlagan holda.
CREATE TABLE listing_channel_posts (
    id                  uuid          PRIMARY KEY,
    order_id            uuid          NOT NULL,
    listing_id          uuid          NOT NULL,
    partner_channel_id  uuid          NOT NULL REFERENCES partner_channels (id),
    -- Buyurtma paytida muhrlanadi: narxini ko'targan hamkor
    -- allaqachon rozi bo'lgan sotuvchidan ko'proq ola olmaydi.
    price_som           numeric(14,2) NOT NULL,
    state               text          NOT NULL,
    telegram_message_id text,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    posted_at           timestamptz,
    error               text,

    CONSTRAINT uk_listing_channel_posts UNIQUE (listing_id, partner_channel_id),
    CONSTRAINT chk_listing_channel_posts_state CHECK (
        state IN ('AWAITING_FUNDS', 'HELD', 'POSTED', 'FAILED', 'REFUNDED')),
    CONSTRAINT chk_listing_channel_posts_price CHECK (price_som >= 0)
);

CREATE INDEX idx_listing_channel_posts_order   ON listing_channel_posts (order_id);
CREATE INDEX idx_listing_channel_posts_channel ON listing_channel_posts (partner_channel_id, created_at DESC);

-- Global to'lov siyosati partner_settings ga qo'shiladi.
--
-- Foiz ASOS PUNKTIDA saqlanadi, foizda emas: 10.5% ni butun songa
-- sig'dirib bo'lmaydi, numeric(5,2) esa savdo yopilishida yaxlitlash
-- bahsini ochadi. 1000 bp = 10%.
ALTER TABLE partner_settings
    ADD COLUMN default_payout_mode       text          NOT NULL DEFAULT 'PERCENT',
    ADD COLUMN default_trade_percent_bp  integer       NOT NULL DEFAULT 1000,
    ADD COLUMN default_fixed_monthly_som numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN min_post_price_som        numeric(14,2) NOT NULL DEFAULT 1000,
    ADD COLUMN max_post_price_som        numeric(14,2) NOT NULL DEFAULT 100000;

ALTER TABLE partner_settings
    ADD CONSTRAINT chk_partner_settings_mode   CHECK (default_payout_mode IN ('PERCENT', 'FIXED')),
    ADD CONSTRAINT chk_partner_settings_bp     CHECK (default_trade_percent_bp BETWEEN 0 AND 10000),
    ADD CONSTRAINT chk_partner_settings_fixed  CHECK (default_fixed_monthly_som >= 0),
    ADD CONSTRAINT chk_partner_settings_bounds CHECK (min_post_price_som <= max_post_price_som);
