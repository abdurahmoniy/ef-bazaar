# Chempionat-X integratsiyasi + Gamer Card + Blacklist — arxitektura plani

**Sana:** 2026-07-15 (rev. 2026-07-20 — trade-service/escrow, smart-admin-worker va yangi migratsiyalarga moslandi)
**Status (2026-07-21):** Barcha fazalar implementatsiya qilindi — identity
bridge + dual auth (V18), ELO + Kafka publisher (V19), blacklist consumer +
join enforcement (V20), auth summary endpoint, Gamer Card (V24/V25 + UI +
PNG), Trust/Blacklist (V26 + public/admin UI), /tournaments sahifalari +
PublicTournamentController, lag-break/fake-result avtoshikoyat bridge
(ResultRejectedEvent → internal trust API), nginx + compose overlay.
Qolgani faqat deploy-side: serverda secretlar, shared network va flaglarni
yoqish (docker-compose.efbazaar.yml izohlariga qarang).
**Qamrov:** ikkita repo — `ef-bazaar` (monorepo) va `Chempionat-X` (alohida repo)

---

## 1. Maqsad

efBazaar'ga uchta yirik qobiliyat qo'shiladi, uchalasi bir-biriga bog'liq:

1. **Turnirlar moduli** — mavjud Chempionat-X loyihasi efBazaar ichida modul sifatida ishlaydi.
2. **Gamer Card** — o'yinchining "raqamli pasporti": ELO, tier, statistika, ishonch ko'rsatkichlari, PNG qilib ulashish.
3. **Blacklist** — shikoyat-asosli himoya tizimi: turnirdagi ham (lag-break, yolg'on natija), savdodagi ham (firibgarlik) qoidabuzarlar bitta markazlashgan bazaga tushadi.

Bog'liqlik zanjiri: turnir matchlari → ELO → Gamer Card; shikoyatlar → Blacklist → hamma joyda enforcement.

---

## 2. Asosiy arxitektura qarori

### Chempionat-X: fork QILINMAYDI, runtime integratsiya qilinadi

Chempionat-X alohida brend va alohida repo bo'lib qoladi, o'z CI'si bilan o'zini deploy qiladi.
efBazaar unga **tarmoq orqali** ulanadi. Sabab: source-import (subtree/copy) qilinsa, birinchi
kunidanoq ikkita mustaqil kod bazasi paydo bo'ladi va Chempionat-X'dagi yangilanishlar
efBazaar'ga o'z-o'zidan yetib kelmaydi.

**Model: bitta ishlab turgan instansiya, ikkita kirish nuqtasi.**

```
chempionat-x.uz ──► Chempionat front ──┐
                                       ├──► chempionat-api (bitta backend, bitta DB)
efbazaar.uz/tournaments ──► efBazaar   │        │
  nginx (auth verify → X-User-Id) ─────┘        ├─► Kafka: efbazaar.tournament.*
                                                └─► blacklist consumer (flag)
```

- Ma'lumot bitta: chempionat-x.uz'da ochilgan turnir efbazaar.uz'da ham ko'rinadi.
- Userbase bitta: ikkala tizim ham Telegram-first, umumiy kalit — `telegram_id`.
- Integratsiya kodi **Chempionat-X repo ichida, env-flag ortida** yashaydi
  (`EFBAZAAR_INTEGRATION_ENABLED`). Flag o'chiq bo'lsa Chempionat avvalgidek 100%
  mustaqil ishlaydi — standalone rejim buzilmaydi.

### Gamer Card va Blacklist: to'liq efBazaar ichida

Blacklist'ga faqat turnir qoidabuzarlari emas, savdoda aldaganlar ham tushadi — shuning
uchun u platforma darajasidagi tizim va **marketplace-service ichida** quriladi (yangi
servis ochilmaydi). Chempionat-X faqat consumer: bloklangan userni turnirga kiritmaydi.

### Identity bridge: telegram_id orqali, UUID faqat chegarada

Chempionat-X `users.id` — Long (IDENTITY), efBazaar — UUID. Long PK'larni UUID'ga
ko'chirish — katta va xatarli migratsiya, **qilinmaydi**. Buning o'rniga:

- Chempionat `users` jadvaliga `auth_user_id UUID UNIQUE` (nullable) ustuni qo'shiladi.
- Backfill va yangi bog'lash `telegram_id` bo'yicha (auth-service internal API orqali,
  DB'ga to'g'ridan ulanish TAQIQLANGAN — CLAUDE.md qoidasi).
- Ichki FK'lar Long bo'lib qoladi; UUID faqat tashqi chegarada (headerlar, Kafka, API).

---

## 3. Hozirgi holat (analiz xulosalari)

### Chempionat-X (`/Users/.../ef/Chempionat-X`)
- Maven multi-module: `core` (domain+servislar), `api` (REST), `bot` (Telegram), `front` (Next.js 14).
- Java 17, Spring Boot 3.2.1, PostgreSQL + Flyway (V1–V17), Redis. Package: `com.chempionat.*`.
- O'z JWT issueri bor (`/api/auth/telegram`, `/api/auth/telegram-webapp`, `/api/auth/refresh`).
- Deyarli hamma endpoint JWT talab qiladi; ochiq: `/api/auth/**`, `/api/tournaments/by-token/**`, `/api/public/**`.
- Domain kuchli: Liga / Playoff / Guruh+Playoff / Single elimination, match lifecycle,
  **MatchResult approval workflow** (screenshot, submittedBy, isApproved, reviewedBy) —
  yolg'on natijaga qarshi birinchi qatlam allaqachon bor.
- `UserResponse`da `telegramId` bor — identity mapping uchun yetarli.
- **ELO yo'q, shikoyat tizimi yo'q** — ikkalasi ham yangi quriladi.
- 2026-07 rev.: Flyway boshi hali ham `V17` — plandagi `V18/V19/V20` raqamlari amalda.
  Yangi qo'shilganlar (natija formasi screenshot upload/preview, join request'ni inline
  tasdiqlash/rad etish, organizer to'lov retry) ELO trigger'iga zid emas, aksincha approval
  workflow'ni mustahkamlaydi.

### efBazaar
- marketplace-service'da moderatsiya patterni tayyor: `ListingReport` + `AdminReportController` + admin UI.
- Ichki servislararo chaqiruv patterni tayyor: `AuthNameClient` → `X-Internal-Secret` bilan
  `POST /internal/auth/v1/users/names/batch` (fail-soft).
- marketplace Flyway boshi: `V23` (yangi migratsiyalar `V24`dan boshlanadi, append-only!).
- Kafka konvensiyasi: `efbazaar.<service>.<event>`, idempotency key bilan.
- **trade-service (8085) — escrow endi to'liq ishlaydi** (2026-07 rev.):
  - Trade lifecycle: `INITIATED → … → SUCCESS | REJECTED | ORPHANED` (`TradeState`).
  - Savdo taklifi marketplace chat ichida: `chat_messages.message_type = TRADE_PROPOSAL`
    (V22), `proposal_id` + outcome bilan.
  - `efbazaar.trade.listing-sold` eventi bor: `{listingId, buyerId, sellerId, priceUzs, soldAt}`;
    marketplace uni consume qilib `listings.sold_at` + `sold_to_user_id` saqlaydi (V23).
    **Demak escrow savdolar statistikasi uchun yangi event ham, yangi consumer ham kerak emas.**
- **smart-admin-worker (Python, 8086)** — Konami/mail avtomatlashtiruvi; escrow jarayonida
  Konami akkaunt email'i bilan ishlaydi (blacklist identifikatorlari uchun ahamiyatli, 5.3-band).
- Frontend profil sahifasida stats-baza tayyor: `profile-header.tsx` `StatCell` grid bilan
  (e'lonlar / sevimlilar / chatlar) — Gamer Card UI shu patternni kengaytiradi.

---

## 4. Chempionat-X'da qilinadigan ishlar

### 4.1. Identity bridge
- `V18__auth_user_id.sql`: `users.auth_user_id UUID UNIQUE NULL`.
- Bir martalik backfill job: `telegram_id` bo'yicha auth-service internal API bilan match.

### 4.2. Dual auth — `HeaderAuthFilter`
- So'rovda `X-User-Id` + `X-Internal-Secret` bo'lsa (secretni faqat efBazaar nginx qo'ya oladi):
  UUID bo'yicha lokal user find-or-create (telegram ma'lumotlari auth summary API'dan) → SecurityContext.
- Secret yo'q/noto'g'ri → mavjud JWT flow, o'zgarishsiz. Standalone domen avvalgidek ishlaydi.
- **Secret majburiy** — aks holda header spoofing ochiq qoladi.
- Natija: efBazaar useri efBazaar UI ichidan turib turnirga yoziladi, natija yuboradi —
  deep-link kerak emas.

### 4.3. ELO engine (flag ortida EMAS — Chempionat'ning o'z featuresi, standalone brendga ham foyda)
- `V19__elo.sql`: `user_ratings (user_id, elo DEFAULT 1000, wins, draws, losses, goals_for, goals_against, matches_count)` + `elo_history (user_id, match_id UNIQUE, delta, elo_after)` — idempotent.
- Formula (klassik): `E = 1/(1+10^((Rb−Ra)/400))`, `R' = R + K·(S−E)`.
  - K = 32; birinchi 30 matchda K = 40 (yangi o'yinchi tez o'z joyini topadi).
  - Trigger: MatchResult **approve bo'lganda** (approval workflow anti-fake qatlam bo'lib xizmat qiladi).
  - BYE / texnik matchlar hisoblanmaydi.
  - Penaltidagi g'alaba = g'alaba (S=1), lekin K/2. *(muhokamali — 8-bo'limga qarang)*
- Tier — hisoblanadigan qiymat, DB'da saqlanmaydi:

| Tier | ELO |
|---|---|
| Bronze | < 1000 |
| Silver | 1000–1199 |
| Gold | 1200–1399 |
| Elite | 1400–1599 |
| Legend | 1600+ |

### 4.4. Kafka publisher (flag: `EFBAZAAR_INTEGRATION_ENABLED`, `@ConditionalOnProperty`)
- `efbazaar.tournament.match-finished` — `{matchId, tournamentId, homeAuthUserId, awayAuthUserId, homeTelegramId, awayTelegramId, score, penalties, occurredAt, idempotencyKey}`
- `efbazaar.tournament.elo-updated` — `{authUserId, telegramId, oldElo, newElo, matchId, occurredAt, idempotencyKey}`
- Flag o'chiq → Kafka dependency umuman ko'tarilmaydi.

### 4.5. Blacklist enforcement (flag ortida)
- Consumer: `efbazaar.marketplace.user-blacklisted` / `user-unblacklisted` → lokal `blocked_users` jadvali (`V20`).
- Tekshirish nuqtalari: turnirga join, organizer request. TEMP blok — `expires_at` bilan, scheduler shart emas.

### 4.6. Bot — avtomatik lag-break shikoyati (flag ortida, eng oxirgi navbat)
- Match jarayonida uzilish qayd etilsa bot efBazaar trust API'ga (internal secret bilan)
  `LAG_BREAK` shikoyat ochadi — status PENDING, admin baribir qo'lda tekshiradi.

### 4.7. Kontrakt hujjati
- Repo ichida: event sxemalari + header-auth spec, versiyalangan. Sxema o'zgarishi =
  breaking change, ikkala tomon birga yangilanadi. CI'ga oddiy smoke-test.

---

## 5. efBazaar'da qilinadigan ishlar

### 5.1. auth-service
- `POST /internal/auth/v1/users/summary/batch` (InternalSecretFilter ortida):
  `{id, displayName, telegramUsername, telegramId, verified, createdAt, photoAvailable}`.
  Mavjud `names/batch` tegilmaydi.

### 5.2. marketplace-service — `gamer` paketi (Gamer Card)
- `V24__gamer_stats.sql` — Kafka projection: `gamer_stats (user_id PK, elo, wins, draws, losses, goals_for, goals_against, tournaments_count, updated_at)`.
  - Consumerlar: `efbazaar.tournament.elo-updated`, `match-finished`.
  - Nega projection (sinxron HTTP fan-out emas): turnir servisi yotsa ham karta ochiladi (fail-soft).
  - **Escrow savdolar soni projectionga KIRMAYDI** — u allaqachon lokal `listings` jadvalidan
    to'g'ridan hisoblanadi: sotganlari = `seller_id + status=SOLD`, olganlari = `sold_to_user_id`
    (V23 `listing_sold_metadata` buni ta'minlab bo'lgan). Yangi consumer kerak emas.
- `V25__gamer_profiles.sql`: `gamer_profiles (user_id PK, bio VARCHAR(280), platform ANDROID|IOS|BOTH, highest_division 1..9, favorite_team, timestamps)`.
- API:
  - `GET /api/v1/gamer-cards/{userId}` — public, bitta javobda: identity (auth summary'dan,
    fail-soft), ELO + tier, W/D/L + win rate + gollar, turnirlar soni, escrow savdolar soni,
    aktiv listinglar / sotilganlar, `blacklisted` flag, memberSince, verified. Qisqa cache (60s).
  - `GET/PUT /api/v1/gamer-cards/me` — bio/platforma edit (faqat `X-User-Id`dan, request body'dan emas).
- **PNG ulashish:** MVP — client-side `html2canvas` ("Kartani ulash" → tayyor rasm).
  V2 — server-side render (bot orqali ulashish uchun; Chempionat'dagi `BracketImageRenderer`
  tajribasi namuna).

### 5.3. marketplace-service — `trust` paketi (shikoyatlar + Blacklist)
- `V26__trust.sql`:

```sql
complaints (
  id UUID PK,
  complainant_id UUID, accused_id UUID,
  context_type   MATCH | TRADE | CHAT,
  context_id     VARCHAR,          -- match id / trade id / chat id
  category       LAG_BREAK | FRAUD | TOXIC | FAKE_RESULT,
  details TEXT, evidence_message_ids TEXT[],   -- Telegram media pattern
  status PENDING | CONFIRMED | REJECTED,
  reviewed_by UUID, created_at,
  UNIQUE (complainant_id, context_type, context_id)   -- spam himoya
)

penalties (
  id UUID PK, user_id UUID,
  type WARNING | TEMP_BLOCK | PERM_BLOCK,
  reason, source_complaint_ids UUID[],
  starts_at, expires_at NULL,      -- NULL = doimiy
  status ACTIVE | EXPIRED | REVOKED
)

blacklist_identifiers (            -- yangi akkaunt ochsa ham ushlash uchun
  penalty_id UUID,
  type  KONAMI_ID | TELEGRAM_ID | TELEGRAM_USERNAME | PHONE,
  value VARCHAR                    -- normalized: lowercase, '@'siz, raqamlargina
)
```

- **Konami identifikatorlarining tabiiy manbasi — escrow flow** (2026-07 rev.): trade-service +
  smart-admin-worker savdo jarayonida Konami akkaunt email'i bilan ishlaydi. `FRAUD` shikoyati
  TRADE kontekstda tasdiqlansa, trade yozuvidan Konami identifikatorlari olinib
  `blacklist_identifiers`ga qo'shiladi — qo'lda yig'ish shart emas, ma'lumot verified.

- **Penalty engine** (CONFIRMED shikoyatlar bo'yicha avtomatik, admin override bilan):

| Tasdiqlangan shikoyatlar | Jazo |
|---|---|
| 1 | WARNING (notification) |
| 3 | TEMP_BLOCK — 7 kun |
| 5+ | PERM_BLOCK |

- **Yolg'on shikoyatchilar trackingi:** REJECTED shikoyatlar complainant hisobiga yoziladi;
  3 ta rad etilgan shikoyat → o'ziga WARNING.
- API: shikoyat berish (match/savdo/chat kontekstidan), admin review (mavjud
  `AdminReportController` patterni + report'dan bir klikda blacklist), public
  `GET /api/v1/blacklist` — sabab + sana + shikoyatlar soni ko'rinadi, **evidence ochilmaydi**;
  nginx'da rate-limit (scraping nishoni).
- Eventlar: `efbazaar.marketplace.user-blacklisted` / `user-unblacklisted` (idempotency key).
- **Enforcement matritsasi:**

| Joy | Cheklov |
|---|---|
| marketplace | listing yaratish ✗, chat ochish ✗, listinglar `BLOCKED` statusga (qaytarish mumkin) |
| trade-service | savdo taklifi (`TRADE_PROPOSAL`) yaratish ✗ va qabul qilish ✗ — mavjud chatlar orqali ham escrow boshlanmasin |
| Chempionat-X | turnirga join ✗, organizer request ✗ (4.5-band) |
| frontend | Bozorda "Qora ro'yxat" tab; listing/chat/Gamer Card'da qizil ogohlantirish |

### 5.4. Frontend
- `/tournaments/**` — turnirlar ro'yxati, jadval, bracket, join (proxy orqali chempionat-api'ga,
  auth avtomatik — 4.2 tufayli to'liq interaktiv).
- `GamerCard` komponenti — listing sahifasi, chat header, `/gamers/[id]`, profil edit, PNG ulashish.
  Mavjud `profile-header.tsx` (`StatCell` grid) patterni asos qilib olinadi — profil sahifasi
  allaqachon stats ko'rsatadi, Gamer Card unga ELO/tier/W-D-L qatlamini qo'shadi.
- `/blacklist` public sahifa (qidiruv: username/telefon/Konami ID) + `/admin/blacklist`.
- `ListingStatus`ga `BLOCKED` qo'shiladi; public querylar uni chiqarib tashlaydi.

### 5.5. Infra (config-only)
- Shared external docker network (`efbazaar-net`) — Chempionat compose unga qo'shiladi,
  Kafka va auth-service'ga shu orqali yetadi.
- efBazaar nginx: `/api/tournaments/**` → auth verify subrequest → chempionat-api
  (+ `X-Internal-Secret`). Routing container nomi orqali — host port ochilmaydi.
- **Diqqat:** 8086 endi band (smart-admin-worker). Chempionat-api'ga host port kerak bo'lsa —
  8087; lekin default holatda shart emas.
- Nginx'da `/api/tournaments/**` prefiksi trade-service'ning `/api/v1/trades/**` bloki bilan
  to'qnashmaydi — tekshirildi.

---

## 6. Ishlar tartibi va bog'liqliklar

| # | Ish | Repo | Bog'liq |
|---|---|---|---|
| 1 | Identity bridge (4.1) + Dual auth (4.2) + auth summary endpoint (5.1) + infra (5.5) | ikkalasi | — |
| 2 | ELO engine (4.3) + Kafka eventlar (4.4) | Chempionat-X | 1 |
| 3 | Gamer Card: projection + API + UI + PNG (5.2, 5.4) | ef-bazaar | 2 |
| 4 | Trust/Blacklist (5.3, 5.4) | ef-bazaar | 1 (parallel bo'ladi) |
| 5 | Blacklist enforcement Chempionat'da (4.5) | Chempionat-X | 4 |
| 6 | `/tournaments` frontend (5.4) | ef-bazaar | 1 |
| 7 | Bot lag-break avtoshikoyati (4.6) | Chempionat-X | 4 |

Har bir band alohida PR(lar); ikkala repo o'z CI'si bilan mustaqil deploy bo'ladi
(efBazaar'da selective path-based deploy allaqachon bor).

---

## 7. Buzilmaydigan qoidalar (eslatma)

- Flyway V-migratsiyalar **append-only** — merge bo'lgan faylga tegish taqiqlangan
  (efBazaar'da 3 marta prod sindirgan). Yangi migratsiya = yangi V raqam.
- `sellerId`/`userId` hech qachon request body'dan olinmaydi — faqat `X-User-Id`.
- Servislar bir-birining DB'siga to'g'ridan ulanmaydi — faqat internal API yoki Kafka.
- Header-auth faqat `X-Internal-Secret` bilan birga ishonchli.
- Kafka eventlarda idempotency key majburiy.
- Store link (Google Play / Game Center) — salbiy atribut, ishonch belgisi sifatida
  ko'rsatilmaydi (transfer faqat Konami ID'ni ko'chiradi).

---

## 8. Ochiq savollar (implementatsiyadan oldin hal qilinadi)

1. **Konami ID yig'ish nuqtasi** — savdo tomoni hal bo'ldi (2026-07 rev.): escrow flow
   Konami identifikatorlarini verified holda beradi (5.3-band). Ochiq qolgan qismi: turnir
   qatnashchilaridan Konami ID so'raladimi (lag-break qilganlarni yangi akkauntda ushlash uchun)?
2. **Penaltidagi g'alaba ELO'da** — to'liq g'alabami? Hozirgi default: ha, lekin K/2.
3. **"Duel" (turnirdan tashqari 1v1 challenge)** — Chempionat-X'da hozir yo'q. ELO engine
   buni qo'llaydigan qilib quriladi (match source: TOURNAMENT | DUEL), lekin duel featuresi
   o'zi bu planga kirmagan — alohida faza.
4. **Bot unifikatsiyasi** — ikkala Telegram bot hozircha alohida ishlaydi; birlashtirish
   alohida katta ish.
5. **Tier badge dizayni** va Gamer Card vizual maketi — dizayn bosqichida.
