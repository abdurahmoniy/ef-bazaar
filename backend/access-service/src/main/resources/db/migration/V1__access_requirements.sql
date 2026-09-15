-- Kirish shartlari: foydalanuvchi login qilishidan oldin bajarishi kerak
-- bo'lgan talablar (Telegram kanalga a'zolik va keyinchalik boshqalar).
--
-- `type` bo'yicha `config` shakli farq qiladi, shuning uchun JSONB. Yangi
-- tur qo'shish jadvalni o'zgartirmaydi — faqat yangi checker klassi.
--
-- `external_key` — shu tur ichida talabni yagona aniqlaydigan qiymat
-- (Telegram kanal uchun chat id). Bir kanalni ikki marta qo'shib bo'lmaydi.
CREATE TABLE access_requirements (
    id           UUID         PRIMARY KEY,
    type         VARCHAR(40)  NOT NULL,
    external_key VARCHAR(200) NOT NULL,
    config       JSONB        NOT NULL,
    position     INT          NOT NULL DEFAULT 0,
    created_by   UUID,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_access_requirements_type_key UNIQUE (type, external_key)
);

CREATE INDEX idx_access_requirements_position ON access_requirements (position, created_at);
