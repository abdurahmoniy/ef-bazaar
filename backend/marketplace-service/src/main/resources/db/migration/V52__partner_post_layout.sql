-- Hamkor o'z kanalidagi post ko'rinishini sozlaydi.
--
-- Har kanalning auditoriyasi boshqacha: kimdir tavsifni eng yuqorida
-- ko'rsatadi, kimdir raqamlardan boshlaydi. Bitta qat'iy ko'rinish
-- ikkalasiga ham to'g'ri kelmaydi.
--
-- TARTIB massivda saqlanadi, yoqilganlik alohida emas: massivda bor
-- blok yoqilgan, yo'qi o'chirilgan. Ikki maydon bo'lsa ular vaqt
-- o'tib bir-biriga zid bo'lib qolardi (tartibda bor, yoqilganlar
-- ro'yxatida yo'q).
--
-- NULL = sozlanmagan, ya'ni default ko'rinish. Yaratilish paytida
-- default'ni nusxalab qo'ysak, keyinchalik default o'zgarganda eski
-- kanallar eski ko'rinishda qotib qolardi.
ALTER TABLE partner_channels
    ADD COLUMN post_blocks text[],
    ADD COLUMN post_footer text;

-- Footer chegarasi kodda ham bor (ChannelPostCaption.FOOTER_LIMIT).
-- Bu yerda ikkinchi to'siq: to'g'ridan-to'g'ri bazaga yozilgan uzun
-- matn rasm ostidagi 1024 belgini yeb, postni butunlay yiqitardi.
ALTER TABLE partner_channels
    ADD CONSTRAINT chk_partner_channels_footer_length
    CHECK (post_footer IS NULL OR length(post_footer) <= 300);
