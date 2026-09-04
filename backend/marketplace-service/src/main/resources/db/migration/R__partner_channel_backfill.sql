-- Allaqachon tasdiqlangan hamkorliklarga reklama kanalini ochadi.
--
-- REPEATABLE, versiyali emas: bu DDL emas, idempotent ma'lumot.
-- ON CONFLICT bilan qayta ishga tushirilsa hech narsa buzilmaydi.
--
-- Yangi tasdiqlar PartnerChannelService.onApproved orqali keladi; bu
-- fayl faqat reklama bozori qurilishidan OLDIN tasdiqlangan arizalarni
-- ushlaydi.
--
-- Kod bu yerda md5 dan olinadi, tasodifiy emas: SQL ichida takroriy
-- urinish halqasi yo'q, ariza identifikatori esa allaqachon yagona.
--
-- REPEATABLE MIGRATSIYA HAR BOOT'DA ISHLAYDI va versiyalilardan
-- KEYIN. Ya'ni u o'zi tegmagan ustun o'chirilsa ham yiqiladi — V46
-- narx chegaralarini olib tashlaganda aynan shunday bo'ldi va butun
-- kontekst ko'tarilmay qoldi.
-- translate() alifboni kod formatiga keltiradi (0/1/I/L/O chiqariladi),
-- shakli PartnerChannelService bilan bir xil bo'lishi uchun.
INSERT INTO partner_channels (
    id, partner_user_id, application_id, telegram_channel_id,
    title, username, subscriber_count, subscriber_synced_at,
    link_code, post_price_som, active, created_at)
SELECT
    gen_random_uuid(),
    a.user_id,
    a.id,
    a.channel_id,
    coalesce(a.channel_title, 'Kanal'),
    a.channel_username,
    coalesce(a.subscriber_count, 0),
    coalesce(a.verified_at, now()),
    upper(substr(translate(md5(a.id::text), '01ilo', 'ABCDE'), 1, 8)),
    -- NOL. Narx hamkorning o'z ishi va u hali qo'ymagan; biror
    -- qiymat qo'yish uning nomidan qaror qabul qilish bo'lardi, va
    -- sotuvchi o'sha qiymatni to'lardi.
    0,
    true,
    coalesce(a.reviewed_at, now())
FROM partner_applications a
WHERE a.status = 'APPROVED'
  AND a.channel_id IS NOT NULL
ON CONFLICT (application_id) DO NOTHING;
