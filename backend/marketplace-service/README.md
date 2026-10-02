# marketplace-service

Platformaning eng katta servisi: e'lonlar, akkountlar, chat, like, bildirishnomalar,
karta katalogi, hamkorlik (kanallar), referal, trust (shikoyat va qora ro'yxat),
support chat, qo'llanmalar va bot sozlamalari. Savdoning o'zi (escrow) bu yerda **emas** —
u trade-service'da. Pul esa payment-service'da.

| | |
|---|---|
| Port | 8082 |
| Public yo'l | `/api/marketplace/**` → `/api/**` (anonim ham o'tadi); WebSocket `/ws/chat` |
| DB | `MARKETPLACE_DB_NAME` (Flyway, `V1`–`V75` + `R__`); ikkinchi datasource — `efbazaar` karta katalogi |
| Redis | card interest sanagichlari, chat presence/typing va WebSocket signallari |
| Anonim | Token bo'lmasa nginx identity headerlarni tozalab uzatadi — `X-User-Id` ga ishonishdan oldin null tekshiring |

## Paketlar

| Paket | Vazifasi |
|---|---|
| `controller`, `service`, `repository`, `domain`, `dto`, `mapper` | E'lonlar (listing), chat, like, bildirishnoma, dream team, dinamik atributlar — asosiy domen |
| `account` | Foydalanuvchining akkountlari (`user_accounts`). Akkount e'londan mustaqil yashaydi: e'lon qilinadi (`publish`), savdodan keyin xaridorga ko'chadi. `UserAccountPublisher` — akkount ↔ bozor yagona ko'prigi |
| `cards` | efhub karta katalogi (qidiruv, META tier, sinxronlash), card interest |
| `cards/sync` | Kunlik efhub delta-sync (`EfhubSyncJob`), yangi kartalar → `cards-added` |
| `partner` | Hamkor kanallar: ariza → bot tekshiradi → to'lov (payment) → admin tasdig'i; kanalga post, oylik to'lov, admin badge'lar |
| `referral` | Taklif kodlari va mukofot (payment'ga yoziladi) |
| `trust` | Shikoyatlar, bosqichli jazo (ogohlantirish → vaqtinchalik → doimiy blok), public qora ro'yxat, `BlacklistGuard` |
| `support` | Foydalanuvchi ↔ admin support chat; Telegram orqali javob (bot) |
| `gamer` | Gamer Card: Chempionat-X turnir statistikasi projection'i (`gamer_stats`) |
| `websocket` | Chat real-time (`/ws/chat`), presence/typing; `chat.changed.v1` ni tinglaydi |
| `popup` | Kontekstli in-app xabar kampaniyalari, admin draft/publish/pause va PostgreSQL delivery limitlari |
| `push` | Firebase push bildirishnomalar (`FIREBASE_PUSH_ENABLED`) |
| `guide`, `emoji`, `botsettings` | Video qo'llanmalar, Telegram emoji to'plamlari, bot `/start` matni va ommaviy xabar (broadcast) |
| `kafka` | trade/payment/auth/tournament hodisalari consumerlari |
| `event` | `MarketplaceEvents` — chiqadigan topic nomlari va payloadlar |
| `recommendation` | `value_score` formulasi (`ValueScore*`), startup `ValueScoreBackfill`, `MetaBoundaryJob`, snapshot payloadlari (`RecommendationSnapshots`), replay |

## Asosiy API

To'liq ro'yxat — controllerlarda. Asosiy guruhlar (`/api/v1/...`):

| Guruh | Endpointlar |
|---|---|
| E'lonlar | `GET/POST /listings`, `GET/PUT/DELETE /listings/{id}`, `/listings/{id}/sold`, `/relist`, `/like`, `/views`, `/report`, `/listings/me`, `/liked`, `/user/{userId}`, `/listings/{id}/channel-posts` |
| Qidiruv va match | `GET /listings?matchCard=...&matchStrictness=...` — kartalar bo'yicha ball bilan saralash |
| Katta bozor | `GET /listings?sort=valueScore,desc` (yoki `asc`) — `value_score NULLS LAST`, keyin `id ASC`; `includeSold` bo'lsa avval `status`; `valueScore` bor bo'lsa boshqa sort xossalari e'tiborsiz |
| Ranked | `POST /listings/ranked` (anonim ham) — body `{ ids (≤1000, null emas UUID), minPrice, maxPrice, priceNegotiable, search, attributes, page (0..1000), size (1..100) }`; chaqiruvchi tartibini saqlaydi, faqat `ACTIVE`, takrorlarni olib tashlaydi, `PageResponse<ListingResponse>` qaytaradi |
| Akkountlar | `GET/POST /accounts`, `GET/PATCH/DELETE /accounts/{id}`, `/publish`, `/unpublish`, `/media`, `/email` |
| Kartalar | `GET /cards`, `/cards/search`; `POST /card-interest/apply`; `/dream-teams` (CRUD, `PUT /me`) |
| Chat | `/chats`, `/chats/{id}`, `/messages`, `/account-request`, `/important`, `/hide`, `/read`, `/typing`, `/presence`, `/unread-total` |
| Kontekstli xabarlar | `GET /popups/next?trigger=...`, `POST /popups/{id}/claim`, `POST /popups/deliveries/{id}/events`; faqat autentifikatsiyalangan foydalanuvchi |
| Admin xabarlar | `GET/POST /admin/popups`, `PATCH /admin/popups/{id}/status`; faqat `ROLE_ADMIN` |
| Bildirishnoma | `/notifications`, `/read-all`, `/unread-count`, `/push-tokens`, `/push-status` |
| Hamkorlik, referal | `/partners/**` (ariza, panel, to'lov, kanallar, click), `/referrals/claim`, `/referrals/me` |
| Trust, support | `/complaints`, `/blacklist`, `/blacklist/check`, `/support/chats/**` |
| Admin | `/admin/**`: listings, cards (sync, META), attributes, chats, partners, referrals, reports, trust, support, bot-settings, bot-broadcasts, guides, emoji-packs, stats, badges |
| Ichki | `/internal/marketplace/v1/**`: `listings/{id}/terms`, `accounts/{id}` (trade uchun), bot-settings, guides/buttons, partners/* natijalari (bot), referrals/pending, support/telegram-reply, trust/complaints, `POST rec/replay` (`X-Internal-Secret`; `{ listings, likes, cards }` sonlari — hammasini qayta yuborishga belgilaydi) |

> **Ko'chirilmoqda:** dream team, card match va card interest `recommendation-service` da ham bor
> (B bosqichi, qorong'i). Frontend C bosqichida unga o'tadi, D bosqichida bu yerdan o'chiriladi —
> shu orada bu qismlarga o'zgartirish ikkala servisda ham kerak bo'ladi.

## Kontekstli in-app xabarlar

Kampaniya yaratish faqat `DRAFT` saqlaydi; `PATCH /admin/popups/{id}/status` body
`{ "status": "ACTIVE" | "PAUSED" }` uni ochiq e'lon qiladi/to'xtatadi. Muddati tugagan
kampaniya `ACTIVE` bo'lmaydi. `GET /admin/popups` eng yangi 100 tagacha kampaniyani
(`createdAt DESC, id DESC`) `shownCount`, `clickedCount`, `dismissedCount` bilan qaytaradi.

Yaratish body: `title` (1–100), `message` (1–600), `tone` (`INFO/SUCCESS/WARNING`),
`audience` (`ALL/SELLERS/SELECTED`), `recipientIds` (faqat `SELECTED` uchun 1–100 UUID),
`trigger` (`BROWSE/LISTING_PUBLISHED/EMPTY_SEARCH/TRADE_COMPLETED`), ixtiyoriy juftlik
`actionLabel` (1–60) + `actionPath` (≤200), `startsAt`, `endsAt` (majburiy ISO UTC sana;
0 dan katta, 30 kungacha oraliq), `priority` (0–10). `SELLERS` — kamida bitta
`DELETED` bo'lmagan e'lon egasi. `createdBy` ishonchli auth principal'dan olinadi;
body'dan berilgan identifikator yoki holat yuboruvchini/holatni o'zgartirmaydi.

Matn HTML sifatida talqin qilinmaydi. CTA aniq allowlist: `/marketplace`, `/profile`,
`/help`, `/invite`, `/notifications`, `/marketplace/new`, `/blacklist`,
`/profile?tab=accounts`, `/profile?tab=favorites`, `/marketplace/{UUID}` va
`/help/{kichik-harf-raqam-defis-slug}`. Boshqa query, fragment, tashqi URL yoki redirect yo'q.

`next` eng ustuvor ayni paytda mos xabarni, yo'q bo'lsa `204` qaytaradi. Public response:
`{ id, title, message, tone, trigger, actionLabel, actionPath, endsAt }`; recipient IDlar
va admin shaxsi oshkor qilinmaydi. `claim` body `{ trigger, sessionId: UUID }`;
natija `{ deliveryId, campaign }` yoki `204`. `popup_delivery_users` qatori tranzaksiyada
qulflanib, barcha tab/qurilma uchun bir foydalanuvchiga bir sessiyada bittadan, sirg'aluvchi
24 soatda ikkitadan, orasida kamida 6 soat, bir kampaniyadan jami bittadan rezervatsiya
beradi. Campaign share lock publish/pause bilan poygani tartiblaydi; claim barcha
mosliklarni qayta tekshiradi. Sessiya UUID mijozda saqlanadi, foydalanuvchi esa principal'dan.

`events` body `{ "event": "SHOWN" | "CLICKED" | "DISMISSED" }`; muvaffaqiyat `204`,
begona/yo'q delivery `404`. Takrorlar idempotent. `SHOWN` faqat haqiqiy renderdan keyin
mijoz tomonidan tasdiqlanadi; rezervatsiya impression emas. Birinchi click/dismiss
natijasi saqlanadi; keyin kelgan `SHOWN` uni yo'qotmaydi. Render bo'lmagan rezervatsiya
ham limitni band qiladi. Yangi worker, Kafka hodisasi yoki boshlang'ich aktiv seed yo'q.

Jadvallar (`V75`): `popup_campaigns` — matn, auditoriya, jadval va holat;
`popup_delivery_users` — foydalanuvchi lock qatori; `popup_deliveries` — rezervatsiya
hamda har bir tasdiq vaqti. User/campaign va user/session unique constraintlari mavjud.

## Kafka

Chiqaradi: `efbazaar.marketplace.*` — e'lon, like, `listing-snapshot`, `card-snapshot`, chat, partner, kanal postlari, support,
qora ro'yxat, `cards-added`, `bot-settings-updated`.
Tinglaydi: `trade.*` (listing-sold, trade-succeeded, proposal-*, action-notification,
admin-invited, mailbox-handed-over), `payment.*` (deposit-credited, withdrawal-*),
`auth.user-registered`, `auth.user-deleted`, `bot.support-*`, `tournament.*`, `chat.changed.v1`.

Partner hodisalari **tranzaksiya commit bo'lgandan keyin** chiqadi (`PartnerEventPublisher`) —
aks holda consumer eski holatni o'qiydi. Yangi publisher yozsangiz shu uslubga amal qiling.

### Recommendation snapshot'lari (outbox)

Servis `uz.efbazaar:outbox` kutubxonasiga bog'liq (jadvallar — `V71`). `V73` PL/pgSQL trigger'lari
`listings`, `listing_cards`, `listing_likes` o'zgarganda `outbox_snapshot_pending` ga `('listing', id)` /
`('like', userId:listingId)` belgisini qo'yadi (`ON CONFLICT DO UPDATE SET marked_at` — takroriy belgi
vaqtni yangilaydi). Relay belgini olib **hozirgi** holatni o'qiydi va yuboradi:
`listing-snapshot` (kalit `listingId`), `card-snapshot` (kalit `efhubId`; `efbazaar` bazasida trigger yo'q,
kod `markSnapshot("card", ...)` chaqiradi) va `like-toggled` (endi `LikeService` emas, `listing_likes` trigger'i + outbox;
payload `{ idempotencyKey, listingId, userId, liked, version, occurredAt }`). Iste'molchi — `recommendation-service`
(rejada, B bosqich). Qayta yuborish: `POST /internal/marketplace/v1/rec/replay`.

Servis ichidagi o'qilmaydigan JSON request body endi ilova bo'ylab 400 qaytaradi (`GlobalExceptionHandler`), 500 emas.

Batafsil: [docs/kafka-topics.md](../../docs/kafka-topics.md).

## Boshqa servislarga HTTP

| Servis | Nima uchun |
|---|---|
| auth | Ismlar va profil qisqachasi (`names/batch`, `summary/batch` — fail-soft), adminlar ro'yxati |
| bot | Media yuklash (rasmlar Telegram guruhiga), emoji to'plamlari, kanal ma'lumoti |
| payment | Hamkorlik to'lovi (`PartnerFeeClient`), referal mukofoti (`ReferralRewardClient`) |
| trade | Faol savdolar (`TradeLiveClient`) |

## Rejali job'lar

| Job | Jadval (default) |
|---|---|
| `EfhubSyncJob` — yangi kartalar | `EFHUB_SYNC_CRON` / `app.cards.sync.cron` (`0 0 9 * * *`) |
| `TrustPenaltySweeper` — muddati o'tgan bloklar | har 5 daqiqa |
| `ChannelRefreshJob` — kanal ma'lumotlarini yangilash | `PARTNER_REFRESH_CRON` (`0 30 3 * * *`) |
| `PartnerMonthlyPayoutJob` | `PARTNER_MONTHLY_CRON` (`0 0 4 1 * *`) |
| `PendingReferralSweeper` | `0 30 3 * * *` |
| `MetaBoundaryJob` — `active_from`/`active_until` chegarasini kesgan kartalar (25 soatlik oyna) uchun `value_score` va card-snapshot | `META_BOUNDARY_CRON` / `app.recommendation.meta-boundary-cron` (`0 5 0 * * *`, UTC) |

## Ma'lumotlar

- Asosiy jadvallar: `listings`, `listing_cards`, `listing_likes`, `listing_views`, `user_accounts`,
  `user_account_cards`, `chats`, `chat_messages`, `notifications`, `dream_teams`,
  `attribute_definitions`, `partner_*`, `referrals`, `complaints`, `penalties`, `support_*`, `gamer_*`.
- `listings.value_score` (nullable, `V72`; qisman indeks) — «Katta bozor» bali, 0..1. Hisoblanadi: e'lon saqlanganda
  (`ListingPersistence`), admin META o'zgartirganda/tugatganda va yangi efhub kartalarida (`CardChangeHandler`),
  `MetaBoundaryJob` orqali. `efbazaar` katalogi o'qilmasa ball o'zgarmaydi (WARN), e'lon saqlash hech qachon yiqilmaydi.
  Startup'da `ValueScoreBackfill` NULL qatorlarni to'ldiradi (xato log'ga yoziladi, startup'ni bloklamaydi).
- `outbox_*` (`V71`) — outbox kutubxonasi jadvallari: `outbox_snapshot_pending`, `outbox_snapshot_version_seq` va boshqalar.
- `listing_cards` — e'londagi valuable kartalar: `efhub_id` (aniq karta) + `player_id`
  (haqiqiy futbolchi; bir futbolchining turli kartalari bir xil `player_id` ga ega).
- `efbazaar` karta katalogi Flyway'siz: sxema `infra/postgres/efbazaar/V*.sql` dan
  `infra/scrapers/efhub/setup-db.sh` bilan qo'lda qo'llanadi. `CardSchemaBootstrap` startup'da
  qo'shimcha (additive) ustunlarni qo'shib qo'yadi — kod sxemadan oldin deploy bo'lsa ham qidiruv yiqilmasin.
- `R__attribute_definitions.sql` — e'lon atributlarining yakuniy holati; label/constraint
  o'zgarsa shu faylni tahrirlang, yangi V-migratsiya ochmang.

## Ehtiyot bo'l

- Konfiguratsiya: `app.recommendation.value-score.*` (formula konstantalari: `rating-floor`, `rating-span`, `meta-base`,
  `meta-priority-step`, `card-cap`, `price-floor`, `price-cap`, `price-weight`), `VALUE_SCORE_BACKFILL_ENABLED` (default `true`),
  `META_BOUNDARY_CRON`.
- `CARD_INTEREST_HMAC_SECRET` bo'sh bo'lsa servis **ishga tushmaydi**.
- Media fayllar DB'da saqlanmaydi — faqat Telegram `message_id` / `file_id`.
- `sellerId` hech qachon request body'dan olinmaydi — faqat `X-User-Id`.
- Migratsiya raqami: `sort -V` bilan oxirgisini va `origin/main` ni tekshiring —
  parallel branchlarda bir xil raqam ko'p marta to'qnashgan.

## Test

Java 21 bilan avval `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests`
(repo ildizidan), keyin ushbu papkada `mvn -B -ntp clean verify`. `*IT` integratsion
testlar Failsafe orqali Docker/Testcontainers PostgreSQL bilan ham ishlaydi. Mahalliy
Docker 29 eski docker-java API defaultini rad etsa, qo'shimcha
`-DargLine=-Dapi.version=1.44` ishlatiladi; CI runtime/config o'zgartirilmaydi.

`PopupCampaignIT` haqiqiy HTTP security/controller/service tranzaksiyalari va barcha
Flyway migratsiyalarini tekshiradi: targeting, schedule, CTA, limitlar, parallel claim,
event tartibi/idempotency/ownership va admin statistika.
