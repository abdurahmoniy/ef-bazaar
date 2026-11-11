# auth-service

Foydalanuvchi identifikatsiyasi va sessiyalar. JWT faqat shu yerda chiqariladi va tekshiriladi.
Boshqa servislar tokenni ko'rmaydi: nginx har so'rovda `/api/v1/auth/verify` ni chaqiradi
va natijadagi `X-User-*` headerlarni servisga uzatadi (SSO — tashqi loyihalar ham shu yo'ldan foydalanadi).

Rollar ham shu yerda: `ROLE_USER`, `ROLE_ADMIN`, `ROLE_TRADE_ADMIN`, `ROLE_PARTNER`.
Boshqa servis rol bermaydi — so'raydi (masalan `partner-approved` event'i).

| | |
|---|---|
| Port | 8081 |
| Public yo'l | `/api/auth/**` → `/api/**` |
| DB | `AUTH_DB_NAME` — `users`, `trade_admin_applications` |
| Redis | refresh token blacklist, rate limit, Telegram `file_path` keshi |

## Kirish usullari

- Telegram Login Widget — `POST /api/v1/auth/telegram`
- Telegram Mini App — `POST /api/v1/auth/telegram-webapp` (`initData` HMAC tekshiriladi)
- Google — `POST /api/v1/auth/google/login`; mavjud akkountga ulash: `/google/link`, `/telegram/link`
- `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` (refresh token Redis blacklistga)

Token brauzerda `access_token` cookie'sida keladi (`Authorization: Bearer` ham qabul qilinadi).
Access TTL 15 daqiqa, refresh 30 kun.

Login oldidan access-service'dan kirish shartlari (kanal a'zoligi) so'raladi — `AccessGate`.
**Fail-open:** access-service javob bermasa login davom etadi, faqat aniq "bajarilmagan" javobi to'sadi.

## `/api/v1/auth/verify` shartnomasi (nginx subrequest)

- `204` + `X-User-Id`, `X-User-Roles` (vergul bilan), `X-Telegram-Id`, `X-User-Name` (Base64 — ism ASCII emas).
- `401` — token yo'q yoki yaroqsiz.
- **Boshqa hech qanday status qaytmasligi kerak** — nginx uni 500 sahifaga aylantiradi.

## API

| Guruh | Endpointlar |
|---|---|
| Foydalanuvchi | `GET /api/v1/users/me`, `DELETE /api/v1/users/me`, `GET /api/v1/users/me/access`, `POST /api/v1/users/me/terms`, `GET /api/v1/users/{id}/photo`, `GET /api/v1/users/me/photo` |
| Trade-admin arizasi | `POST /api/v1/trade-admin-applications`, `GET .../me` |
| Admin | `GET /api/v1/admin/users`, `GET .../by-ids`, `GET .../signups?days=30` (kunlik ro'yxatdan o'tishlar, Toshkent kuni; bo'sh kunlar nol), `PUT .../{id}/role`, `DELETE .../{id}`; `GET /api/v1/admin/trade-admin-applications`, `POST .../{id}/approve`, `.../reject` |
| Ichki (`X-Internal-Secret`) | `/internal/auth/v1/users/`: `admins`, `by-telegram-id/{telegramId}`, `telegram-ids`, `names/batch`, `summary/batch` |

`names/batch` va `summary/batch` ni marketplace va trade ishlatadi. Ular **fail-soft** —
xato bo'lsa bo'sh xarita qaytaradi va chaqiruvchi ismsiz davom etadi.

## Kafka

Chiqaradi: `efbazaar.auth.*` (user-registered, user-deleted, user-role-changed, google-linked,
user-photo-needed, user-logged-in) va `efbazaar.notifications.*`.

**Enricher'lar** (`kafka/*Enricher`): marketplace/trade/payment hodisasini oladi, ism va
Telegram ID qo'shib `efbazaar.notifications.*` ga chiqaradi → bot DM yuboradi.
Bot'da DB yo'qligi sababli boyitish shu yerda.

Tinglaydi: `bot.user-photo-set`, `marketplace.partner-approved` / `partner-cancelled`
(PARTNER rolini beradi/oladi) va enricher manbalari. To'liq ro'yxat:
[docs/kafka-topics.md](../../docs/kafka-topics.md).

## Konfiguratsiya

`JWT_SECRET` (faqat shu servisda), `JWT_ACCESS_TOKEN_TTL_MINUTES`, `JWT_REFRESH_TOKEN_TTL_DAYS`,
`TELEGRAM_BOT_TOKEN` (initData va Login Widget imzosi uchun), `GOOGLE_CLIENT_ID`,
`RATE_LIMIT_*`, `ACCESS_INTERNAL_BASE_URL`, `INTERNAL_API_SECRET`, Postgres/Redis/Kafka.

**Oferta roziligi.** `POST /api/v1/users/me/terms` `{ "version": "YYYY-MM-DD" }` foydalanuvchi
rozi bo'lgan oferta va maxfiylik siyosati versiyasini `users.terms_version` va `terms_accepted_at`
ga yozadi (V10). Shu versiyaga takroriy rozilik birinchi vaqtni o'zgartirmaydi. `/me` javobida
`termsVersion` qaytadi. Joriy versiyani frontend (`lib/legal.ts` `TERMS_VERSION`) belgilaydi va
farq qilsa rozilikni qayta so'raydi.

## Ehtiyot bo'l

- nginx `_auth_verify` bloklarida `proxy_set_header Host $host;` shart — aks holda upstream
  nomidagi pastki chiziq (`auth_upstream`) sababli Tomcat 400 qaytaradi.
- `JWT_SECRET` ni boshqa servisga bermang — arxitektura qoidasi (CLAUDE.md).
- Rate limit Redis yiqilsa ochiq qoladi (so'rovni to'smaydi).

## Test

`mvn -B -ntp clean verify` (15 unit test).
