-- E'lonni bir kanalga QAYTA yuborish.
--
-- Faol kanalda e'lonlar tez aylanadi va bir kunda pastga tushib
-- ketadi. Yagona chora — uni qaytadan chiqarish, va bu har safar
-- alohida to'lanadigan alohida xizmat. Cheklov esa buni "bir e'lon
-- bir kanalga bir marta" deb qulflab turgan edi.
ALTER TABLE listing_channel_posts
    DROP CONSTRAINT uk_listing_channel_posts;

-- Qayta yuborilganda eskisi kanaldan o'chiriladi: obunachi bir xil
-- e'lonni ikki marta ko'rmasin va pastda eskirgan narx bilan turgan
-- postga tushib qolmasin.
--
-- Qator O'CHIRILMAYDI. U to'langan, hamkor undan daromad olgan va
-- hisobotda qolishi kerak — o'chirilgani faqat Telegram'dagi xabar.
ALTER TABLE listing_channel_posts
    ADD COLUMN replaced_at timestamptz;

-- Bir e'lonning bir kanaldagi postlarini vaqt bo'yicha topish: qayta
-- yuborishda eskisini shu orqali qidiramiz.
CREATE INDEX ix_listing_channel_posts_listing_channel
    ON listing_channel_posts (listing_id, partner_channel_id, created_at DESC);
