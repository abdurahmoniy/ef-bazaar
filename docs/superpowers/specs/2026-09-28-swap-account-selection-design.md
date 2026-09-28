# Obmenda xaridor akkountini tanlash — dizayn

Sana: 2026-09-28 · Holat: tasdiqlangan (chatda)

## Maqsad

Obmen (`SWAP`) va obmen + doplata (`SWAP_SURCHARGE`) savdolarida xaridor —
ya'ni obmendagi ikkinchi taraf — o'z profilidagi akkountlardan birini
tanlaydi. Chatda ikkala taraf ham savdo tugagach qaysi akkount kimga
tegishli bo'lishini ko'radi. Savdo muvaffaqiyatli tugaganda tanlangan
akkount sotuvchiga to'liq ma'lumoti bilan ko'chadi.

Hozirgi holat: obmen tugaganda sotuvchiga faqat pochtasi bo'lgan bo'sh
"Obmendan kelgan akkount" kartochkasi ochiladi va chatda ikkinchi akkount
haqida hech narsa ko'rinmaydi.

### Foydalanuvchi aytgan talablar

- Faqat `SWAP` va `SWAP_SURCHARGE` uchun. `SALE` o'zgarmaydi.
- Xaridorga "akkountlaringizdan birini tanlang" bo'limi chiqadi: har bir
  akkountning rasmi, qisqa tavsifi va u qo'ygan nomi.
- "Boshqa" varianti — akkount platformaga kiritilmagan bo'lsa. Tanlansa
  hozirgi tartib ishlaydi.
- Chatda ikkala taraf ham natijada qaysi akkount o'ziga tegishli bo'lishini
  ko'radi. Dizayn ixcham bo'lishi shart: Telegram Mini App.

### Chatda qabul qilingan qarorlar

1. **Tanlash vaqti — xaridor qaysi tomonda bo'lsa.** Sotuvchi obmen taklif
   qilsa, xaridor qabul qilayotganda tanlaydi. Xaridorning o'zi obmen
   taklif qilsa, taklif yuborayotganda tanlaydi. Qabul qilingan savdoda
   akkount (yoki "Boshqa") har doim ma'lum bo'ladi.
2. **Band akkount.** Bozorda e'lon sifatida turgan akkountni tanlash
   mumkin — obmen muvaffaqiyatli tugasa, e'lon `SOLD` bo'lib yopiladi va
   kanal postlari belgilanadi. Boshqa tirik savdoda ishtirok etayotgan
   akkountni tanlab bo'lmaydi.
3. **Chat dizayni — pinned bar va taklif kartasi.** Pinned bar'ga bitta
   ixcham qator: har kim o'zi OLADIGAN akkountni ko'radi. Taklif kartasida
   ikkala akkount `⇄` bilan yonma-yon.

### Tashqarida

