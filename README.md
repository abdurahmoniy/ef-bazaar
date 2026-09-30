# efBazaar

eFootball akkountlari savdo platformasi (marketplace) — efbazaar.uz.
Sotuvchi akkountini e'lon qiladi, xaridor chat orqali kelishadi, savdo esa
trade-service ichida escrow bilan (avtomatik worker yoki inson trade-admin orqali) o'tadi.
Kirish Telegram orqali (Login Widget va Mini App).

Monorepo: har bir komponent mustaqil build va deploy bo'ladi.

> **Qoidalar:** [CLAUDE.md](CLAUDE.md) — arxitektura va kod konvensiyalari,
> [AGENTS.md](AGENTS.md) — test-first va tekshiruv talablari. Ikkalasi ham majburiy.

## Arxitektura

```
                 efbazaar.uz / mail.efbazaar.uz / dashboard.efbazaar.uz
                                      │
                                   nginx ── /_auth_verify ──► auth-service
                                      │      (X-User-Id, X-User-Roles qo'shadi)
      ┌──────────────┬────────────────┼─────────────┬──────────────┬──────────────┐
  frontend      marketplace        trade         payment        access          bot
  (Next.js)      -service         -service       -service      -service     (Telegram)
                     │                │              │
                     └──────── Kafka (efbazaar.*) ───┴──── smart-admin-worker (Python)
                                                     └──── humo-userbot (Python)
        PostgreSQL (har servisga alohida DB)   ·   Redis   ·   Mailcow (pochta)
```

## Komponentlar

| Komponent | Papka | Texnologiya | Port | Public yo'l | Batafsil |
|---|---|---|---|---|---|
| auth-service | `backend/auth-service` | Spring Boot | 8081 | `/api/auth/**` | [README](backend/auth-service/README.md) |
| marketplace-service | `backend/marketplace-service` | Spring Boot | 8082 | `/api/marketplace/**`, `/ws/chat` | [README](backend/marketplace-service/README.md) |
| bot | `bot` | Spring Boot | 8084 | `/bot/**` (webhook, media proxy) | [README](bot/README.md) |
| trade-service | `backend/trade-service` | Spring Boot | 8085 | `/api/trade/**` | [README](backend/trade-service/README.md) |
| smart-admin-worker | `smart-admin-worker` | Python 3.12 | 8086 (health) | — (faqat Kafka) | [README](smart-admin-worker/README.md) |
| payment-service | `backend/payment-service` | Spring Boot | 8087 | `/api/payment/**` | [README](backend/payment-service/README.md) |
| access-service | `backend/access-service` | Spring Boot | 8088 | `/api/access/**` | [README](backend/access-service/README.md) |
| humo-userbot | `humo-userbot` | Python 3.12 (Pyrogram) | — | — (faqat Kafka) | [README](humo-userbot/README.md) |
| outbox (kutubxona) | `backend/libs/outbox` | Java 21, Spring Boot auto-config | — | — | [README](backend/libs/outbox/README.md) |
| frontend | `frontend` | Next.js 16, React 19 | 3000 | `/` | [README](frontend/README.md) |
| mail-frontend | `mail` | Next.js 16 | 3000 | mail.efbazaar.uz | [README](mail/README.md) |
| nginx | `nginx` | nginx | 80/443, 8080 (ichki) | — | [README](nginx/README.md) |

Infra (`docker-compose.yml`): PostgreSQL 16, Redis 7, Kafka (KRaft), Prometheus,
Alertmanager, Grafana, Loki, Alloy, certbot. Qo'shimcha skriptlar `infra/` ichida
(backup, ops-bot, efhub scraper, Postgres init).

## So'rov qanday o'tadi

1. Brauzer `https://efbazaar.uz/api/<servis>/v1/...` ga so'rov yuboradi.
2. nginx `auth_request /_auth_verify` bilan auth-service'dan tokenni tekshirtiradi.
   Muvaffaqiyatli bo'lsa `X-User-Id`, `X-User-Roles`, `X-Telegram-Id` headerlarini qo'shadi.
3. nginx `/api/<servis>/` prefiksini olib tashlaydi va so'rovni `/api/v1/...` ko'rinishida
   servisga uzatadi. Masalan `/api/marketplace/v1/listings` → marketplace `/api/v1/listings`.
4. Servis JWT'ni o'zi tekshirmaydi — faqat nginx bergan headerlarga ishonadi.

Token bo'lmasa: marketplace va access anonim davom etadi (identity headerlar tozalanadi),
trade va payment esa 401 qaytaradi.

Frontend SSR ichki tarmoqda `http://nginx:8080/api` orqali chiqadi
(80-portda HTTPS redirect bor, shuning uchun 8080 alohida server bloki).

