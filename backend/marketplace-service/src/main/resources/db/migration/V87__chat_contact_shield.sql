-- Chat xabaridagi Telegram username yoki telefon yashirilganmi.
--
-- Asl kontakt SAQLANMAYDI — bazaga faqat yashirilgan matn yoziladi. Bayroq
-- ikki ish qiladi: ikkala tomonga garov orqali savdo eslatmasini ko'rsatadi
-- va adminga kim savdoni platformadan tashqariga olib ketmoqchi bo'lganini
-- ko'rsatadi.
ALTER TABLE chat_messages
    ADD COLUMN contact_hidden boolean NOT NULL DEFAULT false;