- Sotuvchi tomonidan e'londagi akkountdan boshqasini tanlash.
- Bitta obmenda bir nechta akkount berish.
- Kelishilgan akkountni savdo ochilgandan keyin almashtirish (kerak
  bo'lsa, savdo yopilib yangi taklif ochiladi).

## 1. trade-service

### API

`ProposalCreateRequest` va accept so'roviga ixtiyoriy `giveAccountId`
(UUID) qo'shiladi — xaridor BERADIGAN akkount.

| Holat | Kim yuboradi | Qachon |
|---|---|---|
| Xaridor obmen taklif qiladi | xaridor | `create` |
| Sotuvchi obmen taklif qiladi | xaridor | `accept` |

Qoidalar:

- `kind == SALE` bo'lsa `giveAccountId` berilishi `400`.
- Sotuvchi `giveAccountId` yubora olmaydi (`create` da ham, `accept` da
  ham) — `400`.
- `null` = "Boshqa". Hozirgi tartib, snapshot yo'q.
- Xaridor taklif qilgan obmenni qabul qilishda sotuvchi akkountni
  o'zgartira olmaydi — taklifdagi tanlov saqlanadi.

### Tekshiruv

Yangi `AccountSummaryClient` (`ListingTermsClient` naqshida) marketplace'ning
ichki endpoint'ini chaqiradi. Tekshiriladi:

1. Akkount mavjud, egasi — xaridor, holati `ACTIVE`. Aks holda `400`
   ("Bu akkount sizga tegishli emas yoki faol emas").
2. Akkount boshqa tirik (yakunlanmagan) savdoda `give_account_id` sifatida
   yo'q. Aks holda `409` ("Bu akkount boshqa savdoda").
3. Akkountning `currentListingId` si bo'lsa, o'sha e'lon bo'yicha tirik
   savdo yo'q. Aks holda `409`.
4. Akkount obmendagi e'lonning o'z akkounti emas (o'zi bilan almashish).

Tekshiruv `create` da (xaridor taklif qilganda) VA `accept` da (ikkala
holatda ham) bajariladi: taklif TTL davomida akkount boshqa savdoga
kirib qolishi mumkin.

Marketplace javob bermasa — `503`, savdo ochilmaydi (fail-closed: noto'g'ri
akkount ko'chishi savdoni kechiktirishdan yomonroq).

### Snapshot va saqlash

Sotuvchi xaridorning shaxsiy akkountlarini o'qiy olmaydi, shuning uchun
akkountning qisqa nusxasi saqlanadi va `TradeResponse` / taklif javobida
beriladi:

```
giveAccount: {
  id, title, coverMessageId, summary (tavsifning ~80 belgisi), teamStrength
}
```

- Taklifda: Redis hash maydonlari (`giveAccountId`, `giveAccountSnapshot`
  JSON).
- Savdoda: yangi migratsiya `V28__trade_give_account.sql` (raqam
  implementatsiya paytida `sort -V` va `origin/main` bo'yicha qayta
  tekshiriladi):
  - `give_account_id uuid NULL`
  - `give_account_snapshot jsonb NULL`
  - qisman indeks: tirik savdolar bo'yicha `give_account_id` (band
    tekshiruvi uchun).

Snapshot savdo davomida o'zgarmaydi — xaridor akkountini tahrirlasa ham
kelishilgan narsa ko'rinib turadi.

### Hodisa

`TradeEvents.TradeSucceeded` ga `giveAccountId` (nullable) qo'shiladi.
Eski consumer'lar uchun zararsiz (qo'shimcha maydon).

## 2. marketplace-service

### Ichki endpoint

`GET /internal/marketplace/v1/accounts/{id}` — `X-Internal-Secret` bilan
(mavjud internal naqsh). Javob:

```
{ id, ownerId, status, title, coverMessageId, summary, teamStrength, currentListingId }
```

### Frontend uchun

Mavjud `GET /api/v1/accounts` (egasining ro'yxati) tanlash bo'limi uchun
yetadi. "Savdoda" belgisi uchun javobga `busy` bayrog'i kerak bo'lsa,
frontend uni trade-service'dan oladi (quyida) — marketplace trade
holatini bilmaydi.

### Ko'chish

`TradeSucceededDto` ga `giveAccountId`. `ListingAccountLink.onTradeSucceeded`:

- `giveAccountId` bor va swap:
  - xaridorning akkounti `ARCHIVED`, `archivedReason = SWAPPED_ON_PLATFORM`
    (yangi enum qiymati; ustun `VARCHAR(24)`, CHECK yo'q — migratsiya
    kerak emas), pochta maydonlari tozalanadi;
  - sotuvchiga to'liq nusxa: `title`, `description`, `attributes`
    (`LISTING_ONLY_ATTRIBUTES` siz), `mediaMessageIds`, karta inventari,
    `sourceTradeId`;
  - pochta — mavjud `pendingEmails` oqimi (sotuvchi uchun);
  - akkountning `currentListingId` si bo'lsa: e'lon `SOLD`, `soldAt`,
    `soldPosts.onSold(...)`, `listing-deleted` hodisasi — `markSold`
    bilan bir xil yon ta'sirlar, lekin egasi tekshiruvisiz.
  - Bu holatda bo'sh kartochka (`openAccountForSwapRecipient`) OCHILMAYDI.
- `giveAccountId` yo'q — hozirgi xatti-harakat o'zgarmaydi.
- Idempotentlik: `findByOwnerIdAndSourceTradeId(sellerId, tradeId)`.

## 3. Frontend (sayt + Telegram Mini App)

### Akkount tanlash bo'limi

Obmen turi tanlanganda chiqadi — xaridorning taklif oynasida va sotuvchi
ochgan obmenni qabul qilish oynasida.

- Ro'yxat: 40px rasm, nom, tavsifning 1 qatori (truncate), radio.
- Oxirida "Boshqa (platformada yo'q)".
- Tirik savdodagi akkount kulrang, "Savdoda" belgisi, tanlab bo'lmaydi.
  Ma'lumot trade-service'ning yangi `GET /api/v1/trades/busy-accounts`
  (joriy foydalanuvchining band akkount id'lari) endpoint'idan.
- Ro'yxat `max-height` bilan ichki scroll — Mini App'da oyna
  cho'zilmaydi.
- Akkounti bo'lmagan foydalanuvchida faqat "Boshqa" tanlangan holda
  turadi va "Profilga akkount qo'shish" havolasi.
- Tanlov majburiy: "Boshqa" ham aniq tanlov. Default — hech narsa
  tanlanmagan, yuborish tugmasi o'chiq.

### Taklif kartasi

`[rasm] e'lon akk. ⇄ [rasm] xaridor akk.` — ikki ustun, har birining
ostida TS. "Boshqa" bo'lsa o'ng ustunda "Platformadan tashqari akkount".
Sotuvchi ochgan va hali qabul qilinmagan obmenda o'ng ustun: "Xaridor
tanlaydi".

### Pinned bar

Tirik obmen savdosida bitta qo'shimcha qator: "Siz olasiz: [24px rasm]
Nom ›". Har kim o'zi OLADIGAN akkountni ko'radi (xaridor — e'lon
akkountini, sotuvchi — xaridor akkountini). Bosilsa drawer.

### Drawer

"Siz berasiz" / "Siz olasiz" — ikkala akkount rasm, nom, qisqa tavsif va
TS bilan.

## Xatolar

| Holat | Javob | UI |
|---|---|---|
| Begona / arxivlangan akkount | 400 | Toast, ro'yxat yangilanadi |
| Akkount boshqa savdoda | 409 | Toast, ro'yxat yangilanadi |
| Marketplace javob bermadi | 503 | "Qayta urinib ko'ring" |
| SALE da `giveAccountId` | 400 | UI yubormaydi |
| Ko'chishda akkount yo'qolgan | log warn, sotuvchiga bo'sh kartochka | — |

## Testlar

- **trade-service:** create/accept validatsiyasi (begona, band, o'zi bilan,
  SALE, sotuvchi yuborishi), snapshot taklifdan savdoga o'tishi,
  `TradeSucceeded` da `giveAccountId`, marketplace uzilishi → 503.
  Migratsiya IT orqali.
- **marketplace-service:** ichki endpoint (secret, maydonlar), ko'chish
  (to'liq nusxa, arxiv, e'lon SOLD + kanal belgisi), "Boshqa" oqimi
  o'zgarmagani, qayta yetkazilishda idempotentlik.
- **frontend:** tanlash bo'limi (band, "Boshqa", akkountsiz holat, yuborish
  bloki), taklif kartasi uchta holati, pinned bar viewer'ga nisbatan.
- Tekshiruv: har bir o'zgargan komponent uchun AGENTS.md dagi to'liq
  buyruqlar.
