-- Hamkor bekor qilib, keyin qayta hamkor bo'lganda tasdiqlash yiqilardi.
--
-- Ikki qaror to'qnashdi. Bekor qilishda qator O'CHIRILMAYDI, faqat
-- active = false: chiqib bo'lgan postlar va ular keltirgan savdolar shu
-- qatorga bog'langan va hisobot ularni yo'qotmasligi kerak. Tasdiqlash
-- esa har safar yangi qator yozadi va telegram_channel_id cheklovi uni
-- to'xtatadi.
--
-- Yechim: cheklov FAOL qatorlar orasida ishlaydi. Bir kanalning bitta
-- tirik hamkorligi bo'ladi, lekin eski hamkorliklar tarix sifatida
-- yonida yotaveradi.
ALTER TABLE partner_channels
    DROP CONSTRAINT partner_channels_telegram_channel_id_key;

CREATE UNIQUE INDEX uk_partner_channels_active_telegram
    ON partner_channels (telegram_channel_id)
    WHERE active;

-- Ariza ham shunday: qayta qo'shilganda qator YANGI arizaga
-- ko'rsatadi, eskisi esa bekor qilingan holda qoladi. Cheklov saqlanadi
-- — bitta ariza ikkita kanal ocholmasin.
