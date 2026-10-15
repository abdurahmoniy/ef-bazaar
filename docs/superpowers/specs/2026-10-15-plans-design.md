# Plans (tariflar) — dizayn

Sana: 2026-10-15 · Holat: tasdiqlangan dizayn, spec ko'rib chiqilishi kutilmoqda

## 1. Maqsad

Foydalanuvchi pochta qutisi slotlari to'lganda "tarifingizni oshiring" degan aniq yo'lni ko'radi
va saytdagi `/plans` sahifasidan oylik yoki yillik tarifni **hamyon balansidan** sotib oladi.
Hozircha tarif faqat pochta qutisi slotlarini belgilaydi; keyin boshqa imkoniyatlar ham
shu tizimga (`plan_entitlements` kalitlari) qo'shiladi.

**Til qoidasi:** URL, API path, JSON maydonlari, error kodlari, kod va kalitlar — inglizcha.
Faqat UI matni o'zbekcha.

## 2. Tariflar

| Backend kodi | UI nomi | `mailbox.slots` | `mailbox.custom_slots` | Oylik | Yillik |
|---|---|---|---|---|---|
| `STANDARD` | Jaydari | 3 | 0 | bepul | bepul |
| `PRO` | Boyvachcha | 5 | 1 | 10 000 so'm | 100 000 so'm |
| `MAX` | Aristokrat | 10 | 3 | 30 000 so'm | 250 000 so'm |

- `mailbox.slots` — savdoda avtomatik (tasodifiy manzil bilan) beriladigan qutilar soni.
  Hozirgi qiymatlar (3 / 10 / cheksiz) 3 / 5 / 10 ga o'zgaradi.
- `mailbox.custom_slots` — yangi kalit. **Bu bosqichda faqat saqlanadi va UI'da ko'rsatiladi**;
  custom quti yaratish funksiyasi keyingi bosqichda quriladi va shu kalitni o'qiydi.
- Narxlar **va slot sonlari** admin panelda erkin tahrirlanadi (slot uchun "cheksiz" ham);
  yuqoridagilar boshlang'ich qiymatlar.
- UI nomlari faqat frontendda (`V9` izohidagi qoida saqlanadi: matn — frontend ishi).

## 3. Ma'lumotlar modeli (payment-service)

