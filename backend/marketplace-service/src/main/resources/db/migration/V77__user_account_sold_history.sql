-- "Akkountlarim" tarixi: sotilgan / obmen qilingan akkountlar egasining
-- ro'yxatida faqat o'qish uchun qoladi. Qachon va qanchaga ketgani
-- arxivlash paytida akkountning o'ziga yoziladi — e'lon bilan bog'lanish
-- (current_listing_id) o'sha paytda uziladi.
ALTER TABLE user_accounts ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE user_accounts ADD COLUMN sold_price NUMERIC(19, 2);

-- Eski arxiv yozuvlari: arxivlashdan keyin akkountni o'zgartirib bo'lmaydi,
-- shuning uchun oxirgi yangilanish vaqti arxivlash vaqtiga eng yaqin qiymat.
-- Narxni tiklab bo'lmaydi — e'lon bilan bog'lanish allaqachon uzilgan.
UPDATE user_accounts SET archived_at = updated_at
 WHERE status = 'ARCHIVED' AND archived_at IS NULL;
