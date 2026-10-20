# recommendation-service

"Kimga qaysi akkount mos" — bozorning **Mening qiziqishlarim** lentasi, player filtri (match),
dream team va card interest. Faqat **tartiblaydi**: qaysi e'lon, qanday tartibda, nega mos.
Filtr, sahifalash va e'lon ko'rinishi marketplace'da (`POST /api/v1/listings/ranked`);
ikkalasini frontend birlashtiradi. marketplace'ni HTTP orqali chaqirmaydi.

Dizayn: [spec](../../docs/superpowers/specs/2026-09-30-recommendation-service-design.md).

| | |
|---|---|
| Port | 8083 |
| Public yo'l | `/api/rec/**` → `/api/**` (auth ixtiyoriy; mehmonga lenta bo'sh) |
| DB | `RECOMMENDATION_DB_NAME` (`recommendation_db`), Hikari 4 |
| Redis | lenta snapshot'i `rec:feed:{userId}:{profileHash}` (30 daq.); card interest `card-interest:*` (marketplace bilan umumiy) |
| Kafka | o'qiydi: `listing-snapshot`, `card-snapshot`, `like-toggled` (group `recommendation-service`); xato → `<topic>.DLT` |

## API (`/api/v1/...`)

| Endpoint | Javob |
|---|---|
| `GET /feed[?profileHash=]` | `{ empty, profileHash, ids }` — sessiya snapshot'idagi to'liq tartib (≤1000). Keyingi sahifalarda birinchi javobdagi `profileHash` qaytariladi |
| `GET /feed/details?ids=` | `{ id: MatchDetails }` — joriy profil bo'yicha "nega mos" (≤100 ID) |
| `GET /match?matchCard=..&matchStrictness=..` | `{ ids }` — player filtri, chegaradan o'tgan ACTIVE e'lonlar (≤1000). Eski `dream_team`/`dream_team_min_match` ham qabul qilinadi |
| `GET /match/details?ids=..&matchCard=..` | `{ id: MatchDetails }` (≤100 ID) |
| `GET /match/{listingId}?matchCard=..` | `MatchDetails`; projection'da yo'q e'lon → 404 |
| `GET/POST /dream-teams`, `GET/PUT /dream-teams/{id}`, `PUT /dream-teams/me` | marketplace'dagi shartnoma 1:1 (login shart) |
| `POST /card-interest/apply` | marketplace'dagi shartnoma 1:1; login qilgan bo'lsa `user_card_interest` ga ham yoziladi |
| `GET /card-interest/counts?ids=` | `{ efhubId: { days7, days30 } }` — faqat `ROLE_ADMIN` (≤200 ID) |

`matchCard` formati `efhubId:playerId:N|P`; `matchStrictness` 1..10 (1 = istalgan moslik).
Ball: exact karta 1.0, shu o'yinchining boshqa kartasi 0.75; og'irlik N=1, P=3.
Tartib: `score DESC, value_score DESC NULLS LAST, listing_id` (marketplace'da ikkinchi kalit
`created_at` edi — projection'da yo'q va "eng yangi tepada" tartibidan voz kechilgan).

## Lenta

