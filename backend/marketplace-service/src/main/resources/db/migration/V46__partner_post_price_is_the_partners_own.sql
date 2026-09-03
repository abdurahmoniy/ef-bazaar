-- Post narxi butunlay hamkorning o'z ishi.
--
-- V43 admin uchun eng kam va eng ko'p chegara qo'shgan edi. Qaror
-- o'zgardi: narx hamkorning o'z chegarasi, admin unga aralashmaydi.
-- Bozor o'zi tartibga soladi — qimmat kanal shunchaki tanlanmaydi.
--
-- Kanal endi NOL bilan ochiladi: hamkor narxini o'zi qo'ymaguncha
-- kanali "bepul" bo'lib turadi, "eng kam narx" bilan emas. Nol narx
-- ledger'da hech narsa yozmaydi — hold ham, to'lov ham o'tkazib
-- yuboriladi.
ALTER TABLE partner_settings
    DROP CONSTRAINT IF EXISTS chk_partner_settings_bounds,
    DROP COLUMN IF EXISTS min_post_price_som,
    DROP COLUMN IF EXISTS max_post_price_som;

-- Mavjud kanallar V43 chegarasi bilan ochilgan bo'lishi mumkin.
-- Ularga tegilmaydi: hamkor allaqachon ko'rgan narxni ostidan
-- o'zgartirish, sotuvchi kutgan summani ham o'zgartirardi.
