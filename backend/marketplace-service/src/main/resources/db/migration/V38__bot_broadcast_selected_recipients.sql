-- ==============================================================
-- marketplace-service V38 — ommaviy xabarni aniq foydalanuvchilarga
-- yo'naltirish (ogohlantirish va shunga o'xshash maxsus xabarlar).
--
-- NEGA ALOHIDA FAYL. Bu ustun va cheklov V37 ga qo'shilishi kerak edi va
-- men uni o'sha yerda tahrirlagandim — CI `guard-migrations` buni bloklab
-- to'g'ri qildi. Qoida oddiy: V-fayl bir marta yoziladi va boshqa
-- tegilmaydi, hatto u hali main'ga tushmagan bo'lsa ham. Sabab shundaki,
-- "hali deploy bo'lmagan" degan taxminni CI tekshira olmaydi: fayl allaqachon
-- kimningdir test bazasida ishlagan bo'lishi mumkin va o'shanda checksum
-- mos kelmay qoladi.
-- ==============================================================

-- SELECTED uchun tanlangan manzillar. Boshqa auditoriyalarda bo'sh:
-- u yerda ro'yxat jo'natish paytida auth-service'dan olinadi va uni bu
-- yerda nusxalash foydasiz — u har jo'natishda o'zgaradi.
--
-- SELECTED da esa ro'yxat SHART: "bu xabar kimga ketgan" degan savolga
-- keyinchalik javob beradigan yagona joy shu.
ALTER TABLE bot_broadcasts
    ADD COLUMN recipient_telegram_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- CHECK'ga qiymat qo'shib bo'lmaydi — faqat almashtirish mumkin, shuning
-- uchun ro'yxat to'liq qayta sanab o'tiladi. V29 va V34 dagi nosozlik
-- aynan shu qadam unutilgani uchun chiqqan edi: enum o'sgan, CHECK esa
-- eski qolgan va har insert jimgina yiqilgan.
ALTER TABLE bot_broadcasts DROP CONSTRAINT chk_bot_broadcasts_audience;
ALTER TABLE bot_broadcasts ADD  CONSTRAINT chk_bot_broadcasts_audience
    CHECK (audience IN ('ALL', 'USERS', 'ADMINS', 'SELECTED'));
