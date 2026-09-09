-- Video qo'llanmalar va ular uchun bot tugmalari.
--
-- Video BIZDA saqlanmaydi: u Telegram'ga yuklanadi va bizda faqat
-- `file_id` qoladi — loyihaning umumiy qoidasi (CLAUDE.md). Shu sababli
-- qayta yuborish bepul va oniy: fayl qayta yuklanmaydi.

CREATE TABLE guide (
    id             UUID PRIMARY KEY,
    title          VARCHAR(200) NOT NULL,
    description    TEXT         NOT NULL,
    -- Telegram qaytargan file_id. Faqat SHU bot uchun amal qiladi.
    video_file_id  TEXT         NOT NULL,
    created_by     UUID,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sort_order     INT          NOT NULL DEFAULT 0
);

CREATE TABLE guide_button (
    id          UUID        PRIMARY KEY,
    -- Tugmadagi yozuv. Qo'llanma nomidan boshqa bo'lishi mumkin: tugma
    -- qisqa bo'lishi kerak, sarlavha esa tushuntirishi kerak.
    label       VARCHAR(64) NOT NULL,
    -- Qo'llanma o'chsa tugma ham ketadi. Qolsa, u bosilganda hech narsa
    -- kelmasdi va sabab foydalanuvchiga ko'rinmasdi.
    guide_id    UUID        NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
    sort_order  INT         NOT NULL DEFAULT 0
);

CREATE INDEX ix_guide_button_order ON guide_button (sort_order);
