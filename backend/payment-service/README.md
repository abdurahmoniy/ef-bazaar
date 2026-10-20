# payment-service

Platformadagi barcha pul: hamyonlar, ledger, to'ldirish (invoice), pul yechish, savdo
escrow'i, tariflar (plan/obuna), hamkorlik to'lovlari, referal mukofotlari va reklama
hisob-kitobi. Pul qoidalari faqat shu servisda — boshqalar `/internal/**` orqali so'raydi.

| | |
|---|---|
| Port | 8087 |
| Public yo'l | `/api/payment/**` → `/api/**` (token shart) |
| DB | `PAYMENT_DB_NAME` (Flyway `V1`–`V20`) |
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
| `plan` | Tariflar va kim qaysi tarifda; `plan_prices` (narx, tiyin), `plan_purchases` (xaridlar), `plan_entitlements` (slot sonlari — admin boshqaradi, R__ ularga tegmaydi); `plan-entitlements` / `subscription-changed` ni chiqaradi; **`STAFF`** — ADMIN roli uchun yashirin tarif (V16: `active=false`, narx qatori yo'q, sonli limitlar `null` = cheksiz, boolean huquqlar `true`): ommaviy katalogda ko'rinmaydi, `plans/prices` va `plans/entitlements` uni rad etadi (400) va admin ro'yxatida chiqmaydi, STAFF foydalanuvchi `plans/purchase` da 409 `staff_unlimited` oladi; `plans/assign` uni qabul qiladi (mavjud adminlarni backfill qilish uchun). Har sonli limit kalitida `STAFF` `null`, boolean kalitida `true` bo'lishi `StaffPlanIT` bilan qulflangan. `PlanReminderJob` har soatda xaridorning Telegramiga tugashiga 3 kun qolganda va tugaganda bir martadan eslatma yuboradi (keyinroq uzaytirilgan xarid haqida yozmaydi; `payment.scheduler.plan-reminder-interval-ms`) |
| `partner`, `partnerads`, `referral` | Hamkorlik to'lovi, kanal reklamasi (hold → har post yetkazilganda settle), referal mukofoti |
| `analytics` | Egasi uchun raqamlar: kartadagi pulning qancha qismi bizniki, komissiya va h.k. |
| `notify` | `BotClient` — admin Telegram xabarlari bot orqali (tokenni bu servis bilmaydi) |
| `crypto` | `MASTER_KEY_FILE` bilan karta raqamlarini shifrlash |

## API

| Guruh | Endpointlar |
|---|---|
| Foydalanuvchi (`/api/v1/payments/...`) | `wallet`, `wallet/transactions`, `invoices` (POST), `invoices/active`, `invoices/{id}/status`, `withdrawals`, `plans` (har plan `prices` bilan: `{"MONTH": 3000000}`, sotuvda bo'lmagan plan uchun `{}`), `plans/me`, `plans/purchase` (POST `{planCode,period,expectedPriceTiyin,idempotencyKey}` — hamyondan bitta tranzaksiyada yechib tarifni yoqadi; xuddi shu tarif muddatni uzaytiradi, yuqoriroq tarif bugundan to'liq muddatga boshlanadi, pastroq tarif tirik yuqoriroq ustiga rad etiladi; qayta urinish bir xil `idempotencyKey` bilan bir marta yechadi; xatolar `code`: `price_changed` 409 (+`currentPriceTiyin`), `downgrade_not_allowed` 409, `already_unlimited` 409, `staff_unlimited` 409, `plan_not_purchasable` 400; mablag' yetmasa 409 `Hamyonda mablag' yetarli emas — N so'm yetishmayapti`; ledger turi `PLAN_PURCHASE`, daromad `PLATFORM_REVENUE`ga; `subscription-changed` xarid bilan bir tranzaksiyada outboxga yoziladi), `commission` |
| Admin (`/api/v1/admin/...`) | `payments/cards/**` (qo'shish, faollashtirish, tartib), `payments/observations/**`, `payments/analytics/overview`, `payments/commission`, `payments/userbot`, `withdrawals/**`, `plans/assign`, `plans/prices` (GET ro'yxat; PUT `{prices:[{planCode,period,priceTiyin}]}` — faqat faol PRO/MONTH (MAX, YEAR, STANDARD va STAFF rad etiladi), `priceTiyin > 0`, hammasi yoki hech narsa), `plans/entitlements` (GET ro'yxat; PUT `{entitlements:[{planCode,key,value}]}` — faqat `mailbox.total_slots`/`mailbox.custom_slots`, `value` null = cheksiz, aks holda butun son >= 0, hammasi yoki hech narsa; plan snapshot shu tranzaksiyada outboxga yoziladi) |
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

Plan hodisalari transactional outbox orqali yetkaziladi (quyida). Boshqa payment
hodisalari uchun eski `PaymentEventPublisher` log-and-drop yo'li hali saqlanadi. Batafsil: [docs/kafka-topics.md](../../docs/kafka-topics.md).

## Ehtiyot bo'l

- Ledger'ga faqat `LedgerService.post` orqali yozing. Har harakat idempotent kalit bilan
  (masalan withdrawal ticket id) — qayta urinish ikki marta yozmaydi.
- `userbot-payment` chiqishiga pastda ikkinchi tekshiruv yo'q: kuzatuv payload'idagi maydon
  nomini o'zgartirish consumer'ni **jim** sindiradi (xabar tashlab yuboriladi).
- Platformaning zarari (kartadagi puldan ko'p majburiyat) — biznes holati, xato emas.

## Test

`mvn -B -ntp clean verify` — 91 unit, 271 integratsion (`*IT`) (E bosqich, lokal Java 21).

## Free/Pro — A bosqich

Ommaviy katalog faqat `STANDARD` (UI: **Free**) va `PRO` (**Pro**). V17 Pro MONTH
narxini bir marta **3 000 000 tiyin = 30 000 so‘m** qiladi. Keyin faqat PRO/MONTH
narxi admin orqali tahrirlanadi; xarid API kutilgan narxni tekshiradi. `MAX.active=false`;
MAX va YEAR narx qatorlari tarix uchun qoladi, lekin narx/katalog/xarid/admin API
ularni sotuvga chiqarmaydi. `plan_purchases`, ledger va mavjud obunalar o‘chirilmaydi.
STAFF yashirin va cheklovsiz qoladi. A bosqichda eski 5 random/1 custom grant saqlangan edi;
B bosqichidagi amaldagi umumiy limitlar quyida.

V18 mavjud outbox kutubxonasi jadvallari va `plan_event_version_seq` ni qo‘shadi.
Obuna tayinlash/xarid va entitlement tahriri bilan hodisa **bitta DB tranzaksiyasida**
`outbox_events`ga yoziladi. Rollback hodisani ham bekor qiladi. Broker vaqtincha
ishlamasa relay retry qiladi; restart navbatni DB’dan oladi. Yuborish at-least-once.
Har payload `version > 0`, `idempotencyKey` va `occurredAt` oladi; versiya tegishli
subscription yoki plan qulflangandan keyin ajratiladi, shu sabab eski parallel yozuv
keyingi huquqni qaytara olmaydi. Entitlement to‘liq snapshot; null faqat aniq cheksiz grant.

Startup **barcha planlar va barcha saqlangan obunalar**ni (Free/expired holatlar ham)
qayta navbatlaydi. `payment.scheduler.plan-replay-interval-ms` (default 3600000) shu
ishni har soatda bajaradi. Replay yangi monotonic versiya va yangi `occurredAt` beradi.
Trade, marketplace va recommendation consumerlari duplicate/old versiyalarni rad
etadi; 24 soatdan eski snapshot yangi pullik amal uchun ruxsat hisoblanmaydi.
Plan xaridi javobi paymentdagi qabulni tasdiqlaydi, downstream huquqlar allaqachon
qo‘llanganini tasdiqlamaydi; UI faollashish kechikishini ochiq ko‘rsatadi.

Rollout: avval versionli payloadlarni tushunadigan consumerlar, keyin payment,
so‘ng snapshotlar yetib kelishini tekshirish va xarid UI. Eski payloadlar yangi
consumerlarda paid grant bermaydi; mavjud eski consumerlar qo‘shimcha maydonlarni
ignor qiladi, ammo tartib/freshness kafolati faqat yangi consumerlarda bor.
Outbox operatsion tekshiruvlari: [kutubxona README](../libs/outbox/README.md).

Lokal Docker 29 bilan Testcontainers uchun `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`
va `DOCKER_HOST=unix:///Users/abdurahmoniy/.docker/run/docker.sock` ishlatildi;
Java 21 va `mvn -B -ntp clean verify` fazalari o‘zgarmaydi.

Parallel Pro uzaytirishda lockdan keyin managed subscription `refresh` qilinadi;
eski JPA holati ikki to‘lovni bir muddatga yozib qo‘ymaydi. Mavjud obunali parallel
renewal, STAFF/rol o‘zgarishi va eski xarid replay regressiyalari to‘liq verify’da bor.

## Free/Pro — B bosqichdagi umumiy mailbox limiti

V19 alohida `mailbox.total_slots` kalitini kiritadi: STANDARD 3, PRO 10, STAFF null
(cheksiz). PRO `mailbox.custom_slots=2`, STANDARD 0 — bu yangi custom yaratish uchun
umumiy sig‘im ichidagi sublimit. 8 random + 2 custom jami 10, qo‘shimcha 2 emas.
Eski `mailbox.slots` qiymatlari tarixiy random-only semantikasida saqlanadi; admin
GET/PUT endi faqat yangi total va custom kalitlarini boshqaradi, legacy key PUT rad etiladi.
Legacy MAX sotilmaydi; V19 uning oldingi random+custom jami grantini saqlaydi.
V19 bir marta ishlaydi, keyingi repeatable migration admin tahrirlarini qayta yozmaydi.

Startup/soatlik outbox replay yangi kalitni boshqa entitlementlar bilan bitta to‘liq
snapshotda tarqatadi. Rolloutda avval total poolni tushunadigan trade va mijozlar,
keyin V19/payment replay yoqiladi. Eski consumerlar eski random limitni ko‘radi;
yangi consumer yangi total grant yetib kelmaguncha pullik allocationni aniq 503 bilan
to‘sadi. Yangi kalitni eski random limitga almashtirib talqin qilish yo‘q. Pro narxi
30 000 so‘m/oy; C–F imkoniyatlari bu o‘zgarishga kirmaydi.


## Free/Pro — C bosqich: pochta muddati va bildirishnomalar

V20 `user_subscriptions.last_paid_expires_at` tarixini qo‘shadi. PRO/MAX uchun aniq
muddat tayinlanganda yangilanadi, STANDARD/STAFF o‘tishida saqlanadi. Mavjud finite
pullik obunalar va saqlangan xaridlardan backfill qilinadi; mavjud bo‘lmagan tarix
taxmin qilinmaydi. `GET /api/v1/payments/plans/me`, purchase va admin assign javobi
`lastPaidExpiresAt` hamda undan 30 kun keyingi `graceEndsAt`ni beradi. `expiresAt`
amaldagi obunaniki bo‘lib qoladi; tarixiy sana Free foydalanuvchiga Pro grant bermaydi.
Obuna hodisasi ham shu optional tarixiy maydonni transaction outbox orqali tarqatadi.

`PlanReminderJob` har soatda hozirgi pullik muddat uchun 3 kun oldingi `EXPIRING`,
`EXPIRED`, 30 kun tugagandagi `GRACE_ENDED` yozuvlarini `plan_notices`da yaratadi.
Job bir necha kun ishlamagan bo‘lsa ham chegaralarni tutadi. Unique
`(user_id,kind,paid_expires_at)` duplicate job/replayda xabarni ko‘paytirmaydi.
Renewal eski muddat xabarlarini ro‘yxat va yangi Telegram dispatchdan chiqaradi.

- `GET /api/v1/payments/plans/notices`: faqat o‘zining hozirgi muddatga tegishli
  yozuvlari: `{id,kind,paidExpiresAt,graceEndsAt,createdAt,readAt}`.
- `POST /api/v1/payments/plans/notices/{id}/read`: egasi uchun idempotent; begona ID 404.
- Telegram mavjud bo‘lmasa ham ilova ichidagi yozuv saqlanadi. Telegram qo‘shimcha,
  best effort kanal: DB claim tashqi chaqiruvdan oldin commit qilinadi. Faqat message ID
  kelganda `SENT`; timeout/xato `UNCONFIRMED`, chaqiruv orasidagi crash `SENDING`.
  Bu noaniq holatlar avtomatik qayta yuborilmaydi; ilova yozuvi mavjud, mutlaq
  exactly-once yoki Telegram muvaffaqiyati va’da qilinmaydi.

## D — saved-search and price-watch policy

`R__plan_entitlements.sql` owns the non-admin-editable product grants:
`watch.search_limit` is Free 1 / Pro 5, `watch.price_limit` is Free 3 / Pro 20,
and `watch.immediate` is Free `false` / Pro `true`. Historical MAX keeps 5/20
and immediate delivery; STAFF has explicit null unlimited limits and immediate
delivery. Existing mailbox quotas, prices, purchase history and visibility are
unchanged. The normal versioned entitlement outbox/recovery publishes these keys
to marketplace and recommendation; missing, malformed or stale consumer grants
must never be interpreted as unlimited. Mailbox grace does not grant Pro alerts.


New identities receive their authoritative Free snapshot through
`PlanService.initializeIdentity`: the first authenticated `GET /api/v1/payments/plans/me`
and the existing `efbazaar.auth.user-registered` / `efbazaar.auth.user-logged-in`
events share an idempotent insert and the subscription row lock used by purchases.
Only a newly inserted identity emits `subscription-changed`; duplicate or late
identity events preserve any existing paid/STAFF plan, expiry and history.
`PlanIdentityConsumer` uses group `payment-service-plan-identities`, reads bare
JSON `{userId,occurredAt,...}` without auth Java type headers, and rejects missing
identity fields through the existing Kafka error/DLT handling. Consumer projections
remain asynchronous: neither backend nor frontend invents Free grants while the
snapshot is missing. `/watches` awaits the canonical lookup; direct listing opt-in
can initialize a missing identity and then asks the user to retry explicitly.


## E — seller analytics grants

The repeatable product policy adds `analytics.history_days` (STANDARD `0`,
PRO/MAX `90`, STAFF explicit null unlimited) and `analytics.export` (STANDARD
`false`, PRO/MAX/STAFF `true`). These typed string/boolean grants travel in the
same complete versioned outbox entitlement snapshot as mailbox/watch policy.
They are not admin mailbox quotas. A boolean capability is never a numeric
unlimited budget; STAFF's boolean grants are enabled rather than null.
`PlanWatchGrantsIT.analyticsPolicyIsTypedAndIndependentOfMailboxBudgets` and the
shared-map `StaffPlanIT` regression lock down these distinctions. No price,
purchase or historical subscription is changed by analytics policy.


## Seller product grants (F)

`R__plan_entitlements.sql` also owns `seller.tools`, `seller.bulk`, and
`profile.decoration`. Each is the exact typed string `false` on STANDARD (Free),
and `true` on PRO, legacy MAX, and STAFF. They are product policy, independent of
admin-editable mailbox budgets. A null boolean never means enabled or unlimited.
The existing complete entitlement snapshots carry these keys to marketplace;
event schemas and topics are unchanged. Marketplace enforces fresh canonical
grants for writes/bulk/decoration, while saved templates/notes/cover metadata remain
retained after paid access ends. `PlanWatchGrantsIT` checks every plan and
`StaffPlanIT` checks the full key map, with explicit `true` assertions for booleans.
