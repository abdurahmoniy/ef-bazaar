-- Telegram custom emoji to'plamlari.
--
-- Nima uchun bazada: Telegram'ning o'zida to'plamlar bor, lekin bot ularni
-- QIDIRA olmaydi — faqat nomi ma'lum bo'lganini ocha oladi. Ya'ni "biz qaysi
-- to'plamlarni ishlatamiz" degan ro'yxat faqat bizda bo'lishi mumkin.
--
-- Fayllar bu yerda saqlanmaydi, faqat Telegram `file_id` lari. Ular
-- o'zgarmaydi va fayl kerak bo'lganda bot ularni proksilaydi.

CREATE TABLE emoji_pack (
    id            UUID PRIMARY KEY,
    -- t.me/addemoji/<set_name> — Telegram uchun yagona kalit, shuning uchun
    -- bir to'plam ikki marta qo'shilmasin.
    set_name      VARCHAR(64)  NOT NULL UNIQUE,
    title         VARCHAR(255) NOT NULL,
    added_by      UUID,
    added_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    refreshed_at  TIMESTAMPTZ
);

CREATE TABLE emoji_pack_item (
    id                UUID PRIMARY KEY,
    -- To'plam o'chsa ichidagilar ham ketadi: ular mustaqil ma'noga ega emas.
    pack_id           UUID        NOT NULL REFERENCES emoji_pack(id) ON DELETE CASCADE,
    -- Matnga aynan shu tushadi: <tg-emoji emoji-id="...">
    custom_emoji_id   VARCHAR(32) NOT NULL,
    -- Zaxira emoji. Bitta belgidan uzun bo'lishi mumkin (bayroq, ZWJ
    -- ketma-ketligi), shuning uchun keng joy.
    emoji             VARCHAR(32) NOT NULL,
    file_id           TEXT        NOT NULL,
    thumbnail_file_id TEXT        NOT NULL,
    -- video (.webm) | animated (.tgs) | static (.webp) — brauzer uchalasini
    -- boshqacha chizadi.
    format            VARCHAR(16) NOT NULL,
    -- Telegram bergan tartib. `position` emas: u SQL'da funksiya nomi va
    -- ba'zi kontekstlarda chalkashlik tug'diradi.
    sort_order        INT         NOT NULL
);

-- Qayta import qilinganda yozuvlar takrorlanmasin.
CREATE UNIQUE INDEX ux_emoji_pack_item_emoji ON emoji_pack_item (pack_id, custom_emoji_id);
-- Panelda to'plam har doim Telegram tartibida chiziladi.
CREATE INDEX ix_emoji_pack_item_order ON emoji_pack_item (pack_id, sort_order);
