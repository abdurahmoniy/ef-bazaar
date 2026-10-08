# bot

Telegram bilan ishlaydigan yagona komponent: `@EfBazaarBot` (webhook), foydalanuvchilarga
DM, admin guruh topiklariga xabarlar, hamkor kanallarga postlar, media saqlash va proxy.
**Telegram bot tokeni faqat shu yerda** — boshqa servislar Telegram'ga bot orqali chiqadi.

Bot'da **DB yo'q**. Holat kerak bo'lsa marketplace'dan HTTP orqali o'qiydi yoki
marketplace'ga yozadi (bot sozlamalari, qo'llanmalar, pending referal).

| | |
|---|---|
| Port | 8084 |
| Public yo'l | `/bot/**` — webhook va media proxy. `/bot/internal/**` tashqaridan 404 |
| Rejim | `TELEGRAM_WEBHOOK_URL` berilsa webhook, bo'lmasa long-polling (har 2 s) — `TelegramBootstrap` |

## Media

Rasm, video va fayllar Telegram guruhining media topigiga yuklanadi; boshqa servislar
faqat `message_id` / `file_id` ni saqlaydi. Ko'rsatish uchun proxy:
`GET /bot/photo/{fileId}`, `/bot/video/{fileId}`, `/bot/file/{fileId}`, `/bot/emoji/{fileId}`.

## Inline rejim (`@EfBazaarBot` — o'z e'lonini ulashish)

Telegram'i bog'langan foydalanuvchi istalgan chatda `@EfBazaarBot` yozsa, o'zining `ACTIVE`
e'lonlari chiqadi (`@EfBazaarBot messi` — o'yinchi/tavsif bo'yicha qidiruv). Tanlangani rasmiy
kanal formatida yuboriladi: muqova katta link preview, kanal matni va "🛒 E'lonni ochish"
(Mini App) tugmasi; tepada Telegram "via @EfBazaarBot" yozadi.

- `InlineQueryHandler` → marketplace `GET /internal/marketplace/v1/inline/listings?telegramId&q&offset`
  (`X-Internal-Secret`, 1,5 s timeout). Kimlik — Telegram yuborgan `from.id`.
- Natija turi `article` (ro'yxatda rasm va matn birga faqat shunda ko'rinadi); kichik rasm va preview
  `{app.web.base-url}/bot/photo/{fileId}` dan. `is_personal=true`, `cache_time=10` (xatoda 0), sahifa 20 ta.
- Ro'yxat tepasidagi Mini App tugmasi: bog'lanmagan → `/profile`, e'lon yo'q → `/marketplace/new`, qidiruvga mos e'lon yo'q → "Mos e'lon topilmadi" (`/marketplace`),
  marketplace xatosi → `/marketplace`.
- `allowed_updates` da `inline_query` bor (webhook va long-polling). BotFather'da `/setinline` yoqilgan
  bo'lishi shart, aks holda Telegram inline so'rov yubormaydi.

## Ichki API (`X-Internal-Secret`)

| Endpoint | Kim chaqiradi |
|---|---|
| `POST /bot/internal/media/upload`, `/upload-video`, `/upload-file` | marketplace (e'lon rasmlari, chat biriktirmalari, qo'llanma videolari) |
| `GET /bot/internal/channels/resolve`, `/channels/{chatId}/members/{userId}` | access-service (kanal a'zoligi) |
| `GET /bot/internal/emoji/sets/{name}` | marketplace (emoji to'plamlari) |
| `POST /bot/internal/broadcast` | marketplace (ommaviy xabar) |
| `POST /bot/internal/payments/notice`, `/notice/delete`, `/dm` | payment-service (admin va foydalanuvchi xabarlari) |

## Kafka (faqat tinglaydi, bir nechta istisno bilan)

| Guruh | Topiclar |
|---|---|
| Foydalanuvchiga DM | `notifications.chat-created`, `notifications.trade-action`, `notifications.mailbox-handed-over`, `notifications.wallet-credited` (auth boyitgan), `marketplace.partner-approved/rejected/cancelled` |
| Admin guruh topiklari | `auth.user-registered`, `auth.google-linked` (ro'yxat), `marketplace.partner-application-submitted`, `marketplace.support-message-created`, `system.log-event` (WARN/ERROR loglar) |
| Kanallar | `marketplace.channel-post-requested`, `-edit-requested`, `-delete-requested`, `-refresh-requested`, `official-post-requested` |
| Boshqa | `auth.user-photo-needed`, `auth.user-registered` (profil rasmi), `marketplace.bot-settings-updated` (/start keshi) |

`notifications.trade-action` dagi `EMAIL_CHANGE_CODE_RECEIVED` va `LOGIN_CODE_RECEIVED`
xabarlari Konami emailini almashtirish / akkountga kirib tekshirish kodini `<code>` shaklida,
savdo chatini ochish tugmasi bilan yuboradi. `details` faqat 4–8 ASCII raqamdan iborat
bo'lishi kerak; `occurredAt` kod aniqlangan vaqt. Vaqti yo'q, noto'g'ri yoki 5 daqiqadan
eski yoki kelajak vaqtli kodlar DM sifatida yuborilmaydi. Kod logga yozilmaydi.

Chiqaradi: `bot.user-photo-set`, `bot.support-message-bound`, `bot.support-reply-received`, `bot.media-uploaded`.
Batafsil: [docs/kafka-topics.md](../docs/kafka-topics.md).

## HTTP klientlar

marketplace (`/start` matni va banneri, qo'llanma tugmalari, pending referal, hamkor natijalari),
auth, access (`/start` da kirish shartlari — **fail-open**).

## Konfiguratsiya

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_TOPIC_*` (LOGS, MEDIA, PAYMENTS, REGISTRATION, SUPPORT),
`BROADCAST_MESSAGES_PER_SECOND`, `*_INTERNAL_BASE_URL`, `INTERNAL_API_SECRET`.

## Ehtiyot bo'l

- Bitta token — bitta consumer: webhook yoqilgan bo'lsa `getUpdates` ishlamaydi. Host
  darajasidagi `/logs` uchun alohida bot bor (`infra/ops-bot`).
- Kanalga custom (premium) emoji to'g'ridan-to'g'ri yuborilmaydi — faqat superguruhdan forward qilinsa ishlaydi.
- Telegram API chaqiruvlari `TelegramApiClient` orqali (reactive WebClient, lekin bloklovchi metodlar).

## Test

`mvn -B -ntp clean verify` — 20 unit test.
