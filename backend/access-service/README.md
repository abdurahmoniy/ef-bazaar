# access-service

Kirish shartlari: foydalanuvchi login qilishidan oldin bajarishi kerak bo'lgan talablar
(hozircha — Telegram kanalga a'zolik). Admin shartlarni qo'shadi, auth-service login paytida
va bot `/start` da so'raydi.

| | |
|---|---|
| Port | 8088 |
| Public yo'l | `/api/access/**` → `/api/**` (anonim ham o'tadi) |
| DB | `ACCESS_DB_NAME` (`access_db`) — bitta jadval `access_requirements` |
| Redis | "shart bajarilgan" natijasi keshi (`ACCESS_MET_CACHE_TTL`, default 10 daqiqa) |
| Kafka | ishlatilmaydi |

## API

| Endpoint | Kim uchun |
|---|---|
| `GET /api/v1/access-requirements` | Login'siz ochiq — "kirish uchun shu kanallarga a'zo bo'ling" ekrani |
| `GET/DELETE /api/v1/admin/access-requirements`, `POST .../telegram-channels` | Admin |
| `POST /internal/access/v1/check` | auth-service (login), bot (`/start`) — `X-Internal-Secret` bilan |

## Qoida: faqat aniq "yo'q" to'sadi

`CheckOutcome` natijalari: `MET` (bajarilgan), `UNMET` (bajarilmagan) va `UNKNOWN` (tekshirib bo'lmadi).
Login faqat `UNMET` da rad etiladi. Telegram yoki bot javob bermasa (`UNKNOWN`) foydalanuvchi
o'tkaziladi — shartlar biznes talabi, xavfsizlik chegarasi emas. Chaqiruvchilar (auth, bot)
ham fail-open: access-service o'chiq bo'lsa login davom etadi.

A'zolik bot orqali tekshiriladi (`/bot/internal/channels/**`) — bot tokeni faqat botda.
Bot 404 qaytarsa "kanal yo'q", boshqa har qanday xato — "tekshirib bo'lmadi".

## Yangi shart turi qo'shish

`type` + JSONB `config` sxemasi shuning uchun: yangi tur jadvalni o'zgartirmaydi —
`RequirementType` ga qiymat va yangi checker klassi qo'shiladi.
`(type, external_key)` noyob — bir kanalni ikki marta qo'shib bo'lmaydi.

## Test

`mvn -B -ntp clean verify` — 2 unit test.
