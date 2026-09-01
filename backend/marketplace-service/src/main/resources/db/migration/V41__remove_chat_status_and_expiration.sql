-- ==============================================================
-- marketplace-service V41 — Chat status va 24h auto-close'ni olib tashlash.
--
-- Chatlar endi yopilmaydi (CLOSED / ACTIVE holatlari yo'q), suhbatlar
-- doim ochiq qoladi va 24 soatdan keyin avtomatik yopilmaydi.
-- Foydalanuvchilar o'zaro chatlarni faqat "Muhim" (important) qilib
-- belgilashlari mumkin.
-- ==============================================================

-- 1. Expiration indexini o'chirish
DROP INDEX IF EXISTS idx_chats_expiry_candidates;

-- 2. Statusga bog'liq indekslarni o'chirish
DROP INDEX IF EXISTS uk_chats_active_buyer_listing;
DROP INDEX IF EXISTS idx_chats_seller_status;
DROP INDEX IF EXISTS idx_chats_buyer_status;

-- 3. chats jadvalidan status, closed_at, system_important ustunlarini va cheklovlarni o'chirish
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chk_chats_status;
ALTER TABLE chats DROP COLUMN IF EXISTS status;
ALTER TABLE chats DROP COLUMN IF EXISTS closed_at;
ALTER TABLE chats DROP COLUMN IF EXISTS system_important;

-- 4. chat_trade_pins jadvalini o'chirish (chunki u faqat 24h expiration'dan saqlash uchun ishlatilgan)
DROP TABLE IF EXISTS chat_trade_pins;

-- 5. Foydalanuvchilar o'rtasidagi chatlarni tezkor qidirish uchun yangi indekslar
CREATE INDEX IF NOT EXISTS idx_chats_buyer_id ON chats (buyer_id);
CREATE INDEX IF NOT EXISTS idx_chats_seller_id ON chats (seller_id);
CREATE INDEX IF NOT EXISTS idx_chats_pair ON chats (buyer_id, seller_id);
