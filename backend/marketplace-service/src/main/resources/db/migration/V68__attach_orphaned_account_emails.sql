-- Poygada qolib ketgan pochta manzillarini akkountlarga ulaydi.
--
-- Savdo yakunlangani va pochta topshirilgani ikki xil topikda keladi va ikki
-- xil tranzaksiyada ishlanadi. Bir vaqtda kelganda hech biri ikkinchisining
-- hali commit qilinmagan yozuvini ko'rmagan: biri akkountni emailSIZ ochgan,
-- ikkinchisi esa "akkount yo'q" deb manzilni kutish jadvaliga qo'ygan. Endi
-- kod har ikki tomondan commit'dan keyin qayta qaraydi, lekin bugungi
-- yetim qatorlarni birov ulashi kerak.
--
-- Bir martalik ta'mir: koddagi tuzatishdan keyin yangi yetim qolmaydi.

UPDATE user_accounts a
   SET email = p.email,
       email_source = 'PLATFORM'
  FROM pending_account_emails p
 WHERE a.source_trade_id = p.trade_id
   AND a.owner_id = p.user_id
   AND (a.email IS NULL OR a.email = '');

-- Ulangani kutish jadvalida qolmasin. Akkounti hali ochilmagan manzillar
-- joyida qoladi — ular haqiqatan ham kutyapti.
DELETE FROM pending_account_emails p
 USING user_accounts a
 WHERE a.source_trade_id = p.trade_id
   AND a.owner_id = p.user_id
   AND a.email IS NOT NULL
   AND a.email <> '';
