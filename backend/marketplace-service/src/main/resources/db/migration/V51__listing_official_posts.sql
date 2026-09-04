-- Har bir e'lon efBazaar rasmiy kanaliga ham tushadi.
--
-- Hamkor kanali tanlangan bo'lsa, rasmiy kanaldagi nusxa o'sha
-- kanaldan FORWARD qilinadi. "Forwarded from <hamkor kanali>"
-- sarlavhasi efBazaar e'lonni tortib olmayotganini, balki
-- hamkorlikni TASDIQLAYOTGANINI ko'rsatadi — hamkor uchun bu
-- ishonch masalasi.
--
-- Kanal manzili bazada emas, env o'zgaruvchisida: u muhitga qarab
-- farq qiladi va staging jonli kanalga post qilmasligi kerak.
CREATE TABLE listing_official_posts (
    listing_id          uuid          PRIMARY KEY,
    -- Manba post: forward qilingan bo'lsa qaysi hamkor kanalidan.
    -- NULL — to'g'ridan-to'g'ri joylangan (hamkor tanlanmagan).
    source_post_id      uuid,
    state               text          NOT NULL,
    telegram_message_id text,
    error               text,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    posted_at           timestamptz,

    CONSTRAINT chk_listing_official_posts_state CHECK (
        state IN ('PENDING', 'POSTED', 'FAILED'))
);

-- E'lon o'chirilsa rasmiy kanaldagi yozuvi ham ketadi: uni saqlashning
-- moliyaviy sababi yo'q, chunki bu post bepul va hech kimga to'lanmagan.
ALTER TABLE listing_official_posts
    ADD CONSTRAINT fk_listing_official_posts_listing
    FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE;
