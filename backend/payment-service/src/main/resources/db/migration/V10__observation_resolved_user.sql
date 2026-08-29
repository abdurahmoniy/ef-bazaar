-- ==============================================================
-- payment-service V10 — qo'lda biriktirilgan tushum kimga ketganini
-- qatorning o'zida saqlash.
--
-- Bu ma'lumot bugungacha faqat ledger yozuvida bo'lgan va u yerdan
-- observation'ga qaytib kelish yo'li yo'q edi: bog'lovchi kalit
-- idempotency string ichida. Ya'ni "bu pulni kim oldi" degan savolga
-- javob berish uchun ikkita jadvalni qo'lda solishtirish kerak bo'lardi.
--
-- Amal QAYTARIB BO'LMAYDI — pul darhol hisobga tushadi. Shuning uchun
-- kim, kimga va nima uchun degan uchala savol ham bir qatorda turishi
-- kerak: audit keyinroq emas, aynan shu yerda kerak bo'ladi.
-- ==============================================================

ALTER TABLE card_credit_observations
    ADD COLUMN resolved_user_id uuid;

-- Bitta adminning ishini ko'rish uchun. Tarix ro'yxati vaqt bo'yicha
-- teskari tartibda o'qiladi.
CREATE INDEX idx_observations_resolved_at
    ON card_credit_observations (resolved_at DESC)
    WHERE resolved_at IS NOT NULL;
