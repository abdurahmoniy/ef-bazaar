-- Telegram faylni video sifatida qabul qildimi yoki document sifatida.
--
-- Yuklashda `sendVideo` javobi ikki xil bo'lishi mumkin: MPEG4 bo'lsa
-- `video`, aks holda `document`. `file_id` ikkalasida ham bo'ladi, lekin
-- ULARNI QAYTA YUBORISH usuli boshqa: document'ning id'sini `sendVideo`
-- ga bersak Telegram rad etadi.
--
-- Ilgari bu farq saqlanmasdi va har doim `sendVideo` chaqirilardi. Ya'ni
-- MP4 bo'lmagan qo'llanma bosilganda hech narsa kelmasdi.
ALTER TABLE guide
    ADD COLUMN media_kind VARCHAR(16) NOT NULL DEFAULT 'VIDEO';

-- Mavjud qatorlar VIDEO deb qoladi: ular MP4 bo'lgan bo'lsa to'g'ri, aks
-- holda ular allaqachon ishlamayotgan edi va qayta yuklash kerak.
