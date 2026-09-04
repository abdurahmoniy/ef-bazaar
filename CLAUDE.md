# efBazaar — CLAUDE.md (Root)

## Loyiha haqida
efBazaar — eFootball akkountlar savdo platformasi (marketplace).
Monorepo. Har bir servis mustaqil deploy bo'ladi.
Auth-service boshqa tashqi loyihalar tomonidan ham ishlatilishi mumkin (SSO).

---

## Repo strukturasi

```
efBazaar/
├── backend/
│   ├── auth-service/           # JWT, SSO — Spring Boot, port 8081
│   ├── marketplace-service/    # E'lonlar, like, savat, chat — Spring Boot, port 8082
│   └── trade-service/          # Escrow trade lifecycle: proposals, state machine, encrypted per-role chats, one-time password passthrough, WSS live push, Kafka boundary to smart-admin-worker — Spring Boot, port 8085
├── frontend/                   # Next.js — asosiy sayt (efbazaar.uz)
├── mail/                       # Next.js — read-only webmail (mail.efbazaar.uz), trade-service mail API frontendi
├── bot/                        # Telegram bot — Spring Boot, port 8084
├── nginx/                      # Reverse proxy
└── docker-compose.yml
```

---

## Texnologiya stack

| Qatlam | Texnologiya |
|--------|-------------|
| Backend + Bot | Java 21, Spring Boot 3.x |
| Frontend | React 18 + Vite (MVP — minimal auth UI) |
| Asosiy DB | PostgreSQL 16 (har servisga alohida DB) |
| Cache / Blacklist | Redis 7 |
| Event bus | Apache Kafka |
| Reverse proxy | Nginx |
| Media storage | Telegram (bot yuboradi, DB da `message_id` saqlanadi) |
| Containerization | Docker + Docker Compose |
| CI/CD | GitHub Actions — selective deploy (path-based) |

---

## Servislar va portlar