`api.efbazaar.uz` — tashqi iste'molchilar (botlar, integratsiyalar) uchun ikkinchi kirish:
servis prefiksisiz `/api/v1/...` (trades/payments yo'llari trade va payment'ga, qolgani
marketplace'ga) va barcha servislarning Swagger UI'si (basic auth ostida). Brauzer uni ishlatmaydi.

## Servislararo aloqa

**Kafka** — asosiy yo'l. Barcha topiclar, producer va consumerlar:
[docs/kafka-topics.md](docs/kafka-topics.md).

**Ichki HTTP** — `/internal/**` endpointlar, faqat Docker tarmog'ida
(nginx ularni tashqariga chiqarmaydi). Har so'rovda `X-Internal-Secret`
(`INTERNAL_API_SECRET`) tekshiriladi.

| Chaqiruvchi | Kimni chaqiradi |
|---|---|
| auth-service | access-service (login paytida kirish shartlari, fail-open) |
| marketplace-service | auth (ismlar, adminlar), bot (media yuklash, emoji, kanal), payment (hamkorlik to'lovi, referal mukofoti), trade (`/internal/trades/live` — faol savdolar) |
| trade-service | auth (ismlar), marketplace (e'lon shartlari, akkount), payment (escrow) |
| payment-service | bot (admin Telegram xabarlari) |
| access-service | bot (kanal a'zoligini tekshirish) |
| bot | auth, marketplace (bot sozlamalari, qo'llanmalar, referal), access |

## Ma'lumotlar

- Har bir servisning o'z PostgreSQL bazasi: auth, marketplace, trade, payment, access.
  Boshqa servisning bazasiga to'g'ridan-to'g'ri ulanish taqiqlanadi.
- `efbazaar` bazasi — efhub'dan olinadigan futbolchi kartalari katalogi. Uni
  marketplace-service ikkinchi datasource sifatida ishlatadi. Migratsiyalari:
  `infra/postgres/efbazaar/`.
- Flyway qoidalari (V-fayllar o'zgarmaydi, R-fayllar idempotent) — [CLAUDE.md](CLAUDE.md).
- Media fayllar Telegram guruh topiklarida saqlanadi. DB'da faqat `message_id` / `file_id`.

## Mahalliy ishlab chiqish va testlar

To'liq talablar: [AGENTS.md](AGENTS.md).

```bash
# Java servis (backend/* yoki bot/) — avval umumiy kutubxona
mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests
cd backend/marketplace-service && mvn -B -ntp clean verify   # *IT testlar Failsafe'da — `mvn test` yetarli emas

# frontend
cd frontend && npm ci --no-audit --no-fund && npm run typecheck && npm run lint && npm test && npm run build

# mail
cd mail && npm ci --no-audit --no-fund && npm run test && npm run build

# Python (smart-admin-worker, humo-userbot)
cd smart-admin-worker && pip install -r requirements-dev.txt && ruff check smart_admin_worker/ tests/ && pytest -q
```

Integratsion testlar Testcontainers ishlatadi — Docker kerak. Yangi Docker Engine bilan
"could not find a valid Docker environment" chiqsa: `mvn verify -DargLine="-Dapi.version=1.44"`.

## CI/CD

| Workflow | Qachon | Nima qiladi |
|---|---|---|
| `ci.yml` | `main` ga PR | O'zgargan komponentlarni test qiladi; migration guard (V-fayllar o'zgarmasligi) |
| `build.yml` | `main` ga push | O'zgargan servislarning imageini GHCR'ga yuklaydi |
| `deploy.yml` | `build.yml` muvaffaqiyatli tugaganda | Serverda `deploy.sh`: imagelarni pull qiladi, `docker compose up -d` faqat o'zgarganlarini qayta yaratadi |

## Kuzatuv (observability)

- Prometheus + Alertmanager + Grafana (dashboard.efbazaar.uz), Loki + Alloy (loglar).
- WARN/ERROR loglar `efbazaar.system.log-event` orqali bot'ga, u yerdan Telegram logs topigiga.
- `infra/ops-bot` — host darajasidagi `/logs` bot; barcha konteynerlar yiqilsa ham ishlaydi.

## Hujjatlar xaritasi

| Qayerda | Nima |
|---|---|
| `CLAUDE.md` | Arxitektura qoidalari, konvensiyalar, cheklovlar |
| `AGENTS.md` | Test va tekshiruv talablari |
| `<komponent>/README.md` | Komponentning vazifasi, API, Kafka, jadvallar, ehtiyot bo'ladigan joylar |
| `docs/kafka-topics.md` | Kafka topic katalogi |
| `docs/superpowers/`, `frontend/docs/superpowers/` | Feature'lar qanday loyihalangani tarixi — spec va planlar (hozirgi holat emas) |

Markdown fayllar CI testlarini va image build'ini ishga tushirmaydi — hujjatni erkin tahrirlang.
