-- ==============================================================
-- marketplace-service V39 — hamkorlik (katta kanal adminlari).
--
-- Oqim: ariza → kanalni bot tekshiradi → to'lov → admin tasdig'i → hamkor.
--
-- Har qadam alohida holat, chunki ular orasida KUTISH bor va kutish qayerda
-- turganini bilish kerak: foydalanuvchi botni qo'shmadimi, to'lamadimi, yoki
-- admin ko'rmadimi — uchtasi butunlay boshqa muammo va bittasi ikkinchisiga
-- o'xshab ko'rinmasligi kerak.
-- ==============================================================

CREATE TABLE partner_settings (
    id              smallint    PRIMARY KEY,
    -- Hamkor bo'lish uchun kanaldagi minimal obunachi soni.
    min_subscribers integer     NOT NULL,
    -- Hamkorlik narxi (so'm).
    price_som       numeric(14,2) NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,

    CONSTRAINT chk_partner_settings_singleton CHECK (id = 1),
    CONSTRAINT chk_partner_settings_min       CHECK (min_subscribers >= 0),
    CONSTRAINT chk_partner_settings_price     CHECK (price_som >= 0)
);

INSERT INTO partner_settings (id, min_subscribers, price_som)
VALUES (1, 1000, 500000.00);

CREATE TABLE partner_applications (
    id                 uuid        PRIMARY KEY,
    user_id            uuid        NOT NULL,
    status             text        NOT NULL,

    -- Kanal ma'lumotlari botdan keladi, foydalanuvchidan emas. Foydalanuvchi
    -- kiritganida obunachi sonini ham, egalikni ham soxtalashtirib bo'lardi.
    channel_id         bigint,
    channel_title      text,
    channel_username   text,
    subscriber_count   integer,
    verified_at        timestamptz,
    -- Tekshiruv o'tmagan sabab: obunachi yetmadi, yoki qo'shgan odam kanal
    -- egasi emas. Foydalanuvchiga nimani tuzatish kerakligini aytamiz.
    verification_error text,

    -- payment-service'dagi invoice. Foreign key emas: u boshqa servisning
    -- bazasida va marketplace u yerga ulanmaydi.
    invoice_id         uuid,
    paid_at            timestamptz,

    reviewed_by        uuid,
    reviewed_at        timestamptz,
    review_note        text,

    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_partner_applications_status CHECK (status IN (
        'AWAITING_CHANNEL',   -- ariza ochildi, bot hali kanalga qo'shilmagan
        'AWAITING_PAYMENT',   -- kanal tekshiruvdan o'tdi, to'lov kutilmoqda
        'AWAITING_REVIEW',    -- to'landi, admin ko'rishi kerak
        'APPROVED',
        'REJECTED'))
);

-- Bitta foydalanuvchida bir vaqtda bitta tugallanmagan ariza.
--
-- Busiz "qayta yuborish" tugmasi ikki marta bosilganda ikkita ariza ochilar,
-- ikkisiga ham invoice yaratilar va foydalanuvchi ikki marta to'lardi.
CREATE UNIQUE INDEX uk_partner_applications_open_per_user
    ON partner_applications (user_id)
    WHERE status IN ('AWAITING_CHANNEL', 'AWAITING_PAYMENT', 'AWAITING_REVIEW');

-- Bitta kanal faqat bir marta hamkorlikka olib kelishi mumkin.
--
-- Aks holda bitta kanal bir necha hisobga bog'lanib, har biri hamkor
-- maqomini olardi.
CREATE UNIQUE INDEX uk_partner_applications_channel
    ON partner_applications (channel_id)
    WHERE channel_id IS NOT NULL AND status IN ('AWAITING_PAYMENT', 'AWAITING_REVIEW', 'APPROVED');

CREATE INDEX idx_partner_applications_status ON partner_applications (status, created_at DESC);
CREATE INDEX idx_partner_applications_user   ON partner_applications (user_id, created_at DESC);

-- ==============================================================
-- Admin panelidagi raqamli ishoralar.
--
-- "Ko'rilmagan" ni har element uchun alohida belgilash o'rniga har admin
-- uchun bo'lim bo'yicha OXIRGI KO'RGAN VAQTI saqlanadi. Ishora = shu
-- vaqtdan keyin paydo bo'lgan elementlar soni.
--
-- Sabab: har element uchun qator yozilsa, jadval elementlar × adminlar
-- bo'lib o'sardi va hech qachon tozalanmasdi. Bu yerda esa har admin
-- uchun bo'lim boshiga bitta qator.
-- ==============================================================
CREATE TABLE admin_section_views (
    admin_id     uuid        NOT NULL,
    section      text        NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (admin_id, section)
);
