-- Kim qaysi kanaldan kelgani.

-- Bosilishlar jurnali — voronkaning birinchi bosqichi.
--
-- Chegarasiz o'sadigan yagona jadval. Adminka undan AGREGAT o'qiydi,
-- qatorlarni emas, shuning uchun indeks aynan shu so'rov uchun.
CREATE TABLE partner_link_clicks (
    id                 bigserial   PRIMARY KEY,
    partner_channel_id uuid        NOT NULL REFERENCES partner_channels (id),
    kind               text        NOT NULL,
    listing_id         uuid,
    -- Kirmagan odam bosgan bo'lsa NULL. Bunday bosishni tashlab
    -- yuborish konversiyaning boshini yo'qotish demak — hali
    -- ro'yxatdan o'tmagan odam aynan kanal olib kelgan odam.
    user_id            uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_partner_link_clicks_kind CHECK (kind IN ('REFERRAL', 'LISTING'))
);

CREATE INDEX idx_partner_link_clicks_funnel
    ON partner_link_clicks (partner_channel_id, created_at DESC);

-- Xaridor shu e'lonni oxirgi marta qaysi kanaldan ko'rgani.
--
-- OXIRGI BOSISH G'OLIB: bir odam bitta akkountni ikki kanalda ko'rib
-- ikkalasiga ham bossa, ikkinchisi birinchisini bosib o'tadi — ulush
-- savdoni haqiqatan keltirgan kanalga tegishli.
--
-- Savdo ochilgach bu jadvalning o'zgarishi savdoga TA'SIR QILMAYDI:
-- qiymat `trades` ga muhrlanadi va u yerdan o'qiladi.
CREATE TABLE listing_partner_attributions (
    listing_id         uuid        NOT NULL,
    user_id            uuid        NOT NULL,
    partner_channel_id uuid        NOT NULL REFERENCES partner_channels (id),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (listing_id, user_id)
);
