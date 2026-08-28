-- ==============================================================
-- marketplace-service V37 — botdan yuborilgan ommaviy xabarlar.
--
-- Jadval ikki vazifani bajaradi: jo'natish jarayonining holatini saqlaydi
-- va tarixni beradi. Ikkalasi bitta qatorda, chunki tarix aslida
-- yakunlangan jo'natishning o'zi.
--
-- YUBORILGAN XABARNI QAYTARIB BO'LMAYDI. Shuning uchun bu yerda hech narsa
-- o'chirilmaydi va tahrirlanmaydi — har jo'natish o'z qatorini oladi.
-- ==============================================================

CREATE TABLE bot_broadcasts (
    id               uuid        PRIMARY KEY,

    -- Xabarning o'zi. Yuborilgandan keyin ham saqlanadi: tarixda aynan
    -- nima ketganini ko'rsatish kerak, hozirgi shablonni emas.
    message_text     text        NOT NULL,
    banner_file_id   text,
    -- [[{text,url}, ...], ...] — Telegram inline_keyboard bilan bir xil shakl.
    buttons          jsonb       NOT NULL DEFAULT '[]'::jsonb,

    status           text        NOT NULL,

    -- Kimga yuborilgan. Tarixda ham saqlanadi: "nega bu xabarni faqat 3 kishi
    -- oldi" degan savolga javob shu ustunda turadi.
    --
    -- ADMINS — haqiqiy jo'natishdan oldingi sinov rejimi. Xabar bir necha
    -- kishiga ketadi va xato bo'lsa arzon tuzatiladi; ALL bilan esa xato
    -- qaytarib bo'lmaydigan bo'lib qoladi.
    audience         text        NOT NULL DEFAULT 'ALL',

    -- Manzillar soni jo'natish boshlanganda aniqlanadi va keyin o'zgarmaydi.
    -- Foizni shu songa nisbatan hisoblaymiz.
    total_recipients integer     NOT NULL DEFAULT 0,
    -- Uch xil natija ataylab alohida: "yuborilmadi" degan bitta son
    -- nosozlikni yashiradi. Bloklangan foydalanuvchi kutilgan holat,
    -- xatolik esa tekshirishni talab qiladi.
    sent_count       integer     NOT NULL DEFAULT 0,
    failed_count     integer     NOT NULL DEFAULT 0,
    blocked_count    integer     NOT NULL DEFAULT 0,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    started_at       timestamptz,
    finished_at      timestamptz,
    -- Nima uchun to'xtaganini adminga ko'rsatish uchun.
    error_message    text,

    CONSTRAINT chk_bot_broadcasts_status
        CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')),
    CONSTRAINT chk_bot_broadcasts_audience
        CHECK (audience IN ('ALL', 'USERS', 'ADMINS'))
);

-- Tarix eng yangisidan boshlab ko'rsatiladi.
CREATE INDEX idx_bot_broadcasts_created_at ON bot_broadcasts (created_at DESC);

-- Bir vaqtda faqat BITTA jo'natish ketishi mumkin.
--
-- Bu qulf DB darajasida turibdi, chunki uni kodda tekshirish yetarli emas:
-- ikkita admin bir vaqtda "Yuborish" bossa, ikkala so'rov ham tekshiruvdan
-- o'tib ketardi va foydalanuvchilar ikkita xabar olardi. Qaytarib esa
-- bo'lmaydi.
CREATE UNIQUE INDEX uk_bot_broadcasts_one_active
    ON bot_broadcasts ((status IN ('QUEUED', 'SENDING')))
    WHERE status IN ('QUEUED', 'SENDING');
