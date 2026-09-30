# recommendation-service — dizayn

Sana: 2026-09-30 · Holat: tasdiqlangan dizayn, reja yozilishi kutilmoqda
Bog'liq: [transactional outbox](2026-09-30-transactional-outbox-design.md) — avval shu bajariladi.

## 1. Maqsad

Hozir "kimga qaysi akkount mos" mantig'i marketplace-service ichida uch bo'lak bo'lib yotibdi
(card match, dream team, card interest). U marketplace'ga kartalar u yerda turgani uchun
qurilgan edi. Maqsad:

1. Bu mantiqni to'liq alohida `recommendation-service` ga ajratish — marketplace bilan faqat
   Kafka va aniq HTTP shartnomalar orqali bog'lanadi.
2. Bozor bo'limini ikki tabga bo'lish:
   - **Mening qiziqishlarim** (default) — har foydalanuvchi uchun shaxsiy tartib: dream team,
     like bosilgan akkountlardagi futbolchilar, qiziqish bildirilgan kartalar. Eng mosi tepada.
   - **Katta bozor** — hamma uchun bir xil "qiymat" tartibi (narx + kartalar kuchi + META).
   - Ikkalasida ham "eng yangi e'lon tepada" tartibi yo'q.

Muvaffaqiyat mezonlari:
- Marketplace'da match / dream team / card interest kodi qolmaydi (4-bosqichdan keyin).
- Player filtri (`matchCard`) natijalari ko'chirishdan oldin va keyin bir xil.
- recommendation o'chsa bozor ishlashda davom etadi ("Katta bozor"ga o'tadi).
- Sahifalash sessiya ichida barqaror: 3-sahifaga o'tganda akkountlar takrorlanmaydi va tushib qolmaydi.

## 2. Ko'lam

**Kiradi:** 1:1 ko'chirish (match, dream team, card interest), like + dream team + interest
asosidagi shaxsiy lenta, "Katta bozor" `value_score` tartibi, marketplace outbox, frontend
tablari va barcha chaqiruvlarni yangi servisga ulash, marketplace'ni tozalash.

**Kirmaydi:** ko'rishlar / chat / xarid tarixiga asoslangan signallar, ML, "o'xshash akkountlar"
bloki, bot orqali tavsiya, payment-service'ni outbox'ga o'tkazish.

## 3. Mas'uliyat taqsimoti

| Kimga tegishli | recommendation-service | marketplace-service |
|---|---|---|
| Dream team (`/dream-teams`) | ✅ ko'chadi (`dream_teams` bilan) | ❌ o'chiriladi |
| Card match — ball, exact/alternate/missing | ✅ ko'chadi | ❌ o'chiriladi |
| Card interest (Redis sanagichlar) | ✅ ko'chadi | ❌ o'chiriladi |
| "Mening qiziqishlarim" tartibi | ✅ yangi | — |
| Listing / karta projection | ✅ faqat o'qish uchun nusxa | manba |
| Karta katalogi va META | nusxa | ✅ egasi (admin, efhub sync) |
| "Katta bozor", `value_score` | — | ✅ yangi |
| Filtrlar, sahifalash, e'lonni ko'rsatish | — | ✅ (`POST /listings/ranked`) |

