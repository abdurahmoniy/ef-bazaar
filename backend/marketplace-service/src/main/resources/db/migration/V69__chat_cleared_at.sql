-- Chat tarixini tozalash vaqti.
--
-- "Chatni o'chirish" ilgari faqat YASHIRARDI: xabarlar joyida qolar,
-- keyingi xabar esa bayroqni ikkala tomondan tozalab, butun eski tarixni
-- qaytarardi — jumladan tugagan savdolarning statuslarini. Juftlik boshqa
-- akkount ustida yangi suhbat boshlaganda eskisi ko'rinib turardi.
--
-- Endi bu ustun kesish nuqtasi: undan OLDINGI xabarlar ikkala tarafga ham
-- ko'rsatilmaydi. Xabarlar o'chirilmaydi — nizo chiqqanda admin panelida
-- ochib ko'rish mumkin bo'lishi kerak.
ALTER TABLE chats ADD COLUMN cleared_at TIMESTAMPTZ;

COMMENT ON COLUMN chats.cleared_at IS
    'Tarix tozalangan vaqt: bundan oldingi xabarlar foydalanuvchilarga ko''rsatilmaydi, lekin saqlanadi va admin panelida ko''rinadi.';
