-- ==============================================================
-- marketplace-service V32 — chat ichidagi akkount so'rovi.
--
-- Muammo: chat `listing_id` bilan tug'iladi, lekin suhbat davomida u
-- haqiqatni aks ettirmay qo'yadi. Sotuvchida ikkita e'lon bo'lsa, chat
-- qaysi biri haqida ekani hech qayerda yozilmagan — savdo ochilganda
-- qaysi akkount sotilayotgani mavhum bo'lib qoladi.
--
-- Yechim: har savdodan oldin aniq bir e'lon tanlanadi. Tanlagan odam
-- xaridor, ikkinchisi sotuvchi — ya'ni rollar shu qatordan kelib chiqadi,
-- `chats.buyer_id` / `chats.seller_id` dan emas. Shuning uchun bir juftlik
-- bitta chatda qayta-qayta, har safar boshqa e'lon bo'yicha va kerak bo'lsa
-- teskari rollarda savdo qila oladi.
--
-- `chats` sxemasi ataylab qimirlamaydi: `listing_id` va eski unikal indeks
-- suhbat qayerdan boshlangani tarixi sifatida qoladi.
-- ==============================================================

CREATE TABLE chat_account_requests (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id      UUID        NOT NULL REFERENCES chats(id)    ON DELETE CASCADE,
    -- So'ragan taraf — savdo ochilganda XARIDOR bo'ladi.
    requester_id UUID        NOT NULL,
    listing_id   UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

    status       VARCHAR(16) NOT NULL DEFAULT 'OPEN',

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at    TIMESTAMPTZ,

    CONSTRAINT chk_car_status CHECK (status IN ('OPEN', 'FULFILLED', 'CANCELLED')),
    -- Yopilgan so'rov qachon yopilganini bilishi shart; ochig'i bilmasligi.
    CONSTRAINT chk_car_closed_at CHECK (
        (status = 'OPEN'  AND closed_at IS NULL) OR
        (status <> 'OPEN' AND closed_at IS NOT NULL)
    )
);

-- Bir chatda bir vaqtda faqat bitta ochiq so'rov. Yangisi tanlansa eskisi
-- CANCELLED ga o'tadi — aks holda "qaysi e'lon bo'yicha" degan mavhumlik
-- shu jadvalning ichiga ko'chib o'tgan bo'lardi.
CREATE UNIQUE INDEX uk_car_open_per_chat
    ON chat_account_requests (chat_id)
    WHERE status = 'OPEN';

CREATE INDEX idx_car_chat_created ON chat_account_requests (chat_id, created_at DESC);
CREATE INDEX idx_car_listing      ON chat_account_requests (listing_id);
