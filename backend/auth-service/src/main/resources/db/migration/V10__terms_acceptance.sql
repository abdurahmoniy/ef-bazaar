-- ==============================================================
-- auth-service V10 — oferta va maxfiylik siyosatiga rozilik.
--
-- terms_version — foydalanuvchi rozi bo'lgan hujjatlar versiyasi
-- (frontend lib/legal.ts dagi TERMS_VERSION, sana ko'rinishida).
-- terms_accepted_at — rozilik vaqti. Hujjat yangilansa versiya
-- o'zgaradi va frontend rozilikni qayta so'raydi.
--
-- Ikkalasi ham NULL bo'lishi mumkin: hali rozi bo'lmagan mavjud
-- foydalanuvchilar keyingi kirishida so'raladi.
-- ==============================================================

ALTER TABLE users ADD COLUMN terms_version     VARCHAR(32);
ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
