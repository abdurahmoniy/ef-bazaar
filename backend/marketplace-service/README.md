# marketplace-service

Platformaning eng katta servisi: e'lonlar, akkountlar, chat, like, bildirishnomalar,
karta katalogi, hamkorlik (kanallar), referal, trust (shikoyat va qora ro'yxat),
support chat, qo'llanmalar va bot sozlamalari. Savdoning o'zi (escrow) bu yerda **emas** —
u trade-service'da. Pul esa payment-service'da.

| | |
|---|---|
| Port | 8082 |
| Public yo'l | `/api/marketplace/**` → `/api/**` (anonim ham o'tadi); WebSocket `/ws/chat` |
| DB | `MARKETPLACE_DB_NAME` (Flyway, `V1`–`V85` + `R__`); ikkinchi datasource — `efbazaar` karta katalogi |
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
| `channel` | Rasmiy kanalga obuna/chiqish jurnali (`channel_member_events`, bot `chat_member` dan); adminka `GET /admin/channel-members/summary?days=30` |
| `campaign` | Kampaniya havolalari (`?c=`, `/start c_`): foydalanuvchi qaysi manbadan kelgani, birinchi manba g'olib; adminka voronkasi |
| `trust` | Shikoyatlar, bosqichli jazo (ogohlantirish → vaqtinchalik → doimiy blok), public qora ro'yxat, `BlacklistGuard` |
| `support` | Foydalanuvchi ↔ admin support chat; Telegram orqali javob (bot) |
| `gamer` | Gamer Card: Chempionat-X turnir statistikasi projection'i (`gamer_stats`) |
| `websocket` | Chat real-time (`/ws/chat`), presence/typing; `chat.changed.v1` ni tinglaydi |
| `chat` | `ContactShield`: chat matni va izohdagi Telegram username / `t.me` havola / telefonni saqlashdan oldin `[kontakt yashirildi]` ga almashtiradi (`chat_messages.contact_hidden`, javobda `contactHidden: true`). Asl kontakt saqlanmaydi; Konami ID, narx va pochta tegilmaydi. Shu sababli e'londagi `seller` (`SellerSummary`) Telegram username qaytarmaydi, Gamer Card esa uni faqat egasiga beradi |
| `pricewatch` | Owner price watches, authoritative price transitions, durable common search/price intents, in-app/Telegram delivery |
| `popup` | Kontekstli in-app xabar kampaniyalari, admin draft/publish/pause va PostgreSQL delivery limitlari |
| `push` | Firebase push bildirishnomalar (`FIREBASE_PUSH_ENABLED`) |
| `music` | Admin boshqaradigan YouTube fon musiqasi katalogi; faqat metadata va video ID saqlanadi |
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
| Akkountlar | `GET/POST /accounts`, `GET/PATCH/DELETE /accounts/{id}`, `/publish`, `/unpublish`, `/media`, `/email`. `GET /accounts` — avval `ACTIVE`, keyin tarix: sotilgan va obmen qilingan (`ARCHIVED`, sabab `SOLD_ON_PLATFORM` / `SOLD_ELSEWHERE` / `SWAPPED_ON_PLATFORM`) `archivedAt` va `soldPrice` bilan (`V77`; obmenda va eski yozuvlarda narx yo'q). Arxivlangan akkountni o'zgartiruvchi har so'rov — `409 account_archived`. Javobda `emailVerified` (`V78`): savdodan kelgan (`PLATFORM`) yoki trade-service quti ulash sessiyasi tasdiqlagan manzil; `emailSource` `MANUAL` / `PLATFORM` / `CUSTOM` (user o'zi olgan nomli quti). `PATCH /email` (qo'lda) tasdiqni va `mailboxId` ni tushiradi |
| Kartalar | `GET /cards`, `/cards/search`; `POST /card-interest/apply`; `/dream-teams` (CRUD, `PUT /me`) |
| Chat | `/chats`, `/chats/{id}`, `/messages`, `/account-request`, `/important`, `/hide`, `/read`, `/typing`, `/presence`, `/unread-total` |
| Kontekstli xabarlar | `GET /popups/next?trigger=...`, `POST /popups/{id}/claim`, `POST /popups/deliveries/{id}/events`; faqat autentifikatsiyalangan foydalanuvchi |
| Admin xabarlar | `GET/POST /admin/popups`, `PATCH /admin/popups/{id}/status`; faqat `ROLE_ADMIN` |
| Narx kuzatuvi | `/price-watches` (GET/POST), `/{id}` (PATCH/DELETE), `/priorities`, `/preferences` (PUT); faqat owner |
| Bildirishnoma | `/notifications`, `/read-all`, `/unread-count`, `/push-tokens`, `/push-status` |
| Hamkorlik, referal | `/partners/**` (ariza, panel, to'lov, kanallar, click), `/referrals/claim`, `/referrals/me`, `/campaigns/click` (anonim ham), `/campaigns/claim` |
| Trust, support | `/complaints`, `/blacklist`, `/blacklist/check`, `/support/chats/**` |
| Fon musiqasi | `GET /music` (public, faqat enabled); `GET/POST /admin/music`, `PUT/DELETE /admin/music/{id}` (`ROLE_ADMIN`) |
| Admin | `/admin/**`: listings, cards (sync, META), attributes, chats, partners, referrals, campaigns, reports, trust, support, bot-settings, bot-broadcasts, guides, music, emoji-packs, stats, badges |
| Ichki | `/internal/marketplace/v1/**`: `listings/{id}/terms`, `accounts/{id}` (trade uchun), bot-settings, `inline/listings?telegramId&q&offset` (bot inline rejimi: o'z ACTIVE e'lonlari, kanal matni, muqova, Mini App havolasi, 20 talik sahifa), guides/buttons, partners/* natijalari (bot), referrals/pending, campaigns/bot-start, channel-members/events, support/telegram-reply, trust/complaints, `POST rec/replay` (`X-Internal-Secret`; `{ listings, likes, cards }` sonlari — hammasini qayta yuborishga belgilaydi) |

> **Ko'chirilmoqda:** dream team, card match va card interest `recommendation-service` da ham bor
> (B bosqichi, qorong'i). Frontend C bosqichida unga o'tadi, D bosqichida bu yerdan o'chiriladi —
> shu orada bu qismlarga o'zgartirish ikkala servisda ham kerak bo'ladi.

### Exchange acceptance filter

`attr.exchange_mode=ACCEPTS_EXCHANGE` is a synthetic browse-filter value matching stored `EXCHANGE_ONLY`, `EXCHANGE_WITH_SURCHARGE`, or `BOTH` modes. The shared specification applies it to ordinary browse and ranked results. Existing exact mode filters retain their behavior; account/listing write enums are unchanged.

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
qora ro'yxat, `cards-added`, `bot-settings-updated`, `account-email-unlinked` (akkount tasdiqlangan qutidan ajraldi — sotildi, obmen, qo'lda tahrir, boshqa qutiga ko'chdi, o'chirildi; commit'dan keyin, `AccountEmailUnlinks`). Custom quti sotuv/obmen/boshqa joyda sotuvda bo'shasa egasiga `CUSTOM_MAILBOX_FREED` bildirishnomasi (`/mailboxes/custom`).
Tinglaydi: `recommendation.watch-candidate` (D, durable search notification intent), `trade.*` (listing-sold, trade-succeeded, proposal-*, action-notification,
admin-invited, mailbox-handed-over, account-email-verified — akkountga tasdiqlangan email; egasi va `ACTIVE` bo'lmasa e'tiborsiz), `payment.*` (deposit-credited, withdrawal-*),
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
| recommendation | Faqat watch delivery oldidan yangi owner/opt-in/entitlement authorization (`/internal/rec/v1/watches/authorize`); listing projectionlar Kafka orqali |

## Rejali job'lar

| Job | Jadval (default) |
|---|---|
| `EfhubSyncJob` — yangi kartalar | `EFHUB_SYNC_CRON` / `app.cards.sync.cron` (`0 0 9 * * *`) |
| `TrustPenaltySweeper` — muddati o'tgan bloklar | har 5 daqiqa |
| `ChannelRefreshJob` — kanal ma'lumotlarini yangilash | `PARTNER_REFRESH_CRON` (`0 30 3 * * *`) |
| `PartnerMonthlyPayoutJob` | `PARTNER_MONTHLY_CRON` (`0 0 4 1 * *`) |
| `PendingReferralSweeper` | `0 30 3 * * *` |
| `PendingCampaignSweeper` | `0 40 3 * * *` (`app.campaigns.pending-ttl-days`, default 30) |
| `MetaBoundaryJob` — `active_from`/`active_until` chegarasini kesgan kartalar (25 soatlik oyna) uchun `value_score` va card-snapshot | `META_BOUNDARY_CRON` / `app.recommendation.meta-boundary-cron` (`0 5 0 * * *`, UTC) |

## Ma'lumotlar

- Asosiy jadvallar: `listings`, `listing_cards`, `listing_likes`, `listing_views`, `user_accounts`,
  `user_account_cards`, `chats`, `chat_messages`, `notifications`, `dream_teams`,
  `attribute_definitions`, `partner_*`, `referrals`, `acquisition_campaigns`, `campaign_clicks`, `user_acquisitions`, `pending_campaign_attributions`, `channel_member_events`, `complaints`, `penalties`, `support_*`, `gamer_*`, `music_tracks`.
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

Chat custom emoji catalog: authenticated users may GET `/api/v1/emoji-packs` and `/api/v1/emoji-packs/{id}`. Pack creation, refresh and deletion remain restricted to `/api/v1/admin/emoji-packs`. Chat text preserves custom emoji IDs using `<tg-emoji emoji-id="ID">fallback</tg-emoji>`; clients render only recognized emoji tokens, treating other content as plain text.

Konami OTP action events `EMAIL_CHANGE_CODE_RECEIVED` and `LOGIN_CODE_RECEIVED` create
`TRADE_EMAIL_CHANGE_CODE` / `TRADE_LOGIN_CODE` notifications. `details` must contain
a numeric 4–8 digit code and `occurredAt` its detection timestamp (maximum age five
minutes). The recipient comes exclusively from `recipientUserId`. Responses expose
nullable `verificationCode`; push bodies include the code. Replays are atomically
deduplicated by recipient, trade, type, code and detection timestamp.

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

## D — narx kuzatuvlari va umumiy ishonchli xabar oqimi

`/api/v1/price-watches` faqat authenticated owner uchun. `GET` —
`{ items, limit, notificationsEnabled, telegramEnabled, immediate, available }`;
item `{ id, listingId, paused, pauseReason, priority, createdAt }`. `pauseReason` —
`USER`, `LIMIT`, `UNAVAILABLE` yoki `null`; `priority` 0 dan boshlanadi.
`POST {listingId}` yaratadi (duplicate o‘sha watchni qaytaradi), `PATCH /{id}
{paused}`, `DELETE /{id}` (204), `PUT /priorities {ids}` barcha owner watchlarini
bir martadan tartiblaydi, `PUT /preferences {notificationsEnabled,telegramEnabled}`
umumiy qidiruv va narx xabarlarini boshqaradi. Telegram opt-in yangi auth summary
bilan bog‘langan identity talab qiladi. Favorites watch emas va o‘zining bepul
vazifasini saqlaydi.

Fresh payment capability kalitlari `watch.price_limit` (Free 3, Pro 20),
`watch.immediate` (`false` / `true`). `null` faqat yangi AVAILABLE unlimited grant
bo‘lganda cheksizdir; yo‘q, eskirgan yoki noto‘g‘ri grant pullik huquq bermaydi.
Create/resume unavailable bo‘lsa 503; owner read/delete/pause saqlanadi.
Unavailable holati javobda ko‘rinadi, lekin saqlangan active/pause va price
baseline’ni o‘zgartirmaydi: narx hodisalari durable candidate sifatida qoladi.
Fresh current policy in-app/Telegram yuborishdan oldin qayta tekshiriladi;
bitta unavailable owner shu e’lonning boshqa ownerlariga yetkazishni to‘smaydi.
Delayed renewal uchun unknown-policy LIMIT qatorlarining candidate’lari ham
saqlanadi; current grant va renewal source baseline tasdiqlamaguncha yuborilmaydi.
GET/background reconciliation canonical renewal sourceTime’dan davom etadi;
explicit priority tanlovi, user resume va delete/pause orqali bo‘shagan joyga
promotion joriy price version’dan baseline oladi. Explicit selection unavailable
bo‘lsa ham saqlangan LIMIT tarixini rebaseline qiladi; active candidate’lar qoladi.
Create listing row lockini kutgandan keyin ham current policy/quota’ni tekshiradi.
In-app yozuvi va Telegram claimidan oldin, listing locki yoki tashqi authorization/identity
so‘rovidan keyin policy yana tekshiriladi; o‘zgarsa pending candidate keyingi sweepga qoladi.
Create barcha saqlangan qatorlarni limitga sanaydi (USER pause yangi slot
yaratmaydi); downgrade ortiqcha qatorlarni saqlaydi. Limit, cadence va source
timestamp `readCapabilities` bitta SQL/MVCC snapshotidan olinadi. Resume source
user plan/expiry va `watch.price_limit` qiymatining haqiqiy effective change vaqtlaridan
kechrog‘idir; per-key/user `updated_at` bir xil hourly replay’da saqlanadi.
Freshness va public appearance deadline alohida `plan_projection_state.occurred_at`
orqali yangilanadi; to‘liq snapshotda yo‘qolgan grantlar baribir o‘chiriladi.
`watch_preferences` owner qatori locki parallel quota qarorlarini tartiblaydi.
Downgrade ortiqcha qatorlarni o‘chirmaydi: priority tartibida LIMIT pause;
USER pause saqlanadi. Explicit resume qatorni priority tanloviga qaytaradi:
limit ichida tanlansa ochiladi; past priority bo‘lsa 409 va avvalgi USER pause
tranzaksion rollback bilan saqlanadi. UI avval targetni asosiy priorityga ko‘tara
oladi. Resume current `price_version`dan yangi baseline oladi.

`V80` listing triggeri narx har safar o‘zgarganda shu mutatsiya tranzaksiyasida
`watch_price_events`ga `old_price`, `new_price`, `price_version`, publication
versiyasini yozadi. O‘zgarmagan narx va rollback event yaratmaydi. INSERT ACTIVE
va boshqa statusdan ACTIVEga o‘tish haqiqiy `published_at` va monoton
`publication_version` beradi. Migratsiyadan oldingi listinglar `0`/null baseline;
relay vaqti publication vaqti sifatida ishlatilmaydi. Listing snapshot qo‘shimcha
`publishedAt`, `publicationVersion` beradi; eski constructor saqlanadi.

`efbazaar.recommendation.watch-candidate` Kafka eventi
`{idempotencyKey,intentId,userId,listingId,publicationVersion,publishedAt,
reasons:[{watchId,label}],occurredAt}` umumiy `watch_intents`ga yoziladi. Search
intent `(user,listing,publicationVersion)` bo‘yicha bitta; price intent alohida
`price_version` bo‘yicha bitta. Dastlabki snapshot/replay eski listinglarni yangi
publication deb talqin qilmaydi. Recommendation source intenti barcha matching
search sabablarini jamlaydi. Market final deliveryda
`POST /internal/rec/v1/watches/authorize` (`X-Internal-Secret`)
`{intentId,userId,listingId,publicationVersion}` yuboradi;
`{eligible,reasons:[{watchId,label}],deliveryMode:IMMEDIATE|DIGEST}` javobi current
search opt-in, generation va entitlementni tekshiradi. Network/503 kechiktiradi.
Rec marketplacega HTTP chaqirmaydi; authoritative listing status, seller va
publication marketning o‘z DBsidan tekshiriladi.

Job default 5 soniyada (`app.watch.poll-ms`, startup delay
`app.watch.initial-delay-ms` 15 soniya) pending ishni qayta ko‘radi. Pro current
grant bilan immediate; Free Asia/Samarkand 19:00 cutoff bo‘yicha bitta nonempty
kunlik jamlanma oladi. 19:00 dan oldin Free xabari yuborilmaydi.
O‘tkazib yuborilgan job keyingi 19:00 dan keyingi sweepda shu cutoffgacha
ishlarni oladi. `watch_deliveries` `(user,digest_date)` unique constraint,
notification insert va intent receipt bitta DB tranzaksiyasida. Sotilgan,
o‘chirilgan, bloklangan yoki ownerning o‘z listingi yuborilmaydi. In-app turlar
`WATCH_MATCH`, `WATCH_DIGEST`; `watchPayload` —
`{items:[{listingId,reasons:[string],oldPrice?,newPrice?}],totalCount,remainingCount}`.
Payloadda ko‘pi bilan 20 item, har itemda 5 ta 100 belgili sabab saqlanadi;
qolganlar `/watches`ga yo‘naltiriladi.

Telegram mustaqil durable channel: fresh identity auth enrichmentdan olinadi,
boshqa servis DBsi o‘qilmaydi. Market `SENDING`ni tashqi requestdan **oldin commit**
qiladi, keyin botning `POST /bot/internal/watches/dm` endpointiga
`{deliveryId,chatId,text}` plain text yuboradi (`X-Internal-Secret`). Bot HTMLni
escape qiladi; javob `{messageId}`. Natija noaniq/timeout — `UNCONFIRMED`, avtomatik
qayta yuborilmaydi; `SENDING`da qolgan eski claimlar ham noaniq hisoblanadi.
`V81` explicit global opt-out/opt-in chegarasini saqlaydi; undan oldingi
kechikkan Kafka candidate xabar yaratmaydi: haqiqiy `publishedAt` ham,
intent `occurredAt` ham ushbu chegaradan keyin bo‘lishi kerak. Opt-out pending Telegramni bekor
qiladi; re-enable eski navbatni qaytarmaydi. `V82` `telegram_claimed_at`ni
saqlaydi: timeout yoshi delivery yaratilgan vaqtdan emas, haqiqiy claimdan
hisoblanadi. Eski timestampsiz SENDING natijasi UNCONFIRMED bo‘lib qoladi.
Absolute exactly-once Telegram kafolati yo‘q. `PENDING` retry va opt-out/current
listing tekshiruvi in-memory after-commit callbackga bog‘liq emas.

Konfiguratsiya: `app.watch.recommendation-base-url` default
`http://recommendation-service:8083`; bot uchun mavjud
`app.bot.internal-base-url`; secret mavjud `app.internal.secret` orqali.
Faqat yangi configurable defaultlar ishlatiladi, yangi sir saqlanmaydi.

Regressiyalar: `PriceWatchMigrationIT` atomik event/publication/rollbackni;
`PriceWatchIT` owner security, Free/Pro limit, parallel create, duplicate,
downgrade, priority, resume baseline, current entitlement/opt-out,
missed daily digest, rec authorization retry va durable Telegram holatini
haqiqiy PostgreSQL/Flyway bilan tekshiradi. 100 ta unavailable old owner
bilan queue fairness, owner lock tartibi, reconciliation batchdan tashqaridagi
renewalning birinchi narx eventi va 20 itemli bounded digest ham qamrab olingan. To‘liq completion gate hali ham
Java 21 `mvn -B -ntp clean verify`.


## E — seller analytics

Authenticated `X-User-Id` owns every query; anonymous requests are rejected by
existing security. Public gateway prefix remains `/api/marketplace`.

- `GET /api/v1/seller-analytics/summary`: Free basic counts `{listingCount,
  uniqueViews,currentFavorites,inquiries,capabilities,coverage}`. Counts only own
  ACTIVE/SOLD listings and exclude self interactions. A missing plan projection
  does not block these basic counts. Facts belonging to an earlier seller never
  become the new owner's views/inquiries.
- `GET /api/v1/seller-analytics/report?days=7|30|90&listingId?&page=0&size=50`:
  `{days,fromDate,toDate,coverage,totals,daily,listings,page,size,totalListings}`.
  Page size 1–100 bounds listing rows; totals and daily rows cover the entire
  selected dataset. Each metrics object has `uniqueViews,saveAdditions,inquiries,
  completedTrades,grossSalesUzs`; daily rows add `date`, listing rows add
  `listingId,title,status` (`title` is the listing description).
- `GET /api/v1/seller-analytics/export?days=7|30|90&listingId?`: UTF-8 CSV
  attachment, **all** selected listings regardless of report pagination. It uses
  the same owner/status/time selection and mapper. CSV quotes cells, doubles
  quotes, flattens embedded newlines and protects spreadsheet formula prefixes
  even after leading whitespace/control characters.

Money is an exact integer UZS **decimal string** in JSON, including totals;
Postgres numeric sums avoid long overflow. It is the agreed gross amount of
completed SALE trades, including HUMAN trades without wallet settlement. It is
not profit or confirmed net wallet proceeds. SWAP and SWAP_SURCHARGE contribute
one completion and zero gross sales. Current listing prices, legacy listing-sold
payloads, sold-account prices and Kafka relay times are never money sources.

History/export uses one fresh, versioned effective payment policy snapshot.
Free has history 0/export false; PRO/MAX 90/true; only explicit STAFF null history
is unlimited. Invalid/missing/stale snapshots return 503
`analytics_policy_unavailable`; a known insufficient grant returns 403
`analytics_upgrade_required`; foreign/hidden listing filters return 404
`listing_not_found`; invalid days/page return 400. No private buyer identifiers,
guest keys or messages are returned.

V83 adds `seller_analytics_collection`, `seller_analytics_facts`,
`seller_analytics_daily` and `seller_analytics_trade_receipts`. Source insert
triggers and rollups share the original transaction. Stable source identity
prevents duplicate/concurrent increments; rollback removes the fact and rollup.
A repeat view is never a new daily view. Save **additions** use the actual like
row ID; removing a like does not erase its addition and current favorites are a
separate basic metric. Inquiries use the first persisted `(listing,requester)`
ChatAccountRequest, including cancelled requests; an old pair chat's createdAt,
chat navigation and later requests do not increment it. A genuinely earlier
request moves its one fact and rollup to that earlier day atomically.

Only existing unique-view rows and earliest persisted inquiry rows are
backfilled. Historical likes and trades are never invented. Coverage returns
`collectionStartedAt`, `timezone=Asia/Samarkand`, metric history descriptions and
`historyPartial`; report partiality is relative to the selected interval's start.
Dates are inclusive today plus N−1 Samarkand days. Future timestamps are excluded.
A collection date or entitlement does not promise 90 days of account history.

`SellerTradeCompletionConsumer` listens to
`efbazaar.trade.seller-trade-completed`, group
`marketplace-service-seller-completions`, with raw JSON and no Java type-header
coupling. It requires an explicit kind/mode/integral nonnegative source amount,
completion time and deterministic per-trade key. Receipt, fact and rollup commit
together; duplicate/conflicting replays cannot alter the first accepted fact.
Missing/mismatched listings remain durable and are retried every 30 seconds
(`analytics.completions.retry-ms`); eligible receipt selection prevents unresolved
older rows from starving later valid completions. No other service DB is read.

E regressions: `SellerAnalyticsIT` (11), `SellerAnalyticsMigrationIT` (1) and
`SellerAnalyticsCsvTest` (8 Unicode/control formula-prefix cases).
Full service verification remains `mvn -B -ntp clean verify` on Java 21.

Final local E verification: Java 21 `mvn -B -ntp clean verify` passed with
716 unit and 175 integration tests, zero failures/errors/skips and no fork dumps.
The final run includes all eight CSV security cases. No remote CI, push or deploy
was performed.


## Seller tools and profile appearance (F)

Payment owns three typed product booleans: `seller.tools`, `seller.bulk`, and
`profile.decoration`. Only the exact string `true` enables an action; `false`
denies it, and a missing/null/malformed value or stale projection is unavailable.
The existing versioned payment projection resolves subscription expiry before
reading grants. No frontend plan-name check authorizes these operations.

Authenticated APIs, relative to `/api/v1`:

| Endpoint | Behavior |
|---|---|
| `GET /seller-tools/capabilities` | `{tools, bulk, profileDecoration, bulkLimit:50}`; each status is `AVAILABLE`, `DENIED`, or `UNAVAILABLE` |
| `GET /seller-tools/templates`, `/seller-tools/notes` | `{content,page,size,totalElements}`; page 0..100000, size 1..100 (default 50). Notes accept optional `chatId` and `listingId` filters, always within owner scope |
| `POST /seller-tools/{kind}` | Create and return row (201). Template title 1..120, body 1..4000; note title optional (max 120), body 1..8000. Plain text, never HTML |
| `GET`, `PUT`, `DELETE /seller-tools/{kind}/{id}` | Owner-only read, full replacement, deletion (204); absent/foreign IDs return 404 when the caller has write access |
| `GET /seller-tools/export` | Complete owner JSON attachment `seller-tools.json`, including every template and note, independent of list pagination |
| `POST /seller-tools/listings/bulk` | `{operation,listingIds:[UUID],price?}`; 1..50 unique non-null IDs; PRICE >=5000.00, max 2 fractional digits and 17 integral digits |
| `GET /profiles/me/appearance` | Saved `{pro,coverFileId,capability,validUntil}`, including saved cover metadata after downgrade |
| `PUT /profiles/me/appearance/cover` | Multipart `file`, exactly one image; shared media size/type/filename/magic guards, independent of the listing minimum photo count |
| `DELETE /profiles/me/appearance/cover` | Clear saved cover (204), paid-gated |

Rows contain `id,title,body,chatId,listingId,createdAt,updatedAt`; timestamps are ISO
UTC strings and template context fields are null. Notes require at least one
context: a current chat participant or listing owner may attach a new context.
Unchanged saved context survives ownership changes or deletion for retained reads,
export, and editing. The other chat participant cannot read a note. Notes/templates
never enter chat messages, public listing/chat DTOs, notifications, or Kafka payloads.

All saved-tool reads/export remain available after downgrade; creates, changes,
and deletion require the matching paid capability (`403 upgrade_required` for
Free; `503 plan_unavailable` for unknown/stale/malformed access). Expiry deletes
nothing. All these responses and the appearance response use `Cache-Control: no-store`.

Bulk response: `{results:[{listingId,success,code}]}` in request order. Each item
runs in its own transaction and rechecks capability, account ownership/link/archive
state, listing ownership and ACTIVE status after row locks. A failed item rolls back
without losing other successes. Codes include `ok`, `listing_not_found`,
`listing_not_active`, `account_archived`, `account_link_changed`, `upgrade_required`,
`plan_unavailable`, and `operation_failed`. Unpublish invokes existing account/listing
removal, retains the account, and clears its market link. Price edits invoke the
existing listing persistence path. Channel takedown, recommendation snapshot,
price transition, and analytics behavior remain on the existing lifecycle/DB triggers.
Account creation locks the persisted listing too; concurrent removal produces a
retained off-market account instead of a link to a removed listing.

Public `GET /api/v1/profiles/{userId}/appearance` returns only
`{pro,coverFileId,validUntil}`. Stale/unknown/Free/expired access yields
`false,null,null`, including unknown users. A live Pro decoration has an ISO
`validUntil` equal to the earliest subscription expiry or either projection's
24-hour freshness deadline. Clients must hide active decoration at that deadline.
The badge represents membership, without any verification/review/trust claim.
Uploads call the existing bot media API outside a DB transaction, then recheck
paid access in a short transaction before replacing saved metadata. Bot failure or
expiry during upload preserves the previous saved cover; no media reference in a
JSON body can set a cover.

`V84` adds `seller_reply_templates`, `seller_private_notes`, and
`profile_appearances`. Context IDs deliberately have no deleting foreign-key cascade,
so retained private data survives context removal. Existing
`efbazaar.auth.user-deleted` is consumed independently by
`marketplace-private-data-deleted` to purge that owner's rows on explicit account
deletion; this is distinct from subscription expiry and is idempotent. No new event
schema or topic, bot change, or gamer/tournament feature activation is required.


## Background music

`GET /api/v1/music` returns enabled tracks, sorted by `sortOrder`, `createdAt`, then
UUID `id`. Empty playlists return `[]`. Admin `GET /api/v1/admin/music` includes
disabled tracks in the same order. Admin `POST` creates (201), `PUT /{id}` replaces
metadata (200), and `DELETE /{id}` removes (204); absent IDs return 404. All admin
operations require `ROLE_ADMIN` through the existing trusted-header security chain.

Write JSON: `{title,artist,youtubeUrl,sortOrder,enabled}`. Title is required, trimmed
and at most 120 characters; artist is optional (empty by default), trimmed and at
most 120. Sort order must be a JSON integer 0–10000 and enabled a JSON boolean.
Response: `{id,title,artist,youtubeVideoId,sortOrder,enabled}`.

`youtubeUrl` accepts HTTP/HTTPS watch, shorts, embed, live links on exactly
`youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, or short
links on `youtu.be`. Video IDs must contain exactly 11 ASCII letters, digits,
underscores or hyphens. Credentials, explicit ports, duplicate `v` parameters,
unsupported paths/hosts and malformed IDs are rejected (400). URLs are parsed
locally; no server-side fetch, audio extraction or media proxy is involved.

`V85` adds `music_tracks` (`id`, `title`, `artist`, `youtube_video_id`, `sort_order`,
`enabled`, `created_at`) and an enabled-playlist ordering index. The migration seeds
no songs. There are no new events, consumers, secrets or visitor preference records.

`MusicIT` verifies real PostgreSQL/Flyway persistence, admin authorization, enabled
filtering, stable order, CRUD, URL allowlisting and request validation. Failsafe pins
Docker API 1.44 for integration tests because the bundled docker-java default (1.32)
is rejected by modern Docker, including GitHub runners. The Java 21 full gate is
`mvn -B -ntp clean verify`; no local API override is required.
