-- marketplace-service — V63: yopilgan pul yechish so'rovlari admin ishorasidan chiqadi
--
-- Admin paneldagi "Yechishlar" ishorasi adminlarning o'qilmagan
-- WITHDRAWAL_REQUESTED qatorlarini sanaydi. So'rov to'langanda yoki rad
-- etilganda bu qatorlar o'qilgan deb belgilanmas edi, shuning uchun ishora
-- bajarilgan so'rovlarni ham ko'rsatib turardi. Endi yopilish hodisasi ularni
-- belgilaydi; bu migratsiya esa oldin yopilganlarini tozalaydi.
--
-- Yopilgani foydalanuvchiga ketgan WITHDRAWAL_PAID / WITHDRAWAL_REJECTED
-- qatoridan bilinadi — marketplace to'lov bazasiga ulanmaydi.

UPDATE notifications
   SET read_at = NOW()
 WHERE type = 'WITHDRAWAL_REQUESTED'
   AND read_at IS NULL
   AND withdrawal_id IN (
        SELECT withdrawal_id
          FROM notifications
         WHERE type IN ('WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED')
           AND withdrawal_id IS NOT NULL
   );