Profil so'rov paytida yig'iladi: dream team sloti (1 yoki 3) + like bosilgan e'londagi har karta (+1)
+ oxirgi 30 kundagi card interest (+1); bir xil karta yig'iladi; faol META × 1.5; eng og'ir 50 ta.
E'lon bali `Σ og'irlik × kredit`, tartib `ball DESC, value_score DESC NULLS LAST, id`.
Chiqariladi: ACTIVE bo'lmagan, o'z e'loni, allaqachon like bosilgan, ball 0.
`profileHash` = profilning sha256; o'sha hash bilan kelgan so'rov snapshot tirik bo'lsa aynan o'sha
ro'yxatni oladi — sessiya ichida tartib o'zgarmaydi. Redis o'chiq bo'lsa har so'rov joyida hisoblanadi.

Konfiguratsiya: `app.recommendation.feed.*` (`REC_FEED_MAX_IDS`, `REC_FEED_SNAPSHOT_TTL`,
`REC_FEED_META_BOOST`, `REC_FEED_PROFILE_LIMIT`, `REC_FEED_INTEREST_WINDOW`).

## Jadvallar

| Jadval | Manba |
|---|---|
| `listings_view`, `listing_cards_view` | `listing-snapshot` (kartalar har snapshot'da to'liq almashadi) |
| `cards_view` | `card-snapshot` |
| `user_likes` | `like-toggled` (unlike → `liked = false`) |
| `dream_teams` | o'zi (marketplace'dan bir martalik ko'chirish — pastda) |
| `user_card_interest` | `POST /card-interest/apply` (login qilgan); 90 kun |
| `consumed_events` | barcha consumerlar; 30 kun |

Takror va tartibsiz xabar: `consumed_events` (aynan shu xabar) + `version` (eski holat) to'sadi.
Xato: o'qib bo'lmaydigan yoki noto'g'ri xabar (JSON, kalit yo'q, ustun cheklovi) darhol `<topic>.DLT` ga;
DB/tarmoq uzilishi esa 1 s → 60 s oraliq bilan cheksiz qayta uriniladi (to'g'ri snapshot yo'qolmaydi).
A bosqichidan oldingi version'siz `like-toggled` xabarlari WARN bilan o'tkaziladi.
**DLT bo'sh emas → sababini ko'ring, tuzatgach replay** (DLT'ni hech kim o'qimaydi).
Tozalash — `RetentionJob` (`REC_RETENTION_CRON`, default `0 30 3 * * *` UTC).

## Env

`POSTGRES_*`, `RECOMMENDATION_DB_NAME`, `REDIS_*`, `KAFKA_BOOTSTRAP_SERVERS`,
`CARD_INTEREST_HMAC_SECRET` (**shart**, marketplace bilan bir xil — bo'sh bo'lsa servis ishga tushmaydi),
`APP_DEBUG_ERRORS`, `LOG_KAFKA_FORWARD_ENABLED`.

## Ehtiyot bo'ling

- **Replay'dan oldin `cards_view` bo'sh** — har `matchCard` va dream team saqlash 400 qaytaradi.
  Frontend'ni ulashdan oldin replay va tekshiruv (pastda) shart.
- **Eski baza.** 2026-08-23 da o'chirilgan eski recommendation-service ham `recommendation_db` ni ishlatgan.
  Unda begona jadval qolgan bo'lsa Flyway V1 qo'llanmaydi (`baseline-on-migrate` ataylab o'chiq) va
  servis crash-loop'ga tushadi; `deploy.sh` buni logda ko'rsatadi. Tekshirish:
  `docker exec efbazaar-postgres psql -U efbazaar -d recommendation_db -c '\dt'`.
  Jadvallar keraksiz ekaniga ishonch hosil qilingach (va faqat shunda) bazani qayta yaratish:
  `dropdb` + `createdb` — bu qo'lda, ma'lumotni yo'qotadigan amal.
- **HMAC secret** marketplace bilan farq qilsa card interest dedupe va 30 kunlik sonlar ikkiga bo'linadi.
- Ulanish byudjeti — `backend/auth-service/src/main/resources/application.yml` izohida.

## Birinchi deploy (runbook)

1. Deploy (`recommendation-service` qorong'i: frontend hali chaqirmaydi). Loglarda Flyway V1 va
   `Started RecommendationApplication` borligini tekshiring.
2. Replay — marketplace barcha e'lon, karta va like'ni qayta yuboradi:
   `docker exec efbazaar-marketplace wget -qO- --post-data='' --header="X-Internal-Secret: $INTERNAL_API_SECRET" http://localhost:8082/internal/marketplace/v1/rec/replay`
3. Bir necha daqiqadan keyin: `scripts/rec-verify-projection.sh` — hammasi `OK`.
4. Dream team'lar: `scripts/rec-copy-dream-teams.sh` (C deploy'idan oldin yana bir marta).
5. Player filtri: bir nechta haqiqiy `matchCard` bilan `scripts/rec-compare-match.sh` — `OK`.
6. **Frontend (C) deploy'idan oldin:** 3-qadam `OK`, `scripts/rec-copy-dream-teams.sh` yana bir marta
   (B→C oralig'ida marketplace'da saqlangan jamoalar), keyin frontend.

## Free/Pro — payment projection (A bosqich)

`efbazaar.payment.subscription-changed` va `efbazaar.payment.plan-entitlements`
Kafka topiclari servisning o‘z DB projectionini to‘ldiradi. Payloadlar avvalgi
maydonlarga qo‘shimcha `version` (musbat, entity bo‘yicha monoton) va
`idempotencyKey` oladi; `occurredAt` — manbada snapshot olingan vaqt.
Eski payloadlar deserializatsiya qilinadi, ammo version bo‘lmasa huquq bermaydi;
payment startup/soatlik replay yangi formatdagi holatni tiklaydi.