| Servis | Internal port | Nginx path |
|--------|--------------|------------|
| auth-service | 8081 | /api/auth/** |
| marketplace-service | 8082 | /api/marketplace/** |
| bot | 8084 | /bot/webhook |
| trade-service | 8085 | /api/v1/trades/** |
| smart-admin-worker | 8086 | — (internal only) |
| frontend | 80 | / |
| mail-frontend | 3000 | mail.efbazaar.uz/ (Mailcow: /api, /SOGo, ActiveSync saqlanadi) |
| PostgreSQL | 5432 | internal only |
| Redis | 6379 | internal only |
| Kafka | 9092 | internal only |

**smart-admin-worker** (Python 3.12) — Konami/mail automation for the trade lifecycle. Consumes Kafka `efbazaar.trade.*` request topics, provisions Mailcow mailboxes, drives Konami forgot-password via `rotate.py` (Chromium subprocess), polls IMAP for reset/2FA emails, and rotates mailbox passwords when trades close. DB-less. Adds backpressure events (`worker-queued`, `worker-started`) so an over-subscribed worker never silently orphans a trade — trade-service extends the deadline and posts a chat status.

---

## Auth arxitekturasi (MUHIM — barcha servislar uchun qoida)

1. Foydalanuvchi login → `auth-service` access token + refresh token beradi.
2. Har bir himoyalangan so'rov: `nginx` → `auth-service /api/v1/auth/verify` subrequest.
3. `marketplace-service`, `trade-service`, `payment-service`, `bot` tokenni o'zlari tekshirmaydi.
4. Servis ichida faqat nginx uzatgan `X-User-Id` va `X-User-Roles` headerlaridan foydalanadi.
5. JWT secret faqat `auth-service` da — boshqa servislar bu secretni bilmaydi.
6. Tashqi loyihalar ham shu `auth-service` ga ulana oladi — SSO prinsipi.

JWT tuzilmasi:
```json
{ "sub": "userId (UUID)", "roles": ["ROLE_USER"], "iat": ..., "exp": ... }
```
- Access token TTL: 15 daqiqa
- Refresh token TTL: 30 kun
- Logout → refresh token Redis blacklistga tushadi

---

## Deployment — GitHub Actions (selective, path-based)

Qaysi papkada commit bo'lsa, faqat o'sha servis deploy bo'ladi.

```yaml
# .github/workflows/deploy.yml — umumiy pattern
on:
  push:
    branches: [main]

jobs:
  deploy-auth:
    if: contains(github.event.commits[*].modified, 'backend/auth-service/')
    # yoki paths filter:
    # paths: ['backend/auth-service/**']

  deploy-marketplace:
    paths: ['backend/marketplace-service/**']

  deploy-bot:
    paths: ['bot/**']

  deploy-frontend:
    paths: ['frontend/**']
```

Server deploy buyrug'i (faqat o'sha servis):
```bash
docker compose build <service-name>
docker compose up -d --no-deps <service-name>
```

`--no-deps` — boshqa ishlab turgan servislarni to'xtatmaydi.

---

## Kafka topic konvensiyasi

Format: `efbazaar.<service>.<event>` — kichik harf, defis bilan.

```
efbazaar.auth.user-registered
efbazaar.auth.user-logged-in
efbazaar.marketplace.listing-created
efbazaar.marketplace.listing-updated
efbazaar.marketplace.listing-deleted
efbazaar.marketplace.like-toggled
efbazaar.marketplace.chat-created
efbazaar.marketplace.cards-added     # { occurredAt, totalAdded, cards: [{efhubId, type, name, overallRating}] }
efbazaar.marketplace.bot-settings-updated  # marketplace → bot (/start matni o'zgardi, kesh yangilansin)
efbazaar.marketplace.partner-application-submitted  # marketplace → bot (adminlarga Telegram xabari)
efbazaar.marketplace.partner-approved      # marketplace → auth (PARTNER roli beriladi)
efbazaar.marketplace.partner-rejected      # marketplace → (foydalanuvchiga xabar)
efbazaar.marketplace.partner-cancelled     # marketplace → auth (PARTNER roli olib tashlanadi)
efbazaar.marketplace.channel-post-requested # marketplace → bot (e'lonni hamkor kanaliga joyla)
efbazaar.marketplace.channel-refresh-requested # marketplace → bot (kunlik: obunachi soni, nom, avatar)
efbazaar.bot.media-uploaded          # { listingId, telegramMessageId, mediaType }
efbazaar.auth.user-role-changed      # auth → trade-service (deactivate trade-admin profile on role revoke)
efbazaar.trade.admin-invited         # trade-service → marketplace-service (TRADE_ADMIN_INVITED notification)
efbazaar.trade.trade-opened          # trade-service
efbazaar.trade.trade-closed          # trade-service
efbazaar.trade.trade-succeeded       # trade-service → marketplace-service (referal mukofoti)
```

---

## Marketplace — domain modeli

### Listing (E'lon)
```
description           TEXT
valuablePlayers       List<String>   — search va recommendation uchun
hasGooglePlayLink     boolean
highestDivisionLevel  int            — 1 dan 9 gacha (@Min(1) @Max(9))
androidCoins          int
iosCoins              int
teamStrength          int
price                 BigDecimal     — so'mda
isPriceNegotiable     boolean        — savdolashish mumkinmi (checkbox)
mediaMessageIds       List<String>   — Telegram message_id lar
status                ACTIVE | SOLD | DELETED
```

### Chat (akkount almashinuvi uchun)
- Chat listing sahifasidagi "Egasi bilan bog'lanish" tugmasi orqali xaridor tomonidan boshlanadi
- Bir juftlik o'rtasida bitta doimiy chat mavjud bo'ladi va yangi listinglar bo'yicha suhbatlar shu chat ichida davom etadi
- Chatlar doimiy ochiq bo'ladi (CLOSED/ACTIVE statuslari va 24h avtomatik yopilish yo'q)
- Foydalanuvchilar o'zlariga kerakli chatlarni "Muhim" (star) qilib belgilashlari mumkin

### Kelajak uchun rejalashtirilgan (hozir qurilmaydi)
- Friends / Followers tizimi (`forward` action log qilinsin — keyinroq kerak)
- Forward funksiyasi (`forward_count` field saqlansa yetarli hozircha)

---

## Kod konvensiyalari (Java / Spring Boot)

- Java 21 — Record, Pattern matching, Sealed classes ishlatiladi
- Package: `uz.efbazaar.<service>.<layer>` (masalan `uz.efbazaar.auth.service`)
- Controller → Service → Repository pattern
- DTO ↔ Entity: MapStruct — to'g'ridan-to'g'ri mapping uchun. Hisoblanadigan
  maydon (masalan o'rtacha, foiz, hisoblangan bayroq) yoki boshqa servisdan
  keladigan qiymat bo'lsa, DTO ichida `static of(...)` factory ishlatiladi
  (masalan `TradeAdminCardResponse.of`) — MapStruct'ga `@AfterMapping`
  qo'shishdan ko'ra o'qilishi oson va bitta joyda turadi
- Validatsiya: Jakarta Validation (`@Valid`, `@NotNull` va h.k.)
- Exception handling: `@ControllerAdvice` — markazlashtirilgan
- API versioning: `/api/v1/...`
- Commit format: `feat(auth): add refresh token rotation`
- Default export yo'q (Java uchun: public class, package-private minimum)

---

## Flyway migration qoidasi (buzilmasin)

Ikki xil migration bor va ular bir xil qoidaga bo'ysunmaydi:

**`V<n>__*.sql` — versionli, immutable.**
Bir marta ishlaydi, checksumi Flyway `flyway_schema_history` da qulflanadi.
`main` ga merge bo'lgan V-faylni edit qilsangiz keyingi deploy checksum
mismatch bilan crash bo'ladi (PR #98, #101, #104, #107 dan darsim).

- DDL uchun ishlatiladi: `CREATE TABLE`, `ALTER TABLE`, `DROP INDEX`, yangi
  ustun, yangi CHECK, ...
- O'zgartirish kerak bo'lsa — **yangi** `V<n+1>__...sql`.
- Edit / rename / delete taqiqlanadi. CI `guard-migrations` job'i PR'da
  shuni tekshiradi va merge'ni bloklaydi.

**`R__*.sql` — repeatable, edit qilish uchun mo'ljallangan.**
Har content o'zgarganda Flyway qayta ishga tushiradi. `V__` lardan keyin,
har boot'da.

- Faqat *idempotent* data uchun: `INSERT ... ON CONFLICT DO UPDATE`,
  `UPDATE ... WHERE`. DDL yozmang — bir necha marta ishlaganida yiqiladi.
- Hozircha bitta: `R__attribute_definitions.sql` — barcha attribute
  rowlarning desired final state'i. Label / constraint / position tweak
  bo'lsa shu faylni edit qilamiz, yangi migration ochmaymiz.
- CI guardi R-fayllarga tegmaydi (edit ruxsat etilgan).

## Muhim cheklovlar

- Hech qachon `auth-service` DB siga boshqa servisdan to'g'ridan ulanma
- `sellerId` request body dan olinmaydi — faqat `X-User-Id` headerdan
- Har bir servisda o'z `application.yml` — env variable lar orqali konfiguratsiya
- Secret va credentials `.env` da — hech qachon git ga tushmaydi
- Kafka eventlarda idempotency key ishlatiladi
- Media fayllar DB da faqat Telegram `message_id` — fayl saqlash yo'q