### 3.1 Limitlar — admin boshqaradi, R__ dan chiqariladi
Slot sonlari endi admin panelda tahrirlanadi, shuning uchun `R__plan_entitlements.sql` ularni
**yozmasligi** kerak (R__ har content o'zgarishida qayta ishlab, admin qiymatini ustidan yozardi).

- `R__plan_entitlements.sql` dan `mailbox.slots` qatorlari olib tashlanadi; fayl izoh bilan
  qoladi va kelajakda admin boshqarmaydigan kalitlar uchun ishlatiladi. (R__ dan qator olib
  tashlash bazadagi qatorni o'chirmaydi — fayl izohida aytilgan; aynan shu kerak.)
- V15 (bir martalik): `mailbox.slots` → 3 / 5 / 10 ga `UPDATE`, `mailbox.custom_slots` → 0 / 1 / 3
  `INSERT ... ON CONFLICT DO NOTHING`. Bu "mahsulot qarorining" bir martalik o'tkazilishi;
  keyingi o'zgarishlar faqat admin panel orqali.
- `plan_entitlements` ga `updated_by UUID` ustuni (V15) — kim o'zgartirgani.

### 3.2 `plan_prices` — `V15__plan_prices_and_purchases.sql` (yangi)
```sql
plan_prices (
  plan_code    VARCHAR(32) REFERENCES plans(code),
  period       VARCHAR(8)  CHECK (period IN ('MONTH','YEAR')),
  price_tiyin  BIGINT      NOT NULL CHECK (price_tiyin > 0),
  updated_by   UUID,                     -- NULL = migratsiya seed'i
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, period)
)
```
- Seed (PRO/MAX × MONTH/YEAR) **shu V-migratsiyada `ON CONFLICT DO NOTHING`** bilan.
  R__ fayliga qo'yilmaydi: u har content o'zgarishida qayta ishlab, admin o'zgartirgan narxni
  ustidan yozib yuborardi.
- `STANDARD` uchun qator yo'q = sotib olinmaydi (bepul, default).

### 3.3 `plan_purchases` — o'sha V15
```sql
plan_purchases (
  id               UUID PRIMARY KEY,
  user_id          UUID        NOT NULL,
  plan_code        VARCHAR(32) NOT NULL REFERENCES plans(code),
  period           VARCHAR(8)  NOT NULL,
  price_tiyin      BIGINT      NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  ledger_tx_id     UUID        NOT NULL,
  idempotency_key  VARCHAR(128) NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
)
```
Audit va "xaridlar tarixi" uchun. `user_subscriptions` joriy holatni saqlashda davom etadi
(`source = 'PURCHASE'`).

### 3.4 Ledger
Yangi `TransactionKind.PLAN_PURCHASE`. Posting: `USER_AVAILABLE(user) +price`,
`PLATFORM_REVENUE −price` (mavjud `PARTNER_MONTHLY` ning teskarisi). Balans manfiyga tushishini
`chk_wallet_non_negative` ushlaydi, lekin servis undan oldin balansni tekshirib toza 409 qaytaradi.

## 4. API

### Foydalanuvchi
- `GET /api/v1/payments/plans` — katalog (mavjud) + har plan uchun `prices: {MONTH, YEAR}` (tiyin)
  va entitlements. Ochiq (auth ixtiyoriy) qoladi.
- `GET /api/v1/payments/plans/me` — mavjud; o'zgarishsiz.
- `POST /api/v1/payments/plans/purchase` — **yangi**
  ```json
  { "planCode": "PRO", "period": "YEAR", "expectedPriceTiyin": 10000000, "idempotencyKey": "uuid" }
  ```
  Javob: `MyPlanResponse` (yangi `planCode`, `expiresAt`, entitlements).
  Xatolar (409, `PaymentExceptionHandler` orqali):
  - `price_changed` — server narxi `expectedPriceTiyin` ga teng emas; javobda joriy narx.
  - `insufficient_balance` — javobda `shortfallTiyin`.
  - `downgrade_not_allowed` — faol yuqoriroq tarif ustiga pastrog'i.
  - `plan_not_purchasable` — STANDARD yoki noma'lum/faol bo'lmagan plan (400).

### Admin
- `GET /api/v1/admin/plans/prices` — 4 ta narx, kim/qachon o'zgartirgani bilan.
- `PUT /api/v1/admin/plans/prices` — `{ "prices": [{ "planCode", "period", "priceTiyin" }] }`;
  `updated_by` = `X-User-Id`. `TradeCommissionService.updateConfig` namunasi.
- `GET /api/v1/admin/plans/entitlements` — har plan uchun `mailbox.slots`, `mailbox.custom_slots`
  (`null` = cheksiz), kim/qachon o'zgartirgani.
- `PUT /api/v1/admin/plans/entitlements` —
  `{ "entitlements": [{ "planCode", "key", "value" }] }`; `value: null` = cheksiz, aks holda
  `>= 0` butun son. Faqat ruxsat etilgan kalitlar (`mailbox.slots`, `mailbox.custom_slots`) —
  noma'lum kalit 400. Saqlangach o'zgargan har plan uchun `plan-entitlements` snapshot darhol
  chiqariladi (hozir faqat startup'da chiqadi).
- `POST /api/v1/admin/plans/assign` — mavjud; o'zgarishsiz.

## 5. Sotib olish qoidalari

`PlanPurchaseService.purchase` — bitta DB tranzaksiya:

1. `idempotencyKey` bo'yicha mavjud xarid bo'lsa — o'sha natija qaytadi (qayta yechilmaydi).
2. Narx serverdan; `expectedPriceTiyin` bilan solishtirish.
3. Muddat:
   - Joriy jonli obuna yo'q (yoki STANDARD) → `starts_at = now`, `expires_at = now + period`.
   - **Bir xil plan** jonli → `starts_at = joriy expires_at`, `expires_at = joriy expires_at + period`
     (uzaytirish). Muddatsiz (admin bergan, `expires_at = NULL`) bir xil plan → 409
     `already_unlimited`.
   - **Yuqoriroq plan** (`sort_order` katta) → to'liq narx, `starts_at = now`,
     `expires_at = now + period`; eski qoldiq kuyadi (mahsulot qarori). Frontend buni oldindan
     ogohlantiradi.
   - **Pastroq plan** jonli yuqori plan ustiga → `downgrade_not_allowed`.
   - `period`: MONTH = +1 kalendar oy, YEAR = +1 kalendar yil (`Asia/Tashkent` emas, UTC
     `Instant` + `ZonedDateTime` UTC; oy oxiri Java `plusMonths` qoidasi bilan).
4. Ledger `post(PLAN_PURCHASE, "plan-purchase:" + idempotencyKey, ...)`.
5. `plan_purchases` qatori, `PlanService.assign(user, plan, expires, "PURCHASE")` →
   mavjud `subscription-changed` eventi.

Bitta foydalanuvchining parallel xaridlari: `user_subscriptions` qatorini
`SELECT ... FOR UPDATE` bilan qulflash (qator bo'lmasa avval `INSERT ... ON CONFLICT DO NOTHING`).

## 6. Muddat tugashi va eslatmalar

- Limitni tekshiruvchilar (`PlanService.planFor`, trade `EntitlementService.planFor`) allaqachon
  `expires_at` ga qaraydi — tugagan obuna o'z-o'zidan STANDARD bo'lib o'qiladi. Sweeper kerak emas.
- Pastga tushganda yoki muddat tugaganda limitdan ortiq qutilar **o'chirilmaydi — qulflanadi**
  (6a bo'limi).
- `PlanReminderJob` (`@Scheduled`, soatlik; payment-service bitta instans — `InvoiceExpirySweeper`
  bilan bir xil, ShedLock yo'q): keyingi 3 kun ichida tugaydiganlar va oxirgi 24 soatda tugaganlar uchun mavjud `BotClient` orqali Telegram
  xabari. Takror yubormaslik uchun `plan_purchases` ga `reminded_before_at`, `reminded_expired_at`
  ustunlari (V15 da). Telegram'i yo'q userlar xabar olmaydi — holatni saytda ko'radi.
  Xabar: *"Boyvachcha tarifingiz 3 kundan keyin tugaydi. Uzaytirish: efbazaar.uz/plans"*.

## 6a. Qulflangan pochta qutilari (trade-service)

Quti mavjud bo'lib qoladi, lekin user uning ichiga kira olmaydi (xatlarni o'qiy olmaydi).

**Qoida.** Userga biriktirilgan (detach qilinmagan) tasodifiy qutilar `access_priority` bo'yicha
kamayish tartibida saralanadi. N = plan `mailbox.slots` (`null` = cheksiz → hammasi ochiq).
- **Faol savdoga biriktirilgan quti har doim ochiq** va N ning bir qismi sifatida sanaladi
  (pasaytirishdan keyin vaqtincha N dan oshib ketishi mumkin).
- Qolgan o'rinlar ustuvorligi eng yuqori qutilarga; qolganlari `locked`.
- Lock **saqlanmaydi**, har o'qishda hisoblanadi (`MailboxAccessService`): plan o'zgarishi,
  muddat tugashi, upgrade, detach — hammasi avtomatik aks etadi, job kerak emas.

**`access_priority`** — `mailboxes` ga yangi `BIGINT` ustun (trade-service yangi V-migratsiya;
backfill = `created_at` epoch millis). Yangi quti = yaratilgan vaqti → default "eng yangilari ochiq".

**User tanlashi** — `POST /api/v1/mailboxes/{lockedId}/unlock { "lockInsteadId": "..." }`:
ikki qutining `access_priority` sini almashtiradi (bitta tranzaksiya, ikkala qator `FOR UPDATE`).
`lockedId` qulflangan, `lockInsteadId` ochiq va faol savdoda **emas** bo'lishi shart, ikkalasi
ham caller'niki — aks holda 409 `invalid_unlock_swap`.

**Detach** — mavjud oqim; top-N qayta hisoblanganda keyingi qulflangan quti avtomatik ochiladi
(mahsulot qarori). Yangi savdo uchun slot qoidasi o'zgarmaydi: biriktirilgan qutilar soni
(qulflanganlar bilan) `< N` bo'lishi kerak.

**Majburiy tekshiruv backend'da.** Blur — faqat UI. Mail API (`mail/` webmail va profil
o'qiydigan endpointlar: xatlar ro'yxati, xat mazmuni, biriktirma) qulflangan quti uchun
**403 `mailbox_locked`** qaytaradi va mazmunni umuman yubormaydi. Admin endpointlari va
smart-admin-worker'ning IMAP o'qishi lockdan mustasno (nizo tekshiruvi va savdo jarayoni).

**API javoblari:** `GET /api/v1/mailboxes` va `/slots` har quti uchun `locked: boolean`,
`lockReason: "PLAN_LIMIT" | null`; `/slots` ga `lockedCount`.

**Custom qutilar** bu bosqichda yo'q — lock faqat tasodifiy qutilarga.

## 7. Kafka

`efbazaar.payment.plan-entitlements` payload'iga yangi kalit (`mailbox.custom_slots`) qo'shiladi —
format o'zgarmaydi (kalit-qiymat map). trade-service projection'i noma'lum kalitni saqlab qo'yadi;
hozircha uni o'qimaydi. `docs/kafka-topics.md` da kalitlar ro'yxati yangilanadi.

## 8. Frontend (faqat sayt)

Android ilovada tarif sotib olinmaydi (Play Billing qarori) — bu spec faqat `frontend/`.

- **`/plans` sahifasi** (`frontend/src/app/plans/`): uch karta — Jaydari, Boyvachcha, Aristokrat;
  "Oylik / Yillik" almashtirgich; yillikda tejash belgisi narxlardan hisoblanadi
  (boshlang'ich narxlarda Boyvachcha −17%, Aristokrat −31%). Har kartada: tasodifiy va custom
  quti soni, narx, tugma. Joriy tarif belgilanadi va tugash sanasi ko'rsatiladi.
  - Tugmalar: "Tanlash" / "Uzaytirish" (bir xil) / "Oshirish" (yuqori — tasdiqlash oynasida
    *"Joriy tarifning qolgan N kuni kuyadi"*) / pastroq — o'chirilgan, *"Joriy tarif tugagach"*.
  - `insufficient_balance` → mavjud `wallet-shortfall` oqimi (hamyonni to'ldirish).
  - `price_changed` → yangi narxni ko'rsatib qayta tasdiqlash.
  - Chiqib ketgan (anonim) foydalanuvchi katalogni ko'radi; tugma login'ga olib boradi.
- **"Tarifni oshiring" xabari:** `mailbox-slots-warning.tsx` va savdo ochishda
  `mailbox_slots_exhausted` xatosi chiqqan joylar — *"Pochta qutilari joyi tugadi. Ko'proq joy
  uchun tarifingizni oshiring"* + **[Tarifni oshirish]** → `/plans`. Aristokrat'dagi userga
  tugma ko'rsatilmaydi (faqat qutini uzish yo'li).
- **Profil:** joriy tarif nomi va tugash sanasi, `/plans` havolasi.
- **Qulflangan quti UI** (profil qutilar ro'yxati va `mail/` webmail):
  - Quti kartasi blur qilingan fonda, ustida **"Qulflangan"** belgisi (qulf ikonkasi).
  - Quti ochilganda xatlar ro'yxati tomoni ham blur, markazda *"Bu quti tarifingiz limitidan
    tashqarida. Xatlarni ko'rish uchun tarifingizni oshiring"* + **[Tarifni oshirish]** →
    `efbazaar.uz/plans`, va ikkinchi darajali **[Boshqa qutini qulflab, shuni ochish]**
    (6a: swap — qaysi ochiq qutini qulflashni tanlash oynasi).
  - Blur ostidagi "xatlar" — **soxta skeleton qatorlar**, haqiqiy mazmun emas (backend 403
    qaytaradi, mazmun brauzerga kelmaydi).
  - **Tasdiqlangan dizayn (2026-10-15):** https://claude.ai/artifact/GEAGjfrsZBkJU8UMebdEHq
  - **Vizual dizayn Claude Design'da** (Design artifact) implementatsiyadan oldin tayyorlanadi va
    tasdiqlanadi: qulflangan quti kartasi, blur'li xatlar paneli + upgrade CTA, swap oynasi,
    `/plans` kartalari. Implementatsiya o'sha dizaynga mos keladi. Sifat talabi yuqori — bu
    upgrade'ga undovchi asosiy ekran.
- **Admin:** `frontend/src/app/admin/plans/` — **"Tariflar"** bo'limi, ikkita sub-bo'lim:
  - **Narxlar** (`/admin/plans/prices`): 4 narx maydoni (so'mda kiritiladi, tiyinda yuboriladi),
    oxirgi o'zgartirgan admin/vaqt, va mavjud "foydalanuvchiga tarif berish" formasi.
  - **Mailboxlar** (`/admin/plans/mailboxes`): har plan uchun tasodifiy va custom slot soni;
    har maydon yonida **"Cheksiz"** belgisi (yoqilsa son maydoni o'chadi, `null` yuboriladi).
    Saqlashdan oldin ogohlantirish: *"Kamaytirsangiz, limitdan ortiq qutilar qulflanadi"*.
  - Admin navigatsiyasiga qo'shiladi.

## 9. Ta'sir va migratsiya xavfi

- PRO'da hozir 6–10 qutisi bor userlarda limit 5 ga tushgach ortiqchalari (eng eskilari)
  **qulflanadi**; MAX'da 10 dan ortiq bo'lsa ham shunday. STANDARD userlarda 3 tadan ortiq quti
  bo'lsa ham — bugungacha bu faqat yangi savdoni to'xtatardi, endi eskilari qulflanadi.
  Deploydan oldin prod'da har plan bo'yicha "limitdan ortiq qutisi bor userlar" soni
  tekshiriladi va natija bo'yicha qaror qilinadi (masalan, ularga bir martalik xabar).
- V15 raqami: `sort -V` va `origin/main` bilan tekshiriladi (duplicate versiya xavfi).

## 10. Test

TDD. payment-service:
- Unit: muddat hisoblash (yangi / uzaytirish / upgrade / downgrade rad / muddatsiz), narx moslik.
- IT (Testcontainers, `mvn verify`): xarid ledger'ni to'g'ri yozadi; balans yetmasa hech narsa
  yozilmaydi; bir xil `idempotencyKey` ikki marta — bitta yechish; parallel ikki xarid —
  bitta qulf orqali ketma-ket; admin narx o'zgartirgach eski `expectedPriceTiyin` → 409;
  `subscription-changed` chiqadi; R__ qayta ishlaganda admin narxi saqlanadi.
- Reminder job: oyna chegaralari va takror yubormaslik.
- Admin entitlements: `null` = cheksiz saqlanadi; manfiy son va noma'lum kalit 400; saqlangach
  snapshot chiqadi; R__ qayta ishlaganda admin qiymati saqlanadi.

trade-service:
- Unit `MailboxAccessService`: top-N tanlash, faol savdo qutisi doim ochiq (N dan oshsa ham),
  cheksiz plan, tugagan obuna → STANDARD limiti, detach'dan keyin keyingi quti ochiladi.
- IT: qulflangan quti uchun mail API 403 `mailbox_locked` va mazmun yo'q; admin endpointi
  lockdan mustasno; swap — to'g'ri juftlik almashadi, noto'g'ri juftlik (ikkalasi ochiq, faol
  savdodagi, boshqa userniki) 409; parallel swap'lar bir-birini buzmaydi.

frontend (vitest): tejash foizi hisobi, tugma holati (tanlash/uzaytirish/oshirish/o'chirilgan),
xato kodlari → UI xabar, so'm ↔ tiyin, "Cheksiz" belgisi ↔ `null`, `locked` quti → blur holati
va CTA. `mail/` (vitest): `mailbox_locked` javobida mazmun o'rniga qulf ekrani.

## 11. Doiradan tashqari

- Custom quti yaratish (faqat `custom_slots` soni saqlanadi).
- Avto-uzaytirish, proration, refund.
- Android ilovada tarif xaridi.
- Tarifga boshqa imkoniyatlar (keyin `plan_entitlements` kalitlari bilan).
