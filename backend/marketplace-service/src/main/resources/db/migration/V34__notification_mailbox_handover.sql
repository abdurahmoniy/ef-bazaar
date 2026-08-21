-- ==============================================================
-- marketplace-service V34 — bildirishnoma turlari ro'yxatini haqiqatga
-- moslash.
--
-- `chk_notifications_type` V29 dan beri olti qiymatdan iboratdek qolgan,
-- holbuki NotificationType o'shandan keyin o'sdi:
--
-- 1) WITHDRAWAL_REQUESTED / WITHDRAWAL_PAID / WITHDRAWAL_REJECTED —
--    V33 tiket havolasi uchun ustun qo'shgan, ammo CHECK'ga qiymatlarni
--    qo'shmagan. Ya'ni pul yechish bo'yicha HECH BIR bildirishnoma
--    yozilmagan: har insert shu CHECK'da yiqilgan. Bu V29 izohida
--    tasvirlangan TRUST_* nosozligining aynan takrori.
--
-- 2) TRADE_MAILBOX_RECEIVED / TRADE_MAILBOX_RETURNED — savdo yakunlangach
--    escrow pochta qutisi kimgadir tegishli bo'ladi va bu haqda xabar
--    berish kerak. Muvaffaqiyatli savdoda bu qo'lga kiritilgan akkountning
--    qutisi; boshqa har qanday yakunda esa userning o'z akkounti uchun
--    berilgan quti — agar u akkountini allaqachon o'tkazgan bo'lsa,
--    xabarsiz qolsa akkountini yo'qotadi.
--
-- Ro'yxat to'liq sanab o'tiladi, chunki CHECK'ni qo'shib bo'lmaydi —
-- faqat almashtirish mumkin.
-- ==============================================================

ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type;
ALTER TABLE notifications ADD  CONSTRAINT chk_notifications_type
    CHECK (type IN ('CHAT_CREATED', 'CHAT_MESSAGE',
                    'TRUST_WARNING', 'TRUST_BLOCKED', 'TRUST_UNBLOCKED',
                    'TRADE_ADMIN_INVITED',
                    'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED',
                    'TRADE_MAILBOX_RECEIVED', 'TRADE_MAILBOX_RETURNED'));
