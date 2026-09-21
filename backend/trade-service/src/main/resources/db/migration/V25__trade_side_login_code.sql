-- Xaridor akkountga kirmoqchi bo'lganda Konami tasdiqlash kodini pochtaga
-- yuboradi. Pochta hali platformada — xaridor uni o'qiy olmaydi, shuning
-- uchun kodni smart-admin o'qib beradi.
--
-- Kod QABUL QILUVCHI tarafning qatorida saqlanadi: obmenda ikkala taraf
-- ham bir-birining akkountiga kiradi va har biriga o'z kodi kerak.
ALTER TABLE trade_sides ADD COLUMN login_code TEXT;
ALTER TABLE trade_sides ADD COLUMN login_code_at TIMESTAMPTZ;
