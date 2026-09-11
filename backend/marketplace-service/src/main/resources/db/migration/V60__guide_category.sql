-- Qo'llanma toifasi: start, safety, buyer, seller, wallet, faq.
--
-- Yordam markazi sahifasida (/help) videolarni toifalar bo'yicha
-- filtrlash uchun kerak. Mavjud qatorlar 'start' toifasida qoladi.
ALTER TABLE guide
    ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'start';

CREATE INDEX ix_guide_category ON guide (category);
