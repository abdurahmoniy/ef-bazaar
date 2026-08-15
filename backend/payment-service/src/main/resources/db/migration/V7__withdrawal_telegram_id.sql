-- ==============================================================
-- payment-service V7 — tiketga Telegram chat id.
--
-- Tiket yopilganda foydalanuvchiga shaxsiy Telegram xabari yuboriladi.
-- Buning uchun raqamli chat id kerak: `telegram_username` bunga yaramaydi —
-- Telegram @username orqali shaxsiy xabarni ishonchli yetkazmaydi, va
-- username foydalanuvchi kiritgan matn, ya'ni obro'li emas.
--
-- Qiymat nginx uzatgan `X-Telegram-Id` headeridan olinadi, ya'ni tiket
-- ochilayotgan sessiyaning o'zidan. Telegram ulanmagan akkountda NULL.
-- ==============================================================

ALTER TABLE withdrawal_tickets ADD COLUMN telegram_id BIGINT;
