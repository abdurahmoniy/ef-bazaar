# frontend

efbazaar.uz asosiy sayti va Telegram Mini App — bitta Next.js ilova.

| | |
|---|---|
| Stack | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 3.4 + shadcn/ui, Vitest |
| Port | 3000, nginx `/` ni shu yerga yo'naltiradi |
| Node | 22; bog'liqliklar `package-lock.json` dan (`npm ci`) |

## Tuzilma

| Papka | Nima |
|---|---|
| `src/app/` | Sahifalar (App Router). Asosiylari: `/marketplace`, `/marketplace/[id]`, `/marketplace/new`, `/chats`, `/profile`, `/profile/accounts/*`, `/dream-team`, `/favorites`, `/hamyon` (hamyon, savdolar), `/plans` (tariflar — tanlash, uzaytirish, oshirish), `/mailboxes/custom` (custom pochta nomini tekshirish va olish, olingan qutilar), `/mailboxes/custom/[id]/link` (Konami akkountni qutiga ulash bosqichlari), `/partner`, `/partnership`, `/trade-admin(s)`, `/tournaments`, `/support`, `/admin/**` (shu jumladan `/admin/plans/prices` — tarif narxlari, `/admin/plans/mailboxes` — tarif pochta qutilari/slotlari) |
| `src/app/api/` | Route handler'lar: `session`, `telegram-webapp`, `push`, `video`, `healthz` va servis proxy'lari (`marketplace`, `trade`, `payment`, `access`, `userbot`, `tournaments`) |
| `src/components/<domen>/` | UI komponentlar domen bo'yicha (`marketplace`, `chat`, `payment`, `admin`, `partners`, `trade-admin`, ...); `ui/` — shadcn primitivlari |
| `src/lib/` | API klientlar, tiplar, formatlash. Nomlash: `*-server.ts` — faqat serverda (SSR, Server Actions), `*-client.ts` — brauzerda, `*-types.ts` — tiplar |
| `src/hooks/` | React hooklar (chat socket, draft, outbox, Telegram tugmalari, virtual klaviatura) |
| `src/store/` | Redux Toolkit — faqat turnir API (RTK Query, Chempionat-X). Qolgan holat komponentlar va hooklarda |
| `src/proxy.ts` | Next middleware: access token'ni yangilash (refresh), himoyalangan sahifadan login'ga yo'naltirish, referal kodni (`?ref=`, `?p=`) cookie'ga yozish |

Testlar kod yonida: `foo.ts` ↔ `foo.test.ts`.

### Fon musiqasi

