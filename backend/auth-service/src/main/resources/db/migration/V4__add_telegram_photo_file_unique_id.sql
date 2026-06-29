-- Telegram'ning file_unique_id — bir xil rasm uchun barqaror identifier (file_id
-- esa har sendPhoto'da o'zgaradi). Login paytida shu qiymatni solishtirib, agar
-- foydalanuvchining Telegram'dagi rasmi o'zgarmagan bo'lsa, qayta upload qilmaymiz.

ALTER TABLE users
    ADD COLUMN telegram_photo_file_unique_id VARCHAR(64);