Qoida: **recommendation faqat tartiblaydi** (qaysi e'lon, qanday tartibda, nega).
Filtr (narx, platforma, divizion, coin, dinamik atributlar) va `ListingResponse` — marketplace.
Recommendation marketplace'ni HTTP orqali chaqirmaydi; birlashtirishni frontend qiladi.

## 4. recommendation-service

| | |
|---|---|
| Stack | Java 21, Spring Boot 3, Flyway, Kafka, Redis (boshqa servislar shabloni) |
| Port | 8083 |
| Public yo'l | `/api/rec/**` → `/api/**` (nginx; anonim o'tadi — mehmonga bo'sh lenta) |
| DB | `recommendation_db` (serverda saqlanib qolgan; yo'q bo'lsa qo'lda yaratiladi), env `REC_DB_NAME` |
| Paket | `uz.efbazaar.recommendation.<layer>` |
| Xotira | `mem_limit` ~300m; Hikari pool kichik (ulanish byudjeti hozir 32/50) |

### 4.1 Jadvallar

| Jadval | Ustunlar | Manba |
|---|---|---|
| `listings_view` | `listing_id` PK, `seller_id`, `status`, `price`, `value_score`, `version`, `updated_at` | `listing-snapshot` |
| `listing_cards_view` | `listing_id`, `efhub_id`, `player_id`, PK(`listing_id`,`efhub_id`); indeks `player_id` | `listing-snapshot` (snapshot kelganda to'liq almashtiriladi) |
| `cards_view` | `efhub_id` PK, `player_id`, `type`, `overall_rating`, `meta_tier`, `meta_priority`, `active_from`, `active_until`, `version` | `card-snapshot` |
| `user_likes` | PK(`user_id`,`listing_id`), `liked`, `version` | `like-toggled` (unlike → `liked = false`; `version` eski event'ni to'sadi) |
| `dream_teams` | marketplace'dagi bilan bir xil sxema (bitta foydalanuvchiga bitta, JSONB slotlar) | ko'chiriladi |
| `user_card_interest` | PK(`user_id`,`efhub_id`), `last_at` | `POST /card-interest/apply` (faqat login qilgan) |
| `consumed_events` | `idempotency_key` PK, `consumed_at` | barcha consumerlar |

**`user_card_interest` — maxfiylik o'zgarishi.** Hozirgi card interest faqat anonim, HMAC'langan
agregat saqlaydi. Shaxsiy lenta "qaysi o'yinchiga qiziqqan" ni bilishi kerak, shuning uchun login
qilgan foydalanuvchi uchun alohida jadval qo'shiladi. Saqlash muddati 90 kun (mavjud agregat bilan
bir xil), kunlik tozalash job'i. Agregat sanagichlar avvalgidek anonim qoladi.

### 4.2 API (`/api/v1/...`)

| Endpoint | Javob |
|---|---|
| `GET /feed?profileHash=` | `{ empty, profileHash, ids: [...] }` — sessiya snapshot'idagi **to'liq** tartiblangan ID ro'yxati (1000 tagacha). Sahifalash va filtr marketplace'da (5.5) |
| `GET /feed/details?ids=` | Har ID uchun `MatchDetails` (percent, exact/alternate/missing sonlari va ID'lari) — kartada "nega mos" ni ko'rsatish uchun |
| `GET /match?matchCard=..&matchStrictness=..` | Player filtri, 1:1: bal chegarasidan o'tgan ID'lar tartib bilan (1000 tagacha) |
| `GET /match/details?ids=..&matchCard=..` | Sahifadagi ID'lar uchun `MatchDetails` |
| `GET /match/{listingId}?matchCard=..` | Bitta e'lon uchun `MatchDetails` |
| `GET/POST /dream-teams`, `GET/PUT /dream-teams/{id}`, `PUT /dream-teams/me` | Hozirgi shartnoma 1:1 |
| `POST /card-interest/apply` | Hozirgi shartnoma 1:1 (`X-Interest-Network` headeri ham) |
| `GET /card-interest/counts?ids=` | Admin kartalar sahifasi: `{efhubId: {days7, days30}}` (`X-User-Roles` da `ROLE_ADMIN`) |

`matchCard` qiymat formati va `matchStrictness` semantikasi hozirgi `MatchRequestParser` bilan bir xil.

### 4.3 Match engine

`JdbcListingMatchRepository` SQL'i `listings`/`listing_cards` o'rniga `listings_view`/`listing_cards_view`
ustida 1:1 ko'chadi: exact karta kredit **1.0**, shu futbolchining boshqa kartasi **0.75**, yo'q **0**;
og'irlik `Importance` (NORMAL=1, PRIORITY=3); `score = Σ(w·credit)/Σw`; strictness chegarasi
avvalgidek. Faqat `status = ACTIVE`.

### 4.4 "Mening qiziqishlarim" — profil va ball

**Profil** (so'rov paytida SQL bilan yig'iladi, alohida saqlanmaydi) — `(efhub_id, player_id) → og'irlik`:

| Signal | Og'irlik |
|---|---|
| Dream team sloti | `Importance` (1 yoki 3) |
| Like bosilgan e'londagi karta | +1 har bir like bosilgan e'lon uchun |
| `user_card_interest` (oxirgi 30 kun) | +1 |

Bir xil `efhub_id` og'irliklari qo'shiladi. Karta hozir faol META bo'lsa (`meta_tier = META` va
`active_from ≤ now < active_until`) og'irlik `× META_BOOST` (default 1.5). Profil og'irlik bo'yicha
eng katta 50 ta kriteriy bilan cheklanadi.

**E'lon bali:** match engine'ning o'zi, lekin normallashtirilmagan —
`earned = Σ w·credit` (ko'proq mos futbolchi = yuqoriroq). Tartib:
`earned DESC, value_score DESC, listing_id`.

**Nomzodlardan chiqariladi:** `status ≠ ACTIVE`, foydalanuvchining o'z e'lonlari (`seller_id`),
allaqachon like bosgan e'lonlari, `earned = 0`.

Profil bo'sh yoki foydalanuvchi mehmon → `empty: true`.

### 4.5 Barqaror sahifalash

- `profileHash = sha256(tartiblangan "efhub_id:og'irlik" ro'yxati)`.
- Birinchi so'rovda tartiblangan ID'lar (1000 tagacha) Redis'ga: `rec:feed:{userId}:{profileHash}`, TTL 30 daqiqa.
  Keyingi sahifalar shu ro'yxatdan kesiladi.
- Frontend birinchi javobdagi `profileHash` ni keyingi sahifalarda qaytarib yuboradi; o'sha kalit
  Redis'da bo'lsa aynan shu ro'yxat qaytadi — sessiya ichida tartib o'zgarmaydi.
- Profil o'zgarsa (like, dream team, interest) hash o'zgaradi → sahifa yangilanganda (hash'siz so'rov) yangi tartib.
- Yangi e'lonlar snapshot TTL tugagach ko'rinadi.

### 4.6 Card interest

`CardInterestService` 1:1 ko'chadi. Redis umumiy bo'lgani uchun o'sha `card-interest:*` kalitlari va
o'sha `CARD_INTEREST_HMAC_SECRET` bilan davom etadi — 30 kunlik tarix va dedupe yo'qolmaydi.
Secret bo'sh bo'lsa servis ishga tushmaydi (hozirgidek). Karta ID validatsiyasi `cards_view` orqali.

## 5. marketplace-service o'zgarishlari

### 5.1 Outbox (kutubxona) va snapshot belgilari

**Bog'liqlik:** bu bo'lim [transactional outbox](2026-09-30-transactional-outbox-design.md) kutubxonasining
snapshot rejimidan foydalanadi — outbox ishi (kamida 1- va 5-bosqichi) recommendation'dan oldin tugaydi.

Snapshot'lar Java'dagi bitta nuqtadan emas, **Postgres trigger'laridan** belgilanadi: `TrustService`
(`retagBySellerAndStatus`) va `user-deleted` consumer'i bulk `UPDATE` qiladi — ular entity'ni yuklamaydi
va har qanday Java "hook" ini chetlab o'tadi. Trigger esa istalgan yo'lni (kelajakdagi kod va qo'lda SQL'ni ham) ushlaydi.

| Trigger | Qachon | Belgi |
|---|---|---|
| `listings` AFTER INSERT / UPDATE OF `status`, `price`, `seller_id`, `value_score` | har qator | `('listing', id)` |
| `listing_cards` AFTER INSERT / DELETE | har qator | `('listing', listing_id)` |
| `listing_likes` AFTER INSERT / DELETE | har qator | `('like', user_id || ':' || listing_id)` |

Belgi `outbox_snapshot_pending` ga shu tranzaksiya ichida, `ON CONFLICT DO NOTHING` bilan yoziladi.
Relay belgini olib, `SnapshotSource.build` orqali **hozirgi** holatni o'qiydi — shuning uchun
`saveWithCardInventory` dagi "e'lon saqlandi, kartalar hali yozilmadi" oralig'i ham muammo emas.

**Kartalar** `efbazaar` bazasida — trigger va atomiklik yo'q. Kod `efbazaar` commit'idan keyin darhol
`outbox.markSnapshot("card", efhubId)` chaqiradi (kunlik sync'dagi yangi kartalar, admin META o'zgarishi,
kunlik META chegarasi job'i). Qisqa oraliq qabul qilinadi: META o'zgarishi tegishli e'lonlarning
`value_score` ini qayta hisoblaydi va ular `listings` trigger'i orqali atomik snapshot oladi; zaxira — replay.

### 5.2 Snapshot event'lari

`efbazaar.marketplace.listing-snapshot` — kalit `listingId`, source `listing`:
```
{ idempotencyKey, listingId, sellerId, status, price, valueScore,
  cards: [{ efhubId, playerId }], version, occurredAt }
```

`efbazaar.marketplace.card-snapshot` — kalit `efhubId`, source `card`:
```
{ idempotencyKey, efhubId, playerId, type, overallRating,
  metaTier, metaPriority, activeFrom, activeUntil, version, occurredAt }
```

`efbazaar.marketplace.like-toggled` — kalit `listingId`, source `like` (mavjud topic, hozir consumer'i yo'q):
```
{ listingId, userId, liked, version, occurredAt }   // liked = hozir listing_likes da qator bormi
```
`LikeService` endi like-toggled'ni to'g'ridan-to'g'ri yubormaydi — faqat trigger + relay.

`version` — `outbox_snapshot_version_seq` dan (monoton). Consumer: saqlangan `version` dan kichik yoki
teng bo'lsa e'tiborsiz. `idempotencyKey` = `<source>:<entityId>:<version>`.

Mavjud `listing-created/updated/deleted`, `cards-added` tegilmaydi.

### 5.3 Replay

`POST /internal/marketplace/v1/rec/replay` (`X-Internal-Secret`): barcha e'lonlar, kartalar va
`listing_likes` qatorlari uchun belgi qo'yadi (`markSnapshot`) — relay ularni odatdagidek yuboradi.
Birinchi deploy va qo'lda tuzatish uchun. Kunlik reconcile yo'q.

### 5.4 "Katta bozor" — `value_score`

```
karta_ball     = max(0, overall_rating − 80) / 20 × tier_koef
tier_koef      = NORMAL: 1.0 | faol META: 2.0 + 0.25 × meta_priority
kartalar_kuchi = min(1, Σ karta_ball / KARTA_CAP)                       KARTA_CAP = 15
narx_ulushi    = min(1, ln(narx / 5 000) / ln(NARX_CAP / 5 000))         NARX_CAP = 50 000 000
value_score    = 0.5 × narx_ulushi + 0.5 × kartalar_kuchi
```
Barcha sonlar `application.yml` da. `listings.value_score` ustuni + indeks (yangi V-migratsiya;
mavjud qatorlar startup backfill'i bilan to'ldiriladi).

Qayta hisoblash: e'lon saqlanganda; admin META o'zgartirganda yoki muddatini tugatganda (shu
`efhub_id` li e'lonlar); kunlik job — `active_from`/`active_until` chegarasini kesib o'tgan kartalar.
Qayta hisoblangan e'lon yangi `listing-snapshot` chiqaradi.

`GET /listings?sort=value` — `value_score DESC, id`.

### 5.5 `POST /api/v1/listings/ranked`

```
{ ids: [uuid, ...] (≤1000, tartibli), filters: {...ListingFilter}, page, size }
```
Mavjud `ListingSpecifications` filtrlari qo'llanadi, tartib `array_position(ids, id)` bilan saqlanadi,
`ACTIVE` bo'lmaganlar tushib qoladi, sahifalanadi. Javob — oddiy `PageResponse<ListingResponse>`
(`likedByMe` va boshqa ko'ruvchiga xos maydonlar bilan).

## 6. Frontend

- Bozor sahifasida tablar: **Mening qiziqishlarim** (default) va **Katta bozor**. Tanlangan tab URL'da.
- Mening qiziqishlarim: `GET /api/rec/v1/feed[?profileHash=]` → `ids` → `POST /api/marketplace/v1/listings/ranked`
  (joriy filtrlar va sahifa bilan) → `GET /api/rec/v1/feed/details?ids=` (sahifadagi ID'lar) → birlashtirish.
  `empty: true` yoki recommendation xatosi → Katta bozor ochiladi (xato bo'lsa kichik izoh).
- Katta bozor: `GET /api/marketplace/v1/listings?sort=value` (+ filtrlar).
- Player filtri faol bo'lsa (har ikki tabda): `GET /api/rec/v1/match` → `ranked` → `GET /api/rec/v1/match/details` → birlashtirish.
  recommendation xato bersa — xato holati; filtrlanmagan ro'yxat ko'rsatilmaydi.
- E'lon sahifasi match izohi, dream team, card interest, admin talab sonlari → `/api/rec/v1/...`.
- Barcha recommendation chaqiruvlari bitta `rec-*` klient moduli orqali. nginx'da `/api/rec/` proxy
  (443 va ichki 8080 bloklarida).

## 7. Ko'chirish bosqichlari

Har bosqich alohida deploy bo'ladi va foydalanuvchi uchun hech narsani buzmaydi.

1. **Marketplace tayyorgarligi** (outbox kutubxonasi tayyor bo'lgach): trigger'lar, `listing-snapshot`, `card-snapshot`, like snapshot, replay, `value_score`
   + `sort=value`, `POST /listings/ranked`. Xatti-harakat o'zgarmaydi.
2. **recommendation-service (qorong'i deploy):** servis, consumerlar, match, dream team, card interest,
   feed; nginx `/api/rec/` proxy; compose, CI (`ci.yml`, `build.yml`), `deploy.sh`, Prometheus,
   `KafkaLogForwarder`, README/CLAUDE.md, `docs/kafka-topics.md`, root README.
   Deploy'dan keyin: replay; `dream_teams` bir martalik `psql \copy` skripti (`scripts/`);
   qatorlar sonini solishtirish; bir xil `matchCard` so'rovlari uchun ikki servis tartibini solishtirish.
3. **Frontend:** tablar va barcha chaqiruvlarni yangi servisga ulash.
4. **Tozalash** (3-bosqich prod'da barqaror bo'lgach): marketplace'dan match, dream team, card interest
   kodi va endpoint'lari o'chiriladi; `dream_teams` yangi V-migratsiya bilan drop qilinadi.

## 8. Nosozliklar

| Holat | Xatti-harakat |
|---|---|
| recommendation o'chiq | Mening qiziqishlarim → Katta bozor + izoh. Player filtri → xato holati. Dream team saqlash → toast |
| marketplace o'chiq | Bozor ishlamaydi (bugungidek) |
| Projection eskirgan | `ranked` SOLD/DELETED ni tashlaydi |
| Takroriy / tartibsiz event | `version` va `consumed_events`; like to'plam sifatida |
| Buzilgan xabar | cheklangan qayta urinish → DLT → Telegram log (marketplace `KafkaErrorHandlingConfig` uslubi) |
| Kafka o'chiq | outbox kutadi; `outbox_pending_oldest_seconds > 300` alert |
| Redis o'chiq | feed har sahifani joyida hisoblaydi (barqarorlik yo'qoladi) + WARN; card interest nol qaytaradi |

## 9. Test

AGENTS.md bo'yicha: avval yiqiladigan test, keyin kod; yakunda har ta'sirlangan komponentda to'liq CI tekshiruvi.

**marketplace**
- Trigger IT: rollback → belgi yo'q; commit → belgi bor; bulk `retagBySellerAndStatus` va `user-deleted` bulk UPDATE ham belgi qo'yadi.
- Snapshot to'liqligi IT: e'lonni o'zgartiradigan har yo'l (yaratish, tahrirlash, relist, sold, o'chirish, admin delete/restore,
  `listing-sold` consumer, trust blok/tiklash) snapshot chiqaradi; like/unlike like-toggled chiqaradi; META o'zgarishi card-snapshot chiqaradi.
- `value_score` formulasi unit testlari; META o'zgarishi va muddat chegarasida qayta hisoblash IT.
- `ranked`: tartib saqlanadi, filtrlar qo'llanadi, ACTIVE bo'lmaganlar tushadi, 1000 dan ortiq ID rad etiladi.

**recommendation**
- Match parity: mavjud match testlari oltin test sifatida ko'chiriladi — natija 1:1.
- Consumerlar: idempotentlik, `version` tartibi, unlike, snapshot'da kartalar to'liq almashishi.
- Feed: ball (exact > alternate, META_BOOST, og'irliklar yig'indisi), chiqarib tashlash qoidalari,
  bo'sh profil, profil hash barqarorligi, sessiya o'rtasida like → joriy snapshot o'zgarmaydi.
- Card interest testlari ko'chadi; `user_card_interest` 90 kunlik tozalash.

**frontend (Vitest)**: default tab, `empty`/xato → Katta bozor, player filtri xato holati,
ID tartibini saqlab birlashtirish.

**Prod, 3-bosqichdan oldin:** match natijalarini ikki servisda solishtirish.

## 10. Ochiq savollar

Yo'q — barcha qarorlar brainstorming'da tasdiqlangan. Formula konstantalari (80/20, 2.0, 0.25, 15,
50 mln, 50/50, META_BOOST 1.5, profil 50 kriteriy, snapshot 1000 / 30 daqiqa) konfiguratsiyada
va prod ma'lumotiga qarab sozlanadi.
