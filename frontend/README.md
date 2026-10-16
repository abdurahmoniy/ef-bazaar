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

## Backend'ga qanday murojaat qilinadi

- **Server (SSR, Server Actions):** `INTERNAL_API_BASE_URL` = `http://nginx:8080/api` —
  ichki nginx bloki (80-portdagi HTTPS redirect'dan qochish uchun). `src/lib/api.ts` → `apiFetch`.
- **Brauzer:** nisbiy `/api/<servis>/v1/...` yo'llari (same-origin). Prodda nginx ularni
  to'g'ridan-to'g'ri servisga yo'naltiradi; `access_token` httpOnly cookie o'zi boradi, CORS kerak emas.
- Sessiya: access cookie 15 daqiqa, refresh 30 kun. Access tugagan bo'lsa `proxy.ts` refresh
  qiladi va **ketayotgan so'rovning Cookie headerini ham** yangilaydi (aks holda birinchi so'rov 401 oladi).

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
