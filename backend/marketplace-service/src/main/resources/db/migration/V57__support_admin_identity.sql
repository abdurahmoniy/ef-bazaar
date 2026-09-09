-- Javob bergan adminning haqiqiy kimligi.
--
-- `sender_name` foydalanuvchiga KO'RSATILADI va u endi doim "efBazaar
-- Admin" bo'ladi: murojaatchi qaysi xodim javob berganini bilishi shart
-- emas, va shaxsiy ism bilan bog'lanishga urinish qulay emas.
--
-- Lekin kim javob berganini BIZ bilishimiz kerak: noto'g'ri javob yoki
-- shikoyat bo'lsa, uni izlash mumkin bo'lsin. Shuning uchun haqiqiy
-- kimlik alohida ustunda, ko'rsatiladigan nomdan ajratilgan holda.
ALTER TABLE support_message
    ADD COLUMN admin_telegram_username VARCHAR(64);
