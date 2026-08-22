-- ==============================================================
-- Rejalar nima berishining YAKUNIY holati.
--
-- Repeatable migratsiya: mazmuni o'zgarganda Flyway uni qayta ishga tushiradi.
-- Limitni o'zgartirish uchun shu faylni tahrirlaymiz, yangi V-migratsiya
-- ochmaymiz — narx-navo va chegaralar mahsulot qarori, sxema o'zgarishi emas.
--
-- Idempotent bo'lishi shart (bir necha marta ishlaydi): faqat
-- INSERT ... ON CONFLICT DO UPDATE. Bu yerga DDL yozmang.
--
-- NULL = cheksiz.
--
-- Diqqat: bu fayl mavjud kalitlarni yangilaydi, lekin ro'yxatdan OLIB
-- TASHLANGAN kalitni bazadan o'chirmaydi. Huquqni bekor qilish kerak bo'lsa,
-- uni shu yerdan o'chirish yetmaydi — alohida V-migratsiyada DELETE yozing.
-- ==============================================================

INSERT INTO plan_entitlements (plan_code, key, value, updated_at) VALUES
    -- Savdo orqali olinadigan escrow pochta qutilari uchun bo'sh joy soni.
    -- Band qilingani: hozir foydalanuvchida turgan qutilar + tirik savdoda
    -- uning tomoniga ajratilganlari. Quti o'chirilsa joy bo'shaydi.
    ('STANDARD', 'mailbox.slots', '3',  now()),
    ('PRO',      'mailbox.slots', '10', now()),
    ('MAX',      'mailbox.slots', NULL, now())

ON CONFLICT (plan_code, key) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_at = now();
