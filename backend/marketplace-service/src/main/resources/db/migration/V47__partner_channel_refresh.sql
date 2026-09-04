-- Kunlik yangilanish kanalni Telegram'dan qayta o'qiydi: obunachi soni,
-- nom va avatar. Bularning hammasi hamkorlik davomida o'zgarib turadi,
-- lekin hozirgacha faqat tekshiruv paytida bir marta olinardi.
--
-- Hisoblagich KETMA-KET muvaffaqiyatsizliklarni sanaydi. Bir kunlik
-- xato Telegram'ning vaqtincha javob bermasligi bo'lishi mumkin —
-- shuning uchun birinchi xatoda hamkorlik to'xtatilmaydi. Uch kun
-- ketma-ket o'qib bo'lmasa, bot chindan ham kanalda emas.
ALTER TABLE partner_channels
    ADD COLUMN refresh_failures INT NOT NULL DEFAULT 0;