- Admin `/admin/music` da YouTube havolasi, nomi, ijrochi, ro‘yxat tartibi va faol holatini boshqaradi. CRUD `/api/marketplace/v1/admin/music` orqali; server faqat `ROLE_ADMIN` ga ruxsat beradi. Musiqa yuklab olinmaydi, backend faqat YouTube video ID va metama’lumotlarni saqlaydi.
- Root layoutdagi `BackgroundMusic` ommaviy `GET /api/marketplace/v1/music` ro‘yxatini oladi. Faol treklar tasodifiy navbatda, har aylanishda bir martadan, ketma-ket takrorlanmasdan yangraydi (bitta trek bo‘lsa takrorlanadi). Pleyer, pauza va ovoz tugmalari ko‘rsatilmaydi; ovoz 20%.
- Oddiy client navigation trekni qaytadan boshlamaydi. Yashirin tab, `/admin`, `/auth`, `/chats`, `/support` va sahifadagi boshqa ovozli video/audio ijrosida musiqa to‘xtaydi; qaytganda davom etadi. Ro‘yxat ko‘rinadigan tabda har 60 soniyada va fokus qaytganda yangilanadi.
- Brauzer autoplay’ni bloklasa, pointer/klaviatura hodisasida qayta ijro urinishi bo‘ladi. Embed taqiqlangan/o‘chirilgan videolar tashlab ketiladi; barcha treklar xato bersa cheksiz qayta urinish bo‘lmaydi. Bo‘sh ro‘yxat yoki YouTube bloklanishi sayt ishini to‘xtatmaydi.
- YouTube IFrame API ishlatiladi; CSP faqat `www.youtube.com` (script/frame) va `s.ytimg.com` (script) manbalarini qo‘shadi. Ko‘rinmaydigan YouTube ijrosi [YouTube developer talablariga](https://developers.google.com/youtube/terms/developer-policies) mos integratsiya emas va provayder/brauzer tomonidan bloklanishi mumkin. Ushbu ko‘rinish foydalanuvchining aniq talabi; barqaror, provayder talablariga mos faqat-audio ijro uchun litsenziyalangan audio fayllar kerak.
- Boshlang‘ich ro‘yxat bo‘sh. Admin birinchi havolani qo‘shmaguncha musiqa yangramaydi; API kaliti yoki yangi env kerak emas. Marketplace V85 migratsiyasi ushbu frontenddan oldin yoki u bilan birga chiqarilishi kerak.

## Backend'ga qanday murojaat qilinadi

- **Server (SSR, Server Actions):** `INTERNAL_API_BASE_URL` = `http://nginx:8080/api` —
  ichki nginx bloki (80-portdagi HTTPS redirect'dan qochish uchun). `src/lib/api.ts` → `apiFetch`.
- **Brauzer:** nisbiy `/api/<servis>/v1/...` yo'llari (same-origin). Prodda nginx ularni
  to'g'ridan-to'g'ri servisga yo'naltiradi; `access_token` httpOnly cookie o'zi boradi, CORS kerak emas.
- Sessiya: access cookie 15 daqiqa, refresh 30 kun. Access tugagan bo'lsa `proxy.ts` refresh
  qiladi va **ketayotgan so'rovning Cookie headerini ham** yangilaydi (aks holda birinchi so'rov 401 oladi).

### A’zolik UI

- `/plans` efBazaar ko‘k/sariq mavzusida Free/Pro taklifi, katalogdagi huquqlar taqqoslashi va FAQ beradi. Narx va limitlar API’dan; eski artwork va demo ma’lumot ishlatilmaydi.
- Yangi xarid va uzaytirish har doim alohida to‘lov xulosasi va tasdiqlashdan o‘tadi. `/plans?intent=pro#pro` faqat taklifga olib boradi, o‘zi pul yechmaydi; anonim xaridor shu manzilga login orqali qaytadi.
- Profil tepasidagi a’zolik bloki payment holati/expiry bilan ishlaydi. Noto‘g‘ri yoki noma’lum holatda xarid bloklanadi; expiry/Grace chegaralari va tabga qaytishda holat yangilanadi. Muddatsiz/STAFF va sotuvdan olingan MAX uchun uzaytirish va’dasi berilmaydi.
- Public appearance va profil muqovasining capability/validUntil tekshiruvi alohida qoladi. To‘langan a’zolik feature tayyorligi yoki verification belgisi emas.

### Free/Pro katalogi va umumiy pochta sig‘imi (A–C bosqichlar)

- `/plans` faqat `STANDARD` → **Free** va `PRO` → **Pro** kartalarini ko‘rsatadi.
  Narxlar `GET /api/payment/v1/payments/plans` katalogidan olinadi; faqat `PRO` / `MONTH`
  xarid qilinadi. Boshlang‘ich oylik narx 3 000 000 tiyin (30 000 so‘m).
- `MAX` tarixiy obunalarda saqlanadi, lekin karta, upgrade taklifi va admin narx/berish
  formasida sotuvga chiqmaydi. `YEAR` admin tahriri ham yopiq. `STAFF` ommaviy karta
  emas; uning cheksiz huquqi va xarid bloklanishi saqlanadi.
- Kartalar va admin tahriri `mailbox.total_slots` / `mailbox.custom_slots` bilan ishlaydi:
  Free jami 3, Pro jami 10, shundan 2 tagacha yangi custom quti. `mailbox.slots` tarixiy
  random limiti umumiy limit sifatida ishlatilmaydi. Custom quti alohida qo‘shimcha sig‘im emas.
- Profil faqat `GET /api/trade/v1/mailboxes/slots` javobidagi `totalUsed / totalLimit`
  xulosasi va sozlangan webmail manziliga «Pochtani ochish» havolasini ko‘rsatadi.
  Akkountlar, savdolar, sevimlilar va kartalar tablarida umumiy pochta panellari yo‘q.
  Yuklanish va xato haqiqiy 0 yoki cheksiz limitdan ajratiladi; xatoda qayta urinish bor.
  Custom yaratish sahifasi `totalUsed`, `totalLimit`, `customUsed`, `customLimit`ni ko‘rsatadi. `exemptUsed` —
  umumiy limitga kirmaydigan qutilar (admin sovg‘alari va vaqtincha savdoda olingan escrow); `resourceUsed` — resursdagi ajratilgan qutilar.
  `used`/`limit` moslik aliaslari hisoblash manbasi emas. Yangi maydonlari yo‘q eski javob
  noma’lum capacity bo‘ladi. `customUsed` saqlanayotgan nomli qutilarni, `customLimit` yangi
  yaratish chegarasini bildiradi; Free’da mavjud 2 ta custom uchun 2/0 qonuniy holat.
  STAFF quota ko‘rinishidan yashiriladi.
- Free’da mavjud custom quti umumiy pool ichida o‘qish uchun tanlanadi; random/custom
  o‘rtasida qulf almashtirish mumkin. Admin sovg‘asi va faol savdodagi qutini almashtirish
  uchun qulflash taklif qilinmaydi (`slotExempt`/`activeTrade`). Custom nomi uzilmaydi. Oddiy qutini uzish kirishni bekor qiladi, ammo saqlangan
  allocationni kamaytirmaydi; o‘qish uchun quti tanlash unlock swap orqali amalga oshiriladi.
  Pro tugagach ortiqcha qutilar 30 kun `GRACE`, keyin `RECOVERY` holatiga o‘tadi; quyidagi C oqimi ishlatiladi.
- Xaridning muvaffaqiyatli HTTP javobi “qabul qilindi, imkoniyatlar faollashtirilmoqda”
  holatini beradi. Consumer projection tayyorligi uchun endpoint yo‘q; to‘liq
  faollashish tasdiqlanmaydi. Shu ko‘rinishda takror xarid bloklanadi. Joriy tarifni
  yuklash xatosi Free deb taxmin qilinmaydi, narx o‘zgarishi qayta tasdiqlanadi va
  ayni urinish qaytarilsa idempotency kaliti saqlanadi.
- Custom manzilni tekshirishda API 503 (projection tayyor emas) yoki boshqa xato
  cheksiz loading bo‘lmaydi: backend xabari va aniq qayta urinish tugmasi ko‘rsatiladi.
  Tarmoq xatosida umumiy izoh chiqadi; yangi nom yoki qayta urinish xato holatini tozalaydi.
- Premium `efootball.uz` domeni Pro/STAFF uchun tanlanadi; tarixiy MAX qutilariga kirish saqlanadi; yopilgan
  MAX tarifiga yangi xarid taklifi yo‘q. Custom manzillar escrow uchun avtomatik ishlatilmaydi.

### Pochta saqlash va tiklash (C)

- `accessState: ACTIVE|GRACE|RECOVERY`, `paidExpiresAt`, `graceEndsAt`,
  `selectedForFree` quti holatining manbasi. Eski `locked` faqat yangi maydon yo‘q
  javoblar uchun konservativ ishlatiladi. Grace to‘liq o‘qish beradi, yangi Pro joylarini
  bermaydi; Recovery muhim Konami tiklash/xavfsizlik xatlarini webmail’da o‘qitadi.
  Free uchun random/custom aralash 3 qutini amaldagi unlock swap bilan tanlash mumkin.
  Admin sovg‘asi va faol savdo himoyalangan; Pro uzayishi mavjud qutilarga kirishni tiklaydi.
- Batafsil pochta boshqaruvi webmail `/settings/mailboxes` sahifasida. Eski
  `/profile?mailbox=<id>` havolasi login tekshiruvidan keyin sozlangan webmail
  `/settings/mailboxes?mailbox=<id>` manziliga o‘tadi; kirish tanlash va tarifdagi
  boshqaruv havolalari ham shu manzilga olib boradi.
- Webmail `GET /api/trade/v1/mailboxes/resources` dagi o‘z va saqlangan resurslarni,
  `/admin/plans/mailboxes` esa `GET /api/trade/v1/admin/mailboxes/resources` dagi barcha
  resurslarni ko‘rsatadi, shu jumladan `id:null` server qutilari. `usageBytes/quotaBytes`
  haqiqiy o‘lchov; `usageObservedAt`, `usageStatus: FRESH|STALE|ERROR|UNKNOWN`, `usageError`
  ekranda saqlanadi. `FRESH` o‘lchov haqiqiy 80% ga yetganda ogohlantiriladi. Null yoki xato 0 emas;
  Mailcow o‘lchagan `quotaBytes:0` cheksiz kvotani bildiradi va foiz taxmin qilinmaydi.
  `mailcowPresent` va `deletionStatus: NONE|PENDING|FAILED|CONFIRMED` fizik holatni ko‘rsatadi;
  lokal `deleted` serverdan o‘chirilgan degani emas. Yangilash tugmasi backendning davriy
  reconciliation natijasini qayta oladi; frontend o‘zi serverda reconciliation boshlamaydi.
  `provisioningStatus: NONE|STARTED|CONFIRMED`, `provisioningClaimId`, `provisioningError`
  yaratilish natijasini ko‘rsatadi. `STARTED` tasdiqlanmaguncha release amallari yopiq;
  mavjud egaga tegishli o‘qish/eksport huquqi shu sabab bilan yashirilmaydi.
- Tashqi emailga ko‘chirish: foydalanuvchi Konami’da manzilni o‘zgartiradi va eski emailga
  forgot-password’ni o‘z brauzerida qo‘lda yuboradi. `POST /mailboxes/{id}/release-check`
  → `GET /mailboxes/{id}/release-check/{requestId}` tekshiruvi `VERIFIED` va muddati yangi
  bo‘lmaguncha o‘chirish yopiq. Faol savdo/nizo/huquqiy hold ham bloklaydi. Oxirgi qaytmas
  tasdiqdan so‘ng `POST /mailboxes/{id}/release {requestId,confirmDelete:true}` ishlatiladi.
  Oddiy uzish isbot hisoblanmaydi; joy faqat server tasdiqlagan yo‘qlikdan keyin bo‘shaydi,
  manzil doimiy zahirada qoladi. Uzilgan, saqlangan quti uchun o‘qish/eksport kirishi qaytmaydi;
  resurs panelida faqat release jarayoni qoladi. Xatlarni eksport/tozalash egasining webmail’ida.
- Profilning doimiy tarif xabarlari `GET /api/payment/v1/payments/plans/notices` dan olinadi:
  `EXPIRING|EXPIRED|GRACE_ENDED`, to‘langan obunaning tugash sanasi va `/plans` CTA.
  Profil xabarlari faqat obunaga tegishli; pochta Grace/Recovery izohlari va sanalari webmail’da.
  Takror id bir marta chiqadi; foydalanuvchi bosgandagina `POST /notices/{id}/read` qilinadi.
  `plans/me` dagi `lastPaidExpiresAt`/`graceEndsAt` tarixni saqlaydi; `expiresAt` joriy paid
  muddat bo‘lib qoladi. Telegramga bog‘liqlik yo‘q.

### Bozor: saralash va recommendation

- **Qiziqishlarim** (saralash menyusida birinchi, login qilganlarga default) — `recommendation-service` `/feed` tartibi,
  filtr va sahifalash marketplace `POST /listings/ranked` da. Snapshot hash `feed=` URL parametrida.
- **Katta bozor** — shu menyudagi Qiymat / Arzon / Qimmat / Ko'p yoqtirilgan / Eng yangi / Eng eski tartiblaridan biri
  tanlanganda (`sort=` yoki eski `tab=market` havolasi). Mehmonlar uchun default:
  `GET /listings?sort=valueScore,desc`. Eng yangi — `createdAt,desc`, Eng eski — `createdAt,asc`. Alohida bo'lim tablari yo'q.
- Qiziqishlarimga qaytish `sort`, `tab`, `page`, `feed` parametrlarini tozalaydi; boshqa filtrlar saqlanadi.
- Player filtri har ikki rejimda: rec `/match` → `ranked` → rec `/match/details`. Bu rejimda saralash
  menyusi yashiriladi, chunki tartibni moslik belgilaydi. rec xatosi → xato holati.
- Hammasi bitta `loadMarketplacePage` (`src/lib/marketplace-page-loader.ts`) orqali; server transporti
  `marketplace-page-server.ts`, brauzer transporti `marketplace-page-transport.ts`.
- Brauzer → `/api/rec/**` (Next route) → `nginx:8080/api/rec/**`.
- Dream team, card interest, admin talab sonlari va e'lon sahifasidagi moslik — `src/lib/rec-server.ts` / `REC_API_BASE`.

### Marketplace filter panel

- Header search and toolbar sorting are independent of detailed filters. Clear resets detailed filters to Mobile and preserves search, sort, and player criteria.
- Desktop sidebar and mobile sheet share fields, validation and cancellable 300ms count previews. Player and personalized-feed counts use recommendation `/match` or `/feed` followed by marketplace `/listings/ranked`, matching the result list and detailed constraints.
- Mobile coin balances, account links and remaining device transfers are hidden and cleared when switching to Steam or PlayStation. The clean-account preset requires both links disconnected and both balances at least zero; stricter balance minimums are retained when enabling it.
- Team Strength maximum and sold listings are expandable secondary options. Price displays space-separated integers in so‘m; URLs retain unformatted integers.
- `attr.exchange_mode=ACCEPTS_EXCHANGE` includes `EXCHANGE_ONLY`, `EXCHANGE_WITH_SURCHARGE` and `BOTH`; existing exact values still work. Opening the player selector applies the current detailed draft and closes the general sheet first.

## Konfiguratsiya

Server: `INTERNAL_API_BASE_URL`, `INTERNAL_BOT_BASE_URL`, `TELEGRAM_BOT_USERNAME`, `FIREBASE_*`.
Brauzer (`NEXT_PUBLIC_*` — build vaqtida qotiriladi): `NEXT_PUBLIC_TELEGRAM_BOT`, `NEXT_PUBLIC_BASE_URL`,
`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_MAIL_*`,
`NEXT_PUBLIC_BOT_PHOTO_BASE_URL`, `NEXT_PUBLIC_BOT_VIDEO_BASE_URL`, `NEXT_PUBLIC_CHEMPIONAT_API_URL`.

## Buyruqlar

```bash
npm ci --no-audit --no-fund
npm run dev          # lokal
npm run typecheck && npm run lint && npm test && npm run build   # CI bilan bir xil tekshiruv
```

## Ehtiyot bo'l

- `package.json` o'zgarsa `package-lock.json` ham commit qilinsin — CI `npm ci` bilan o'rnatadi.
- React/Next paketlari faqat stable versiyada (RC/beta emas).
- Telegram Desktop (Linux, WebKitGTK) Mini App'da auth cookie faqat top-level navigatsiya
  orqali o'rnatiladi; u yerda DevTools inspector ishlamaydi.
- Media URL'lar bot proxy'siga ishora qiladi (`/bot/photo/{fileId}`) — faylning o'zi Telegram'da.
- Firebase push: [docs/firebase-notifications.md](docs/firebase-notifications.md).

## Userbotlar

- Admin: `/admin/userbots` — Telegram userbotlar: ulash (telefon → kod → 2FA), holat, uzish, vazifaga biriktirish (userbot-core `/api/userbot/v1`).

## Kontekstli pop-up xabarlar

- Admin: `/admin/popups` — qoralama, ko‘rib chiqish, auditoriya (barcha/sotuvchilar/tanlangan UUID), trigger, muddat, ichki CTA, faollashtirish/to‘xtatish va ko‘rsatish/bosish/yopish statistikasi.
- `src/components/popups/` — Radix dialog, brauzer koordinatori va haqiqiy voqea signallari. `src/lib/popups/` — API, tiplar va e’tibor siyosati. Marketplace shell autentifikatsiyalangan foydalanuvchini uzatadi; alohida auth so‘rovi kerak emas.
- BROWSE, LISTING_PUBLISHED, EMPTY_SEARCH va yangi TRADE_COMPLETED signallari. Savdo tarixi signal bermaydi. Savdo signali 5 daqiqa, qolgan kontekstlar 60 soniya amal qiladi.
- Brauzer 15 soniya sahifada va 3 soniya tinchlikni kutadi; so‘rovlar foydalanuvchi/sessiya uchun kamida 60 soniya oralig‘ida. Chat/hamyon/forma/admin sahifalarida, yashirin tabda, matn yozayotganda yoki boshqa oynada ko‘rsatilmaydi. Push taklifi xuddi shu slot va brauzer limitlarini ishlatadi, kamida 45 soniya kutadi.
- Backend atomik limitlari: bir sessiyada 1, 24 soatda 2, oraliq kamida 6 soat, har kampaniya foydalanuvchiga bir marta. Claim rezervatsiyasi limitni sarflaydi; faqat renderdan keyingi SHOWN ko‘rsatish deb sanaladi. Yo‘l o‘zgarsa kechikkan javob tashlanadi.
- Mavjud marketplace-servisdagi `/api/v1/popups/**` va admin endpointlar ishlatiladi. Alohida worker, deploy sozlamasi yoki boshlang‘ich faol kampaniya yo‘q. Lokal preview yubormaydi va statistikani o‘zgartirmaydi.

Marketplace filters use a plain desktop sidebar and a full-height mobile overview with selection summaries. Groups expand inline; collapsed controls retain drafts and invalid groups stay visible. Result counts remain debounced and cancellable.

Chat custom emoji uses the authenticated read-only `/api/marketplace/v1/emoji-packs` catalog. The existing admin catalog remains used for management. Drafts and chat message text preserve `<tg-emoji emoji-id="ID">fallback</tg-emoji>` tokens; only numeric IDs are recognized, all other content stays plain text. WebM emoji animate inline; static WebP items render as images; TGS items currently use their static thumbnails.

## Savdo tasdiqlash kodlari

`TRADE_EMAIL_CHANGE_CODE` va `TRADE_LOGIN_CODE` bildirishnomalaridagi `verificationCode`
Konami emailini o‘zgartirish yoki akkountga kirish uchun ko‘rsatiladi. Global dialog
joriy autentifikatsiyalangan foydalanuvchining o‘qilmagan, aniqlanganiga 5 daqiqadan
oshmagan kodlarini 10 soniyada, oynaga qaytganda va bildirishnoma voqeasida tekshiradi.
Telegram Mini App va brauzerda push ruxsatisiz ham ishlaydi. Bir savdo va maqsad uchun
eng yangi kod ko‘rsatiladi; yopilgan kod brauzer sessiyasida qayta ochilmaydi.
Dialog kodni nusxalash va savdo chatini ochish imkonini beradi. Sessiya identifikatori
`/api/push/config` dan Firebase konfiguratsiyasi bo‘lmasa ham olinadi.

## Saqlangan qidiruvlar va narx kuzatuvlari

- `/watches` — login qilgan foydalanuvchining saqlangan qidiruvlari va alohida narx kuzatuvlari. Profil menyusidan, bozorning «Qidiruvni saqlash» tugmasidan va e’lon sahifasidan ochiladi.
- Qidiruv v1 faqat `matchCard`/`matchStrictness` o‘yinchi kartalari va `minPrice`/`maxPrice` so‘mdagi narx oralig‘ini saqlaydi. Platforma, matn, saralash va dinamik filtrlar saqlanmaydi. Bo‘sh yoki noto‘g‘ri narx oralig‘i saqlanmaydi; tahrirlash kartalarni saqlab qoladi.
- API: `/api/rec/v1/saved-searches` (`GET`, `POST`), `/{id}` (`PUT`, `PATCH`, `DELETE`), `/priorities` (`PUT {ids}`). Narxlar: `/api/marketplace/v1/price-watches` (`GET`, `POST {listingId}`), `/{id}` (`PATCH {paused}`, `DELETE`), `/priorities` (`PUT {ids}`), `/preferences` (`PUT {notificationsEnabled,telegramEnabled}`). Har ikki xizmat mavjud same-origin proxy orqali autentifikatsiyalanadi.
- Limit, `available` va `immediate` xizmat javobidan olinadi. Yangi yaratishda pauzadagi kuzatuvlar ham saqlangan jami soniga kiradi; tahrirlash va asosiy tanlash mavjud ma’lumotlar bilan ishlaydi. Free uchun odatiy 1 qidiruv/3 narx, Pro uchun 5/20; admin o‘zgartirgan katalog ham aks etadi. Noma’lum imkoniyat cheksiz deb olinmaydi. Free jamlanmasi 19:00 Asia/Samarkand; Pro topilganda xabar. Umumiy ilova/Telegram roziligi hamda har qidiruvning alohida roziligi boshqariladi.
- Obuna tugaganda ortiqcha kuzatuv o‘chirilmaydi: `LIMIT` pauzasi ko‘rsatiladi, asosiy kuzatuv priority tartibi bilan tanlanadi. Qo‘lda pauza, davom ettirish, tahrirlash va o‘chirish server natijasidan keyin aks etadi; xato qayta urinish bilan ko‘rinadi. Sevimlilarga qo‘shish narx kuzatuvini yaratmaydi.
- Notification center `WATCH_MATCH`/`WATCH_DIGEST` va `watchPayload` (`items[].listingId/reasons/oldPrice/newPrice`, `totalCount`, `remainingCount`)ni ko‘rsatadi. Bitta natija e’longa, ko‘p yoki qisqartirilgan jamlanma `/watches`ga olib boradi.

- Yangi Free foydalanuvchi uchun `/watches` autentifikatsiyadan keyin payment `plans/me`ni kutadi: birinchi canonical Free snapshot va durable event paymentda yaratiladi. UI grantlarni o‘zi taxmin qilmaydi; projection tayyor bo‘lmaguncha mavjud unavailable holati chiqadi. E’londagi alohida narx opt-in `watch_entitlement_unavailable` olsa, payment `plans/me`ni bir marta so‘rab, foydalanuvchiga qayta urinishni taklif qiladi; yashirin create retry yoki avtomatik grant yo‘q.


## Sotuvchi hisoboti (E)

- `/seller-analytics` — autentifikatsiyalangan sotuvchining faol va sotilgan e’lonlari statistikasi. Profil menyusi va profil sahifasidan ochiladi; `noindex, nofollow`. SSR yangi Free identifikatori uchun canonical payment `plans/me`ni kutadi, ammo barcha tarix/eksport ruxsatini marketplace javobi belgilaydi. Payment xatosida sahifa asosiy statistikani yuklashga davom etadi.
- Same-origin API: `GET /api/marketplace/v1/seller-analytics/summary`, `/report?days=7|30|90&listingId?&page=0&size=50`, `/export?days=7|30|90&listingId?`. So‘rovlar cookies bilan, `cache: no-store`; eksport `Accept: text/csv, application/json` yuboradi va HTTP status/content-type tekshirilgach faylga aylanadi. Eksport sahifadan qat’i nazar filtrdagi barcha e’lonlarni oladi. Blob URL har doim tozalanadi.
- Free uchun `listingCount`, `uniqueViews`, `currentFavorites`, `inquiries` asosiy kartalarda saqlanadi. `capabilities.status: AVAILABLE|DENIED|UNAVAILABLE`, `historyDays`, `exportEnabled` serverdan olinadi; `AVAILABLE` ichidagi `historyDays:null` STAFF uchun cheksiz. Eski/yo‘q/noto‘g‘ri capability grant bermaydi. Free `DENIED` Pro CTA oladi; `UNAVAILABLE` noma’lum holat va qayta urinish oladi.
- Davr va e’lon filtri totals, kunlik jadval hamda sahifalangan e’lon jadvalini yangilaydi. Ruxsatdan katta 7/30/90 kunlik tugmalar yopiq. 403 `analytics_upgrade_required` yoki 503 `analytics_policy_unavailable` eski paid natijani tozalaydi; asosiy kartalar saqlanadi va qayta urinish capabilityni qayta o‘qiydi. Oddiy anonim 403 upgrade deb taxmin qilinmaydi. Filter o‘zgarsa kechikkan report/CSV natijasi bekor qilinadi.
- `coverage.collectionStartedAt`, `timezone: Asia/Samarkand`, `historyPartial` yig‘ish boshlanishi va qisman tarixni ochiq ko‘rsatadi; yangi/bo‘sh sotuvchiga to‘liq 90 kunlik tarix va’da qilinmaydi. Ko‘rish — e’lon/foydalanuvchi uchun birinchi noyob ko‘rish, kundalik takrorlar emas. `saveAdditions` — yig‘ish boshlanganidan keyingi qo‘shishlar, joriy sevimlilar yoki net o‘zgarish emas. So‘rov — e’lon/so‘rovchi uchun birinchi haqiqiy akkount so‘rovi, oddiy chat ochilishi/xabari emas. Savdo — platformada yakunlangan bitim; `grossSalesUzs` sotuvda kelishilgan yalpi summa, sof foyda emas. Inson admin bilan yakunlangan summa hamyon tasdiqlagan to‘lovni anglatmaydi; obmen summaga 0 qo‘shadi.
- `grossSalesUzs` JSON’da manfiy bo‘lmagan **butun decimal string**, so‘mda. Klient `Number`ga aylantirmaydi; `9007199254740993` ham aniq guruhlanadi. Sonlar mavjud deterministik formatter, sanalar UTC+5/date-only formatter bilan chiqadi (Node/brauzer locale farqidan hydration xatosi yo‘q).
- Yonma-yon Vitest testlari: canonical SSR/auth, haqiqiy DOM Free/Pro/STAFF/unknown holatlari, 7/30/90, filter/sahifa/CSV, 403/503 retry, bo‘sh/qisman tarix, race/abort, exact summa va noto‘g‘ri export/report javoblari; navigation DOM testi menyudagi havolani tekshiradi. Jadval gorizontal scrolli fokuslanadi; barcha yangi amallar kamida 44px, light/dark va 390px ekranga mos.

## Sotuvchi vositalari va profil bezagi (F)

- `/seller-tools` — login talab qiladigan, `noindex, nofollow` boshqaruv sahifasi. Profil menyusi, haqiqiy profil sarlavhasi va akkountlar ro‘yxatidan ochiladi. SSR canonical Free identifikatorini tayyorlash uchun payment `plans/me`ni kutadi; yozish huquqini faqat marketplace `GET /api/marketplace/v1/seller-tools/capabilities` javobidagi `tools`, `bulk`, `profileDecoration` (`AVAILABLE|DENIED|UNAVAILABLE`) belgilaydi. Tarif nomi grant bermaydi. Noto‘g‘ri/yo‘q javob va yangilash xatosida yozish yopiladi; fokus, ko‘rinish va 30 soniyalik tekshiruv imkoniyatni yangilaydi.
- Shablon va shaxsiy qaydlar: `GET /seller-tools/templates|notes?page=0&size=50`, `POST` collection, `PUT|DELETE /{id}`. `PUT` to‘liq almashtirish bo‘lib, saqlangan qaydning chat/e’lon konteksti o‘zgarmaydi. Shablon 120 belgili sarlavha va 4000 belgili matn; qayd ixtiyoriy sarlavha va 8000 belgili matn oladi. Qayd uchun joriy chat yoki o‘z e’loni kerak; egasi/kontekstni server tekshiradi. Haqiqiy chat va o‘z e’loni sahifalaridagi havolalar UUID kontekstini oldindan tanlaydi. Qaydlar faqat egasiga tegishli, suhbatdosh composeriga, xabar yoki ommaviy profilga qo‘shilmaydi. Matn oddiy matn sifatida chiqadi.
- Free yoki noma’lum tarifda ham barcha saqlangan ma’lumotni o‘qish, sahifalash va `GET /seller-tools/export` orqali to‘liq JSON eksport qilish ochiq. Eksport ro‘yxat sahifasidan mustaqil; Blob URL tozalanadi. 403 `upgrade_required` va 503 `plan_unavailable` eski yozish huquqlarini tozalaydi, saqlangan ma’lumot va o‘qishni saqlaydi. Xato va aniq qayta urinish mavjud.
- Chatdagi «Shablon» tanlovi faqat ochilganda shablonlarni yuklaydi. Saqlangan shablonni Free ham qoralamaga yangi qatorda qo‘sha oladi; joriy qoralama saqlanadi, xabar avtomatik yuborilmaydi. Qo‘shilgan matn 4000 belgidan oshsa tushunarli xato chiqadi. Tahrirlash, ovoz yozish va yuborish davomida tanlov yopiq. Radix dialog klaviatura fokusini boshqaradi va yopilganda so‘rovni bekor qiladi.
- Ommaviy tanlov faqat `GET /listings/me?page=…&size=50` orqali o‘z e’lonlarini oladi. Chegara `bulkLimit`dan olinadi. `POST /seller-tools/listings/bulk {operation:'UNPUBLISH'|'PRICE',listingIds,price?}` har e’lon natijasini ko‘rsatadi. `PRICE` kamida 5000.00, ko‘pi bilan 17 butun/2 kasr raqamli decimal **string** sifatida o‘zgartirmasdan yuboriladi; floating-point aylantirish yo‘q. Qisman xatoda muvaffaqiyatli va xato natijalar e’lon sarlavhasi bilan saqlanadi, e’lonlar yangilanadi; yashirin to‘liq retry yo‘q. Oxirgi bo‘sh sahifa mavjud sahifaga qaytadi.
- Haqiqiy o‘z profil sarlavhasi va `/users/[id]` ommaviy profili umumiy jonli bezak komponentini ishlatadi. Public `GET /profiles/{id}/appearance` faqat `{pro,coverFileId,validUntil}` oladi; o‘z `GET /profiles/me/appearance` saqlangan muqova va `capability`ni ham oladi. `validUntil` kelishi bilan belgi/ommaviy muqova yashiriladi; yangilash xatosi ham yashiradi. Fokus, visibility va 30 soniyalik so‘rov, identity almashganda eski javobni tashlash hamda timer/AbortController cleanup mavjud. «Pro a’zolik» faqat tarif belgisi; verifikatsiya va xaridor reytingi alohida qoladi.
- `/profile/edit`dagi muqova boshqaruvi `PUT /profiles/me/appearance/cover`ga bitta `file` multipart rasm yuboradi; `Content-Type` qo‘lda qo‘yilmaydi. Olib tashlash `DELETE` bilan ishlaydi. Server mavjud Telegram media hajm/tur/magic tekshiruvlarini va pullik huquqni bajaradi; muvaffaqiyatsiz yuklash oldingi muqovani saqlaydi. Free’da egasi saqlangan muqova previewini ko‘radi, ommaga ko‘rinmasligi izohlanadi, o‘zgartirish yopiq. Muddat kelganda tahrirlash ham darhol yopiladi. Media mavjud `listingMediaUrl` → `/bot/photo` oqimidan olinadi.
- Barcha F API so‘rovlari same-origin `/api/marketplace/v1` proxy orqali `Accept: application/json`, cookies, `cache: no-store` va AbortSignal bilan ishlaydi. Yangi tugma/havolalar kamida 44px, mobile/dark/reduced-motion va klaviatura dialog holatlari saqlanadi. Gamer yoki turnir flaglari ochilmagan.

- `/seller-tools` boshqaruvi va `/profile/edit` muqova editori SSR foydalanuvchi ID bilan key qilinadi: shu sahifada hisob almashganda oldingi shaxsiy ro‘yxat/qoralama/saqlangan muqova va pullik holat tozalanadi, eski o‘qish/yuklash so‘rovlari bekor bo‘ladi. Shu foydalanuvchining oddiy SSR refreshi yozilayotgan qoralamani saqlaydi.
