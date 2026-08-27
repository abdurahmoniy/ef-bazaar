-- ==============================================================
-- marketplace-service V36 — Telegram botining /start xabari.
--
-- NEGA BU YERDA. Botda ma'lumotlar bazasi yo'q va ataylab shunday:
-- u stateless, faqat Telegram bilan gaplashadi. Adminka esa allaqachon
-- marketplace-service bilan gaplashadi. Ikkita matn qatori uchun botga
-- alohida Postgres, Flyway va JPA qo'shish — foydasiga nisbatan juda
-- katta qurilma bo'lardi.
--
-- Bot bu jadvalni /internal/marketplace/v1/bot-settings orqali o'qiydi va
-- oxirgi muvaffaqiyatli javobni xotirasida saqlaydi. Marketplace yiqilsa
-- ham /start ishlashda davom etadi — shuning uchun bu bog'liqlik botni
-- sindira olmaydi.
-- ==============================================================

CREATE TABLE bot_settings (
    -- Bitta qatorli jadval. CHECK bo'lmasa ikkinchi qator qo'shilishi
    -- mumkin va o'shanda "qaysi biri haqiqiy?" degan savol tug'iladi —
    -- kod esa jimgina birinchisini oladi. Cheklovni DB darajasida
    -- qo'yamiz, chunki bu yerda uni chetlab o'tib bo'lmaydi.
    id             smallint    PRIMARY KEY,
    welcome_text   text        NOT NULL,

    -- Telegram file_id. Rasm Telegram serverida yotadi, bizda faqat
    -- havola — CLAUDE.md dagi media qoidasi bilan bir xil. Shu tufayli
    -- har /start da qayta yuklash bo'lmaydi, sendPhoto bir zumda ketadi.
    -- NULL = banner yo'q, bot oddiy matnli xabar yuboradi.
    banner_file_id text,

    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     uuid,

    CONSTRAINT chk_bot_settings_singleton CHECK (id = 1)
);

-- Boshlang'ich matn. Telegram caption chegarasi 1024 belgi (teglar
-- hisobga olinmaydi) — bu matn 617 birlik, ya'ni o'sish uchun joy bor.
INSERT INTO bot_settings (id, welcome_text) VALUES (1, $welcome$⚽️ <b>efBazaar</b> — eFootball akkountlar bozori

Bu yerda siz akkauntingizni xavfsiz sotasiz yoki o'zingizga mos jamoani topasiz.

<b>Nima qila olasiz</b>
📋 E'lon joylash — jamoa kuchi, divizion, meta o'yinchilar, coinlar
🔍 Narx va reyting bo'yicha qidirish
💬 Sotuvchi bilan to'g'ridan-to'g'ri chat
❤️ Yoqqan e'lonlarni saqlab qo'yish

<b>Nega aynan efBazaar</b>
🤖 Savdoni smart admin olib boradi — aldash imkonsiz
📧 Akkaunt bizning qattiq nazoratdagi pochtamizga o'tadi, shundan keyin uni yo'qotib bo'lmaydi
🔐 Savdo ma'lumotlari shifrlangan saqlanadi
✅ Sotuvchilarda ishonch reytingi bor

Boshlash uchun pastdagi tugmani bosing 👇$welcome$);
