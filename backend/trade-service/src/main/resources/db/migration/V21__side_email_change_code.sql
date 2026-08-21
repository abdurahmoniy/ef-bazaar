-- ==============================================================
-- trade-service V21 — Konami tasdiqlash kodi har tomon uchun alohida.
--
-- Kod `trades` jadvalidagi BITTA maydonda saqlanardi. Sotishda bu yetarli:
-- emailni faqat sotuvchi o'zgartiradi, ya'ni kod ham bitta.
--
-- Obmenda esa ikkala taraf ham o'z akkountining emailini o'zgartiradi va
-- Konami HAR BIRIGA alohida kod yuboradi. Bitta maydonda ular bir-birini
-- o'chirib yuboradi, va tomonlardan biriga BOSHQASINING kodi ko'rsatiladi —
-- u Konami'da ishlamaydi, chunki boshqa akkount uchun berilgan.
--
-- `trades` dagi eski ustunlar qoladi: ular yopilgan savdolarning yozuvi va
-- sotish yo'li ularni hamon o'qiydi.
-- ==============================================================

ALTER TABLE trade_sides ADD COLUMN email_change_code    VARCHAR(16);
ALTER TABLE trade_sides ADD COLUMN email_change_code_at TIMESTAMPTZ;

-- Kod bo'lsa, qachon kelgani ham bo'lishi kerak — biri ikkinchisisiz
-- ma'nosiz, va "kod bormi" tekshiruvi ikkalasiga tayanadi.
ALTER TABLE trade_sides ADD CONSTRAINT chk_trade_sides_code_at CHECK (
    (email_change_code IS NULL     AND email_change_code_at IS NULL)
 OR (email_change_code IS NOT NULL AND email_change_code_at IS NOT NULL)
);

-- Tirik savdolarni ko'chirish: kod hozircha sotuvchi tarafiga tegishli,
-- chunki obmen hali ishga tushmagan va emailni faqat sotuvchi o'zgartirgan.
UPDATE trade_sides s
   SET email_change_code    = t.email_change_verification_code,
       email_change_code_at = t.email_change_verification_code_at
  FROM trades t
 WHERE t.id = s.trade_id
   AND s.role = 'SELLER'
   AND t.email_change_verification_code IS NOT NULL
   AND t.email_change_verification_code_at IS NOT NULL;
