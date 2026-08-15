-- ==============================================================
-- marketplace-service V33 — bildirishnomaga pul yechish tiketi havolasi.
--
-- Bildirishnoma qatorida `chat_id`, `listing_id`, `trade_id` bor edi; tiket
-- uchun maydon yo'q. Usiz "Pul yechish so'rovi" xabari bosilganda qaysi
-- tiketga o'tishni bilmaydi — havola ishlamaydi.
--
-- Tiket payment-service'da yashaydi, shuning uchun bu FK emas, shunchaki
-- ma'lumotnoma: marketplace o'sha jadvalni ko'rmaydi va ko'rmasligi ham
-- kerak (boshqa servis bazasiga ulanish taqiqlangan).
-- ==============================================================

ALTER TABLE notifications ADD COLUMN withdrawal_id UUID;

-- Bittasi ham majburiy emas: TRUST_* xabarlari hech qaysi obyektga
-- ishora qilmaydi, shuning uchun CHECK qo'ymaymiz.
CREATE INDEX idx_notifications_withdrawal ON notifications (withdrawal_id)
    WHERE withdrawal_id IS NOT NULL;
