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