`plan_projection_state` versiya va manba vaqtini, `plan_event_receipts` qabul
qilingan kalitlarni saqlaydi. Versiya CAS/upsert va projection o‘zgarishi bitta
DB tranzaksiyasida: parallel, duplicate yoki kechikkan event yangiroq holatni
bosmaydi. `plan_entitlement_view` to‘liq almashtiriladi, o‘chirilgan capability
qayta tiklanmaydi. `user_plan_view` STANDARD downgrade qatorini ham saqlaydi:
eski PRO eventi obunani tiriltira olmaydi. Qiymat va freshness metadata bitta SQL statement/MVCC snapshotdan o‘qiladi;
oldingi JPA cache yangiroq metadata bilan aralashmaydi. Manba vaqti 24 soatdan eski yoki
kelajakda 60 soniyadan uzoq bo‘lsa, projection pullik ruxsat uchun tayyor emas.

`plan/PlanCapabilities.capability(userId, key)` ichki lookupi `AVAILABLE`,
`DENIED` yoki `UNAVAILABLE` qaytaradi. Yetishmagan yoki eskirgan obuna/plan
snapshoti `UNAVAILABLE`; mavjud yangi snapshotda kalit yo‘qligi `DENIED`.
Faqat `AVAILABLE` va aniq `null` qiymat `unlimited()` beradi. D/E/F dagi yangi
pullik amallar shu readiness natijasini tekshirishi kerak. A bosqichida yangi
pullik endpoint, kuzatuv, statistika yoki savdo funksiyasi ochilmaydi.

B bosqich payment snapshotlari `mailbox.total_slots` va `mailbox.custom_slots`ni
alohida grant sifatida saqlaydi; `mailbox.slots` tarixiy random-only kalit, totalga
alias emas. Wire kontrakt regressiyasi 10 total/2 custom/5 legacy qiymatlarini
aralashtirmasdan qabul qilish va legacy replay yangi totalni almashtirmasligini tekshiradi.


C bosqichda subscription eventning optional `lastPaidExpiresAt` maydoni dekodlanadi.
Bu tarixiy pochta muddati; amaldagi `expiresAt` yoki pullik imkoniyatlar o‘rniga
ishlatilmaydi. Free/grace foydalanuvchiga yangi Pro qidiruv yoki alert grant bermaydi.

## D — Saqlangan qidiruvlar

`/api/v1/saved-searches` login talab qiladi; user ID faqat nginx principalidan olinadi.
Frontend yo‘li `/api/rec/v1/saved-searches`.

| Endpoint | Shartnoma |
|---|---|
| `GET /saved-searches` | `{items,limit,immediate,available}`; priority bo‘yicha tartiblangan |
| `GET /saved-searches/{id}` | Faqat egasining qidiruvi; begona yoki yo‘q ID → 404 |
| `POST /saved-searches` | `{name,matchCard,matchStrictness,minPrice,maxPrice,notificationsEnabled?}` → 201 |
| `PUT /saved-searches/{id}` | Shu mezonlarni almashtiradi; `notificationsEnabled` berilmasa saqlanadi |
| `PATCH /saved-searches/{id}` | `{paused?,notificationsEnabled?}` |
| `DELETE /saved-searches/{id}` | 204 |
| `PUT /saved-searches/priorities` | `{ids:[...]}` — barcha o‘z IDlari aynan bir martadan; tartib Free’da qoladigan qidiruvni belgilaydi |

Item: `{id,name,matchCard,matchStrictness,minPrice,maxPrice,paused,pauseReason,priority,notificationsEnabled,createdAt}`.
`pauseReason`: `USER`, `LIMIT`, `UNAVAILABLE` yoki `null`. Priority 1 dan boshlanadi.
Qidiruv v1 faqat karta va narx mezonlarini qo‘llaydi; platforma, text va dynamic
attribute maydonlari 400 bilan rad etiladi. Kamida bitta karta yoki narx chegarasi
kerak. Kartalar mavjud `efhubId:playerId:N|P` formati va 1–10 strictness orqali
mavjud `MatchEngine` bilan hisoblanadi. Narx chegaralari inclusive, manfiy emas,
eng ko‘pi ikki kasr xonasiga ega. Bir xil mezonlar boshqa nom bilan takroran
saqlanmaydi (`409 saved_search_duplicate`).

Payment grantlari `watch.search_limit` (Free 1, Pro 5, STAFF null = cheksiz) va
`watch.immediate` (`false` = kunlik jamlanma, `true` = darhol) orqali olinadi.
Yo‘q/eskirgan/noto‘g‘ri projection yangi yaratish, resume, opt-in va mezonni
almashtirish uchun `503 plan_projection_unavailable` beradi. Ro‘yxat va o‘chirish,
pause hamda opt-out saqlanadi. Ro‘yxatda `available=false` va `UNAVAILABLE`
ko‘rinadi. Owner bo‘yicha PostgreSQL transaction advisory lock parallel
allocationni limit ichida ushlab turadi; pause qilish yangi saqlash slotini
bo‘shatmaydi. `409 saved_search_limit` limit tugaganini bildiradi.
Downgrade’da priority bo‘yicha ortiqcha qidiruvlar `LIMIT` pauzaga tushadi,
ma’lumot o‘chmaydi; priorityni o‘zgartirish Free’da qaysi qidiruv faol qolishini
belgilaydi. Qo‘lda `USER` pauza avtomatik bekor qilinmaydi.

