# payment-service

Platformadagi barcha pul: hamyonlar, ledger, to'ldirish (invoice), pul yechish, savdo
escrow'i, tariflar (plan/obuna), hamkorlik to'lovlari, referal mukofotlari va reklama
hisob-kitobi. Pul qoidalari faqat shu servisda — boshqalar `/internal/**` orqali so'raydi.

| | |
|---|---|
| Port | 8087 |
| Public yo'l | `/api/payment/**` → `/api/**` (token shart) |
| DB | `PAYMENT_DB_NAME` (Flyway `V1`–`V15`) |
| Redis | ishlatilmaydi |
| Birlik | **tiyin** (`long`), float hech qayerda yo'q. trade-service so'mda hisoblaydi — konvertatsiya trade tomonida |

## To'ldirish qanday ishlaydi (karta rail)

1. Foydalanuvchi invoice ochadi (`POST /api/v1/payments/invoices`) — platformaning Humo
   kartasi va shu invoice uchun **noyob summa** beriladi. (karta, summa) jufti invoice
   yashagan davomida band.
2. Foydalanuvchi kartaga pul o'tkazadi.
3. `userbot-payment` Humo bot chatidagi xabarni o'qib `payment.card-credit-observed` chiqaradi.
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
| `plan` | Tariflar va kim qaysi tarifda; `plan_prices` (narx, tiyin), `plan_purchases` (xaridlar), `plan_entitlements` (slot sonlari — admin boshqaradi, R__ ularga tegmaydi); `plan-entitlements` / `subscription-changed` ni chiqaradi; **`STAFF`** — ADMIN roli uchun yashirin tarif (V16: `active=false`, narx qatori yo'q, barcha huquq `null` = cheksiz): ommaviy katalogda ko'rinmaydi, `plans/prices` va `plans/entitlements` uni rad etadi (400) va admin ro'yxatida chiqmaydi, STAFF foydalanuvchi `plans/purchase` da 409 `staff_unlimited` oladi; `plans/assign` uni qabul qiladi (mavjud adminlarni backfill qilish uchun). Har plan kalitida `STAFF` ham `null` bo'lishi `StaffPlanIT` bilan qulflangan. `PlanReminderJob` har soatda xaridorning Telegramiga tugashiga 3 kun qolganda va tugaganda bir martadan eslatma yuboradi (keyinroq uzaytirilgan xarid haqida yozmaydi; `payment.scheduler.plan-reminder-interval-ms`) |
| `partner`, `partnerads`, `referral` | Hamkorlik to'lovi, kanal reklamasi (hold → har post yetkazilganda settle), referal mukofoti |
| `analytics` | Egasi uchun raqamlar: kartadagi pulning qancha qismi bizniki, komissiya va h.k. |
| `notify` | `BotClient` — admin Telegram xabarlari bot orqali (tokenni bu servis bilmaydi) |
| `crypto` | `MASTER_KEY_FILE` bilan karta raqamlarini shifrlash |

## API

| Guruh | Endpointlar |
|---|---|
| Foydalanuvchi (`/api/v1/payments/...`) | `wallet`, `wallet/transactions`, `invoices` (POST), `invoices/active`, `invoices/{id}/status`, `withdrawals`, `plans` (har plan `prices` bilan: `{"MONTH": 1000000, "YEAR": 10000000}`, sotuvda bo'lmagan plan uchun `{}`), `plans/me`, `plans/purchase` (POST `{planCode,period,expectedPriceTiyin,idempotencyKey}` — hamyondan bitta tranzaksiyada yechib tarifni yoqadi; xuddi shu tarif muddatni uzaytiradi, yuqoriroq tarif bugundan to'liq muddatga boshlanadi, pastroq tarif tirik yuqoriroq ustiga rad etiladi; qayta urinish bir xil `idempotencyKey` bilan bir marta yechadi; xatolar `code`: `price_changed` 409 (+`currentPriceTiyin`), `downgrade_not_allowed` 409, `already_unlimited` 409, `staff_unlimited` 409, `plan_not_purchasable` 400; mablag' yetmasa 409 `Hamyonda mablag' yetarli emas — N so'm yetishmayapti`; ledger turi `PLAN_PURCHASE`, daromad `PLATFORM_REVENUE`ga; `subscription-changed` commit'dan keyin chiqadi), `commission` |
| Admin (`/api/v1/admin/...`) | `payments/cards/**` (qo'shish, faollashtirish, tartib), `payments/observations/**`, `payments/analytics/overview`, `payments/commission`, `payments/userbot`, `withdrawals/**`, `plans/assign`, `plans/prices` (GET ro'yxat; PUT `{prices:[{planCode,period,priceTiyin}]}` — faqat PRO/MAX (STANDARD/STAFF rad etiladi), `priceTiyin > 0`, hammasi yoki hech narsa), `plans/entitlements` (GET ro'yxat; PUT `{entitlements:[{planCode,key,value}]}` — faqat `mailbox.slots`/`mailbox.custom_slots`, `value` null = cheksiz, aks holda butun son >= 0, hammasi yoki hech narsa; commit'dan keyin plan snapshot Kafka'ga darhol chiqadi) |
| Ichki (`X-Internal-Secret`) | `/internal/trades/{tradeId}/escrow/quote|hold|release|settle` (trade), `/internal/partners/charge`, `/internal/referrals/reward`, `/internal/partner-ads/*` (marketplace) |

## Kafka

- Tinglaydi: `payment.card-credit-observed`, `payment.card-debit-observed`, `payment.userbot-heartbeat` (userbot-payment'dan);
  `auth.user-role-changed` (group `payment-service-user-role-changed`) — `newRole=ADMIN` bo'lsa foydalanuvchi `STAFF` tarifiga
  `source=ROLE` bilan o'tadi, `oldRole=ADMIN` bo'lib rol olinsa faqat `source=ROLE` bo'lgan `STAFF` `STANDARD`ga qaytadi
  (admin bergan yoki sotib olingan tarifga tegilmaydi). Takror xabar bir xil holatga olib keladi.
  Kuzatuvlar `(userbotTelegramId, telegramMessageId)` juftligi bo'yicha idempotent (V14): Telegram xabar
  id'lari faqat bitta akkount ichida noyob, payment kuzatuvi boshqa akkountga o'tkazilsa id'lar
  to'qnashadi. `userbotTelegramId` siz (eski userbot) xabar `NULL` bilan saqlanadi va o'zaro takror deb topiladi.
- Chiqaradi: `payment.deposit-credited`, `payment.withdrawal-requested` / `-closed`,
  `payment.plan-entitlements`, `payment.subscription-changed`.

Hozirgi publisher broker ishlamasa xabarni log qilib tashlab yuboradi (outbox yo'q) —
`PaymentEventPublisher` izohiga qarang. Batafsil: [docs/kafka-topics.md](../../docs/kafka-topics.md).

## Ehtiyot bo'l

- Ledger'ga faqat `LedgerService.post` orqali yozing. Har harakat idempotent kalit bilan
  (masalan withdrawal ticket id) — qayta urinish ikki marta yozmaydi.
- `userbot-payment` chiqishiga pastda ikkinchi tekshiruv yo'q: kuzatuv payload'idagi maydon
  nomini o'zgartirish consumer'ni **jim** sindiradi (xabar tashlab yuboriladi).
- Platformaning zarari (kartadagi puldan ko'p majburiyat) — biznes holati, xato emas.

## Test

`mvn -B -ntp clean verify` — 87 unit, 229 integratsion (`*IT`).
