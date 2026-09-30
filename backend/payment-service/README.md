# payment-service

Platformadagi barcha pul: hamyonlar, ledger, to'ldirish (invoice), pul yechish, savdo
escrow'i, tariflar (plan/obuna), hamkorlik to'lovlari, referal mukofotlari va reklama
hisob-kitobi. Pul qoidalari faqat shu servisda — boshqalar `/internal/**` orqali so'raydi.

| | |
|---|---|
| Port | 8087 |
| Public yo'l | `/api/payment/**` → `/api/**` (token shart) |
| DB | `PAYMENT_DB_NAME` (Flyway `V1`–`V13`) |
| Redis | ishlatilmaydi |
| Birlik | **tiyin** (`long`), float hech qayerda yo'q. trade-service so'mda hisoblaydi — konvertatsiya trade tomonida |

## To'ldirish qanday ishlaydi (karta rail)

1. Foydalanuvchi invoice ochadi (`POST /api/v1/payments/invoices`) — platformaning Humo
   kartasi va shu invoice uchun **noyob summa** beriladi. (karta, summa) jufti invoice
   yashagan davomida band.
2. Foydalanuvchi kartaga pul o'tkazadi.
3. `humo-userbot` Humo bot chatidagi xabarni o'qib `payment.card-credit-observed` chiqaradi.
4. `ByCardService` kuzatuvni ochiq invoice bilan moslaydi va hamyonga yozadi. Mos kelmasa —
   admin navbatiga (`/admin/payments/observations/unmatched`). Shubhali holatda xavfsizroq yo'l tanlanadi.
5. `InvoiceExpirySweeper` muddati o'tgan invoicelarni `EXPIRED` qiladi va (karta, summa) juftini bo'shatadi.

Userbot'dan `userbot-heartbeat` kelmay qolsa yangi to'ldirishlar qabul qilinmaydi.

## Paketlar

| Paket | Vazifasi |
|---|---|
| `wallet` | `LedgerService` — `ledger_entries` ning **yagona yozuvchisi** va `wallet_accounts` ning yagona o'zgartiruvchisi. Har pul harakati `post` orqali. `TradeEscrowService` — hold/release/settle, idempotent |
| `invoice`, `observation`, `card`, `debit`, `history` | Karta rail: invoice, kuzatuvlarni moslash, platforma kartalari, kartadan chiqim, harakatlar tarixi |
| `withdrawal` | Pul yechish — qo'lda to'lanadigan ticketlar navbati (reserve → paid yoki reject) |
| `plan` | Tariflar va kim qaysi tarifda; `plan-entitlements` / `subscription-changed` ni chiqaradi |
| `partner`, `partnerads`, `referral` | Hamkorlik to'lovi, kanal reklamasi (hold → har post yetkazilganda settle), referal mukofoti |
| `analytics` | Egasi uchun raqamlar: kartadagi pulning qancha qismi bizniki, komissiya va h.k. |
| `notify` | `BotClient` — admin Telegram xabarlari bot orqali (tokenni bu servis bilmaydi) |
| `crypto` | `MASTER_KEY_FILE` bilan karta raqamlarini shifrlash |

## API

| Guruh | Endpointlar |
|---|---|
| Foydalanuvchi (`/api/v1/payments/...`) | `wallet`, `wallet/transactions`, `invoices` (POST), `invoices/active`, `invoices/{id}/status`, `withdrawals`, `plans`, `plans/me`, `commission` |
| Admin (`/api/v1/admin/...`) | `payments/cards/**` (qo'shish, faollashtirish, tartib), `payments/observations/**`, `payments/analytics/overview`, `payments/commission`, `payments/userbot`, `withdrawals/**`, `plans/assign` |
| Ichki (`X-Internal-Secret`) | `/internal/trades/{tradeId}/escrow/quote|hold|release|settle` (trade), `/internal/partners/charge`, `/internal/referrals/reward`, `/internal/partner-ads/*` (marketplace) |

## Kafka

- Tinglaydi: `payment.card-credit-observed`, `payment.card-debit-observed`, `payment.userbot-heartbeat` (humo-userbot'dan).
- Chiqaradi: `payment.deposit-credited`, `payment.withdrawal-requested` / `-closed`,
  `payment.plan-entitlements`, `payment.subscription-changed`.

Hozirgi publisher broker ishlamasa xabarni log qilib tashlab yuboradi (outbox yo'q) —
`PaymentEventPublisher` izohiga qarang. Batafsil: [docs/kafka-topics.md](../../docs/kafka-topics.md).

## Ehtiyot bo'l

- Ledger'ga faqat `LedgerService.post` orqali yozing. Har harakat idempotent kalit bilan
  (masalan withdrawal ticket id) — qayta urinish ikki marta yozmaydi.
- `humo-userbot` chiqishiga pastda ikkinchi tekshiruv yo'q: kuzatuv payload'idagi maydon
  nomini o'zgartirish consumer'ni **jim** sindiradi (xabar tashlab yuboriladi).
- Platformaning zarari (kartadagi puldan ko'p majburiyat) — biznes holati, xato emas.

## Test

`mvn -B -ntp clean verify` — 10 unit, 32 integratsion (`*IT`).