V3 jadvallari: `saved_searches`, `search_notification_intents`,
`search_notification_reasons`. Watch mezoni/opt-in/pause o‘zgarganda generation
va publication baseline yangilanadi: qayta yoqish oldingi navbatni tiriltirmaydi.
Listing projectioniga optional `publishedAt` va `publicationVersion` qo‘shildi.
Legacy snapshotda ular yo‘q bo‘lishi mumkin; relay `occurredAt` hech qachon
publication vaqti hisoblanmaydi. Eski/metadata yo‘q/version 0 birinchi snapshot
faqat baseline. Ishonchli musbat publication watch baselinedan keyin bo‘lsa,
birinchi ko‘rilgan listing ham mos kelishi mumkin. Kelajakdagi publication
vaqti alert bermaydi. Projection `version` CAS va publication monotonligi
old replay/tahrir orqali xabarlarni takrorlamaydi.

Moslik tekshiruvi, listing projectioni/kartalari va candidate intent bir DB
tranzaksiyasida yoziladi. Bitta `(user,listing,publicationVersion)` uchun bitta
intent barcha mos qidiruv sabablarini jamlaydi. `SearchCandidateDispatcher`
DB pending qatorlarini `FOR UPDATE SKIP LOCKED` bilan olib, Kafka broker ackdan
keyin dispatched deb belgilaydi; xatoda bounded exponential backoff bilan
pending qoladi. Process to‘xtasa qayta ishga tushganda davom etadi. Broker ack
va DB commit oralig‘idagi replay marketplace idempotency kaliti bilan to‘siladi.

Topic `efbazaar.recommendation.watch-candidate` payloadi:
`{idempotencyKey,intentId,userId,listingId,publicationVersion,publishedAt,reasons:[{watchId,label}],occurredAt}`.
`idempotencyKey=search:{userId}:{listingId}:{publicationVersion}`. Marketplace
umumiy durable in-app/Telegram delivery, Free Asia/Samarkand 19:00 jamlanma
va authoritative listing status/owner tekshiruvini boshqaradi.

Yuborishdan oldin marketplace `POST /internal/rec/v1/watches/authorize` chaqiradi:
`X-Internal-Secret: INTERNAL_API_SECRET` va
`{intentId,userId,listingId,publicationVersion}` →
`{eligible,reasons:[{watchId,label}],deliveryMode:IMMEDIATE|DIGEST}`.
Bo‘sh secret yoki noto‘g‘ri header → 403. Intent aynan shu user/listing/publicationga
tegishli bo‘lishi, joriy watch opt-in/generation/limit, match va yangi entitlementlar
hali ruxsat berishi shart; stale entitlement → 503 (marketplace retry qiladi).
Recognized UNAVAILABLE paytida mos non-USER LIMIT qidiruv candidate’lari ham
saqlanadi; bu yetkazishga ruxsat bermaydi. Automatic renewal/capability resume
mavjud generation’ni saqlaydi va baseline’ni user plan/expiry hamda
`watch.search_limit` effective change vaqtlaridan kechrog‘iga ko‘taradi.
Shu sabab renewal’dan oldingi publication rad, undan keyingi durable candidate
GET/authorize orqali qayta tiklanadi. Active→LIMIT hali generation’ni bekor qiladi;
explicit priority/delete promotion esa joriy baseline va yangi generation oladi.
Criteria, user pause/opt-in va delete avvalgi navbatni tiriltirmaydi.
Bir xil hourly user/catalog replay `updated_at` effective vaqtini o‘zgartirmaydi;
freshness `plan_projection_state.occurred_at` orqali yangilanadi. To‘liq snapshotda
yo‘qolgan grantlar o‘chiriladi; barcha qiymat/source vaqtlari bitta SQL snapshotidan olinadi.
Recommendation marketplace HTTP yoki uning DBsini chaqirmaydi.

Env: `INTERNAL_API_SECRET` marketplace bilan bir xil; bo‘sh bo‘lsa internal
ruxsat endpointi yopiq. Optional `app.recommendation.watch.dispatch-delay-ms`
default 1000 ms. Pending intent va broker backoff durable holatlari bazada
saqlanadi; absolute Telegram exactly-once bu servis tomonidan va’da qilinmaydi.
