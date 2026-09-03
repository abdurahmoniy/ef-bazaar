-- Kanal avatarining Telegram file_id si.
--
-- Ariza ustida saqlanadi, chunki u kanal tekshirilganda ma'lum bo'ladi,
-- reklama kanali esa faqat TASDIQLANGANDA ochiladi — oradagi vaqtda
-- qiymatni qo'yadigan boshqa joy yo'q.
--
-- Kanalda avatar bo'lmasligi mumkin, shuning uchun NULL normal.
ALTER TABLE partner_applications
    ADD COLUMN channel_photo_file_id text;
