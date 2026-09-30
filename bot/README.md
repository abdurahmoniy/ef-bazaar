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
