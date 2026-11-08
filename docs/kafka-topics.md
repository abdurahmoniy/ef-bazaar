# Kafka topic katalogi

Har bir topic: kim chiqaradi (producer) va kim tinglaydi (consumer).
Koddan yig'ilgan (`@KafkaListener`, topic konstantalari, Python `topics.py`).
Yangi topic qo'shsangiz yoki consumer ulasangiz — shu jadvalni ham yangilang.

Konvensiya: `efbazaar.<servis>.<hodisa>` — kichik harf, defis bilan. Payload JSON,
har birida idempotency kaliti (odatda `idempotencyKey` yoki tabiiy kalit: `listingId`,
`telegramMessageId`, ...). Consumer takroriy xabarni zararsiz o'tkazishi shart.

Belgilar: **—** = repo ichida consumer yo'q (event chiqadi, lekin hech kim tinglamaydi;
kelajak uchun yoki tashqi loyiha uchun).

## auth

| Topic | Producer | Consumer(lar) |
|---|---|---|
| `efbazaar.auth.user-registered` | auth | bot (ro'yxat topigi + profil rasmi), marketplace (referal, kampaniya — `group marketplace-campaign-registration`, akkount), payment (idempotent Free identity) |
| `efbazaar.auth.google-linked` | auth | bot |
| `efbazaar.auth.user-logged-in` | auth | payment (existing identity recovery; paid plan is preserved) |
| `efbazaar.auth.user-photo-needed` | auth | bot (rasmni media topikka yuklaydi) |
| `efbazaar.auth.user-role-changed` | auth | trade (rol olinsa trade-admin profili o'chadi), payment (`group payment-service-user-role-changed`: `ADMIN` bo'lsa yashirin `STAFF` tarifiga o'tkazadi, `ADMIN` olinsa — faqat `source=ROLE` bo'lgan `STAFF`ni `STANDARD`ga qaytaradi) |
| `efbazaar.auth.user-deleted` | auth | marketplace |

## notifications (auth boyitadi → bot yuboradi)

auth-service'dagi "enricher"lar xom hodisani oladi, foydalanuvchi ismi / Telegram ID
bilan boyitadi va `notifications.*` ga qayta chiqaradi. Bot faqat shu boyitilgan
topiclarni tinglaydi — unda DB yo'q.

| Topic | Producer | Manba topic | Consumer |
|---|---|---|---|
| `efbazaar.notifications.chat-created` | auth (`ChatCreatedEnricher`) | `marketplace.chat-created` | bot (sotuvchiga DM) |
| `efbazaar.notifications.trade-action` | auth (`TradeActionEnricher`) | `trade.action-notification` | bot |
| `efbazaar.notifications.mailbox-handed-over` | auth (`MailboxHandedOverEnricher`) | `trade.mailbox-handed-over` | bot |
| `efbazaar.notifications.wallet-credited` | auth (`WalletCreditedEnricher`) | `payment.deposit-credited` | bot |

## marketplace

| Topic | Producer | Consumer(lar) |
|---|---|---|
| `efbazaar.marketplace.listing-created` | marketplace | — |
| `efbazaar.marketplace.listing-updated` | marketplace | — |
| `efbazaar.marketplace.listing-deleted` | marketplace | — |
| `efbazaar.marketplace.like-toggled` | marketplace (`listing_likes` trigger + outbox) — `{ idempotencyKey, listingId, userId, liked, version, occurredAt }`; kalit `listingId` | recommendation (projection; xato → `<topic>.DLT`) |
| `efbazaar.marketplace.listing-snapshot` | marketplace (outbox snapshot, trigger) — `{ idempotencyKey, listingId, sellerId, status, price, valueScore, cards: [{efhubId, playerId}], version, occurredAt, publishedAt?, publicationVersion? }`; kalit `listingId` | recommendation (projection; xato → `<topic>.DLT`) |
| `efbazaar.marketplace.card-snapshot` | marketplace (outbox snapshot; META/sync/chegara job) — `{ idempotencyKey, efhubId, playerId, type, overallRating, metaTier, metaPriority, activeFrom, activeUntil, version, occurredAt }`; kalit `efhubId` | recommendation (projection; xato → `<topic>.DLT`) |
| `efbazaar.marketplace.cards-added` | marketplace (kunlik efhub sync) — `{ occurredAt, totalAdded, cards: [{efhubId, type, name, overallRating}] }` | — |
| `efbazaar.marketplace.chat-created` | marketplace | auth (enricher → `notifications.chat-created`) |
| `efbazaar.marketplace.user-blacklisted` | marketplace | — (javadoc bo'yicha tashqi Chempionat-X) |
| `efbazaar.marketplace.user-unblacklisted` | marketplace | — (javadoc bo'yicha tashqi Chempionat-X) |
| `efbazaar.marketplace.bot-settings-updated` | marketplace | bot (/start keshini yangilaydi) |
| `efbazaar.marketplace.partner-application-submitted` | marketplace | bot (adminlarga xabar) |
| `efbazaar.marketplace.partner-approved` | marketplace | auth (PARTNER roli), bot (DM) |
| `efbazaar.marketplace.partner-rejected` | marketplace | bot (DM, sabab bilan) |
| `efbazaar.marketplace.partner-cancelled` | marketplace | auth (rol olinadi), bot (DM; `bySelf` bo'lsa jim) |
| `efbazaar.marketplace.channel-post-requested` | marketplace | bot (hamkor kanaliga joylaydi) |
| `efbazaar.marketplace.channel-post-edit-requested` | marketplace | bot (sotildi — matn ustidan chiziladi) |
| `efbazaar.marketplace.channel-post-delete-requested` | marketplace | bot (qayta yuborilganda eskisini o'chiradi) |
| `efbazaar.marketplace.channel-refresh-requested` | marketplace | bot (obunachi soni, nom, avatar) |
| `efbazaar.marketplace.official-post-requested` | marketplace | bot (efBazaar rasmiy kanali) |
| `efbazaar.marketplace.support-message-created` | marketplace | bot (support topigiga) |
| `efbazaar.marketplace.account-email-unlinked` | marketplace — `{ accountId, ownerId, mailboxId, reason, at }` (`reason`: `SOLD`, `SWAPPED`, `SOLD_ELSEWHERE`, `EDITED`, `RELINKED`, `DELETED`, `IGNORED` — marketplace `account-email-verified` ni qabul qilmadi: akkount yo'q, boshqa egada yoki arxivda); kalit `accountId`; commit'dan keyin | trade (`mailboxes.linked_account_id` ni tozalaydi — faqat hali o'sha akkountga ulangan bo'lsa) |

## bot

| Topic | Producer | Consumer(lar) |
|---|---|---|
| `efbazaar.bot.user-photo-set` | bot | auth (profil rasmi `file_id`) |
| `efbazaar.bot.support-message-bound` | bot | marketplace |
| `efbazaar.bot.support-reply-received` | bot | marketplace (admin Telegram'dan javob berdi) |
| `efbazaar.bot.media-uploaded` | bot — `{ listingId, accountId, telegramMessageId, mediaType }`, ikkala id nullable | — |

## trade

| Topic | Producer | Consumer(lar) |
|---|---|---|
| `efbazaar.trade.proposal-created` | trade | marketplace (chatda taklif) |
| `efbazaar.trade.proposal-resolved` | trade | marketplace |
| `efbazaar.trade.action-notification` | trade | marketplace (qo'ng'iroqcha), auth (enricher → bot) |
| `efbazaar.trade.admin-invited` | trade | marketplace (TRADE_ADMIN_INVITED bildirishnomasi) |
| `efbazaar.trade.listing-sold` | trade | marketplace (e'lon SOLD) |
| `efbazaar.trade.trade-succeeded` | trade — `{ tradeId, buyerId, sellerId, listingId, mode }` | marketplace (referal mukofoti, akkount xaridorga ko'chadi) |
| `efbazaar.trade.seller-trade-completed` | trade (SUCCESS + durable outbox) — `{ idempotencyKey, tradeId, listingId, sellerId, buyerId, kind, mode, priceUzs, completedAt }`; key `tradeId` | marketplace (`marketplace-service-seller-completions`; seller analytics) |
| `efbazaar.trade.mailbox-handed-over` | trade | marketplace, auth (enricher → bot) |
| `efbazaar.trade.trade-opened` | trade | — |
| `efbazaar.trade.trade-closed` | trade | — |
| `efbazaar.trade.account-email-verified` | trade — `{ sessionId, accountId, ownerId, mailboxId, email, custom, verifiedAt }`; kalit `accountId`; quti ulash sessiyasi `VERIFIED` bo'lganda va `republish` da | marketplace (akkountga email, `email_verified`, `custom` bo'lsa `CUSTOM` manba; `sessionId` bo'yicha idempotent) |
| `chat.changed.v1` | trade (`ChatChangePublisher`) | marketplace (chat WebSocket'ini yangilaydi) |

### trade ↔ smart-admin-worker

So'rovlarni trade chiqaradi, worker bajaradi va natijani qaytaradi.
`local` / `test` / `mockworker` profillarida worker o'rniga trade ichidagi `MockWorker`
so'rov topiclarini tinglaydi.

| So'rov (trade → worker) | Natija (worker → trade) |
|---|---|
| `efbazaar.trade.email-provision-request` | `efbazaar.trade.email-provisioned`, `efbazaar.trade.email-provision-failed` |
| `efbazaar.trade.mailbox-provision-request` (admin yoki custom, savdosiz quti) — `{ mailboxId, localPart, domain, custom }`; `domain` bo'lmasa `efbazaar.uz`; `custom: true` (user tanlagan nom) — Mailcow'da bunday quti allaqachon bo'lsa worker uni o'ziniki deb hisoblamaydi: `mailbox-provisioned` yubormaydi, adminlarga xabar beradi | `efbazaar.trade.mailbox-provisioned` |
| `efbazaar.trade.forgot-password-request` | `efbazaar.trade.worker-queued`, `efbazaar.trade.worker-started` (backpressure; tiklash xati IMAP poll orqali keladi) |
| `efbazaar.trade.imap-poll-request` — `{ tradeId, mailboxEmail, purpose, passwordContext?, encryptedPassword?, iv?, tag?, restart? }`; `tradeId` savdo, custom quti ulash yoki release-check id'si | `efbazaar.trade.konami-email-received`, `efbazaar.trade.imap-2fa-code`, `efbazaar.trade.konami-email-change-code-received` |
| `efbazaar.trade.imap-poll-stop-request` — `{ mailboxEmail }` | — |
| `efbazaar.trade.mailbox-rotate-request` | `efbazaar.trade.mailbox-rotated` |
| `efbazaar.trade.mailbox-delete-request` — durable nonce + mailbox ID/address; uncorrelated legacy so‘rov bajarilmaydi | `efbazaar.trade.mailbox-delete-result` (`trade-service-mailbox-delete-result`; nonce/address/current responsibility tekshiriladi) |
| `efbazaar.trade.mailbox-inventory-request` — deployment domenlari, durable request ID | `efbazaar.trade.mailbox-inventory-observed` (`trade-service-mailbox-inventory`; to‘liq successful sahifalar atomik qo‘llanadi) |

`konami-email-received`: `resetLinkPresent` faqat haqiqiy tiklash havolasi bo'lsa `true`
(yo'lida `password`/`reset`/`reminder` bor konami havolasi). `emailNotRegistered` (bool, eski
hodisalarda yo'q = `false`) — Konami "bu pochta Konami ID ga ulanmagan" deb javob berdi: savdo
shu qadamda qoladi, trade o'sha tarafning panelida emailni o'tkazishni so'raydi, worker esa
haqiqiy havolani kuzatishda davom etadi.

B bosqichda `email-provisioned` yozuvi trade row locki va ikki participantning
barqaror tartibdagi quota locklari ostida qayd etiladi. Faqat shu savdoning main/side
`RANDOM` qutisi qabul qilinadi; custom yoki begona id huquq/credentials bermaydi.
Dastlabki provisioning credentialsi bir marta yoziladi — replay keyingi parol
rotationini orqaga qaytarmaydi. Swapning bir tomoni xato berganidan keyin boshqa
tomonning muvaffaqiyat xabari kechiksa ham, ma’lum haqiqiy quti manba tomonning
`retained_user_id` hisobida qoladi; terminal savdo qayta ochilmaydi va yangi inbox
kirishi berilmaydi. Hali yaratilmagan placeholder failure’da rezervdan chiqadi.
Worker javobi umuman yetib kelmagan tashqi holatni solishtirish C bosqichida qoladi.

## payment

| Topic | Producer | Consumer(lar) |
|---|---|---|
| `efbazaar.payment.card-credit-observed` | userbot-payment | payment (kartaga pul tushdi) |
| `efbazaar.payment.card-debit-observed` | userbot-payment | payment (kartadan pul chiqdi) |
| `efbazaar.payment.userbot-heartbeat` | userbot-payment | payment (userbot tirikmi) |
| `efbazaar.payment.deposit-credited` | payment | marketplace (qo'ng'iroqcha), auth (enricher → bot) |
| `efbazaar.payment.withdrawal-requested` | payment | marketplace |
| `efbazaar.payment.withdrawal-closed` | payment | marketplace |
| `efbazaar.payment.plan-entitlements` | payment | trade, marketplace, recommendation (plan capability projection) |
| `efbazaar.payment.subscription-changed` | payment | trade, marketplace, recommendation (subscription projection) |

`plan-entitlements`: `{planCode, entitlements, occurredAt, version, idempotencyKey}`.
`subscription-changed`: `{userId, planCode, expiresAt, occurredAt, version, idempotencyKey, lastPaidExpiresAt?}`.
`lastPaidExpiresAt` — C bosqichdagi tarixiy pochta muddati; STANDARD/STAFF snapshotda ham saqlanadi.
Marketplace/recommendation bu maydonni qabul qiladi, ammo Pro grant bermaydi; trade grace/recovery uchun ishlatadi.
`entitlements` to‘liq xarita; `mailbox.total_slots`/`mailbox.custom_slots`: null = aniq cheksiz,
butun son >=0 = limit. Yo‘q/invalid kalit cheksiz ruxsat emas. B bosqichda total — random va customni birga
sanaydigan umumiy sig‘im, custom — shu jami ichida yangi nomli quti yaratish sublimiti.
Legacy `mailbox.slots` random-only tarixiy kalit bo‘lib qoladi; yangi consumer unga total
sifatida fallback qilmaydi. Payload formati/versiya/idempotency siyosati o‘zgarmaydi.

Payment V18: immutable payload biznes o‘zgarishi bilan bitta tranzaksiyada
`outbox_events`ga yoziladi, relay broker tiklangach retry qiladi. `version` tegishli
entity qulfi ostida global sequence’dan olinadi; `idempotencyKey` subscription uchun
`subscription:<userId>:<version>`, plan uchun `plan:<planCode>:<version>`.
Consumer bir entityga kelgan faqat kattaroq versiyani atomik qo‘llaydi. Free/expired
obunalar ham saqlanadi, eski Pro hodisasi downgrade’ni qaytara olmaydi.

Startup va har soat (`payment.scheduler.plan-replay-interval-ms`) barcha saqlangan
obuna va plan snapshotlari yangi versiya bilan navbatlanadi. `occurredAt` producer
snapshot vaqti, delivery vaqti emas. 24 soatdan eski yoki version/idempotencyKey’siz
legacy snapshot yangi pullik huquq bermaydi. Consumerlar oldin, producer keyin
yangilanadi; consumer replay orqali tiklanadi. Marketplace/recommendation bu bosqichda
faqat projection va readiness-aware capability o‘qishni tayyorlaydi; D/E/F funksiyalari yo‘q.
Trade mavjud pochtani o‘qishda oxirgi ma’lum, muddati tugamagan huquqni saqlaydi;
projection kechikishi yangi ajratishni to‘sadi, mavjud inboxlarni o‘zi qulflamaydi.
Ma’lum faol pullik obunaning huquqi tayyor bo‘lmasa yangi allocation/custom claim
`503 plan_projection_unavailable` qaytaradi; haqiqiy expiry/downgrade qoidalari saqlanadi.
`STAFF` — ADMIN roli uchun yashirin tarif (`active=false`, narxsiz, ommaviy katalogda yo'q): barcha
budget huquqi `null` (cheksiz), boolean huquqi aniq `true`; panelda tahrirlanmaydi. `plan-entitlements` snapshot'i uni ham chiqaradi.
payment `user-role-changed` yozuvini `spring.json.use.type.headers=false` bilan o'qiydi (auth
`__TypeId__` ni o'z klassi bilan yozadi); o'qib bo'lmagan yozuv `.DLT` ga tushadi.

`card-credit-observed` va `card-debit-observed` payload'larida ixtiyoriy `userbotTelegramId` (Long) —
kuzatgan Telegram akkountining id'si. Idempotency kaliti `(userbotTelegramId, telegramMessageId)`:
xabar id'lari faqat bitta akkount ichida noyob. Maydonsiz xabar eski userbotdan, `NULL` sifatida saqlanadi.

## Tashqi (Chempionat-X turnir loyihasi)

| Topic | Producer | Consumer |
|---|---|---|
| `efbazaar.tournament.match-finished` | Chempionat-X | marketplace (`gamer_stats`) |
| `efbazaar.tournament.elo-updated` | Chempionat-X | marketplace (`gamer_stats`) |

## Tizim

| Topic | Producer | Consumer |
|---|---|---|
| `efbazaar.system.log-event` | auth, marketplace, trade, payment (`KafkaLogForwarder`), smart-admin-worker, userbot-core, userbot-payment | bot (WARN/ERROR → Telegram logs topigi) |

access-service va bot o'zi bu topicga yozmaydi.


### C bosqichdagi Mailcow resurs protokoli

Trade durable DB request yaratadi va broker acknowledgement bilan yuboradi; worker
natijani publish acknowledgement kelmaguncha request offsetini commit qilmaydi.

- Inventory request: `{requestId,domains:[...]}`; observed: `{requestId,observedAt,page,lastPage,
  success,error,mailboxes:[{mailboxEmail,usedBytes,quotaBytes,active}]}`. `page` 0 dan,
  ko‘pi bilan 100 qator; bitta run sahifalari bir xil `observedAt` bilan. Faqat barcha
  0..lastPage sahifalar muvaffaqiyatli, valid va duplicate manzilsiz kelganda eng yangi
  correlated run qo‘llanadi. Error/timeout/stale — 0 bayt yoki quti yo‘qligi emas.
  Mailcow GET `quota`/`quota_used` qiymatlari bayt; yaratishdagi `quota` esa MiB.
- Delete request: `{mailboxId,mailboxEmail,requestId?}`; result:
  `{requestId,mailboxId,mailboxEmail,success,alreadyAbsent,error,occurredAt}`.
  Eski request ham dekodlanadi, lekin nonce bo‘lmagan destructive so‘rov worker’da bajarilmaydi; javob trade’dagi slotni bo‘shatmaydi.
  HTTP200 ichidagi `access_denied`/mixed error muvaffaqiyat emas. Faqat tasdiqlangan
  success/aniq not-found yoki requestdan yangi to‘liq successful inventardagi absence
  hisobni bo‘shatadi. Pending/failed paytida mas’uliyat va manzil muzlatiladi.
- Release proof `imap-poll-request`ning yangi `VERIFY_RELEASE` oqimidan foydalanadi:
  `tradeId` — release-check nonce; `startedAt`/`expiresAt` — uning immutable vaqt oynasi.
  Yangi negative Konami xati aynan request/address, 10 daqiqalik muddat va workerning
  `originVerified=true` DKIM natijasi bilan tekshiriladi. Eski/missing flag false hisoblanadi. Local detach/linkedAccountId=null isbot emas.
  Konami forgot-password brauzer amali foydalanuvchi tomonidan boshlanadi; worker
  datacenterdan avtomatik Konami so‘roviga tayanilmaydi.


C provisioning v2: `email-provision-request` va `mailbox-provision-request` additive
`addressVersion=2` yuboradi. Random manzil `trade-<mailbox UUID, hyphensiz>@domain`;
8 belgili eski nom qayta yaratish uchun ishlatilmaydi. Worker Mailcow create’dan
**oldin** secret bilan `/internal/mailboxes/{id}/provision-claim`dan bir martalik
ruxsat oladi. STARTED DB yozuvi immutable seal+responsibilityni saqlaydi. Duplicate
STARTED create/rotate qilmaydi: faqat original seal bilan read-only IMAP login
isboti orqali oldingi muvaffaqiyatni qayta e’lon qilishi mumkin. Natija payloadlari
optional `claimId` oladi; claim bor qutida nonce/address/sealning barchasi mos bo‘lishi
shart. UNKNOWN claim avtomatik TTL bilan ochilmaydi; slot va manzil saqlanadi.
Legacy natija faqat claim bo‘lmagan tarixiy qutiga, rezervlangan identityga mos
kelganda qabul qilinadi. Workerlar aralash eski/yangi versiyada ishlatilmaydi.

## D — saved-search and price-watch delivery

| Topic | Producer / payload | Consumer |
|---|---|---|
| `efbazaar.recommendation.watch-candidate` | recommendation durable intent dispatcher; key userId; `{idempotencyKey,intentId,userId,listingId,publicationVersion,publishedAt,reasons:[{watchId,label}],occurredAt}` | marketplace `marketplace-watch-candidates` (earliest, JSON without Java type headers) |

`listing-snapshot` now appends actual source `publishedAt` and
`publicationVersion`, independent of snapshot relay `occurredAt`/`version`.
Legacy publication version 0 or missing metadata is baseline-only. A genuine
new ACTIVE publication after a watch's baseline can match even when it is the
first snapshot of that listing; replay of old listings does not become a new
publication. Accepted snapshot versions cannot roll publication identity back.

Price history is not reconstructed from snapshots: marketplace records each
actual numeric old/new price transition and monotonically increasing price
version in the same transaction as the listing mutation. No-change edits do
not create a price event. Price event and publication keys remain distinct so
multiple real changes in one publication are not silently collapsed as replay.

Search candidates aggregate matching searches per user/listing/publication.
Their broker send is at-least-once from a durable intent row, with stable keys
and bounded retry backoff; marketplace's unique intent identity absorbs
replays. Before delivery marketplace rechecks current listing status/owner,
common opt-in and fresh entitlement grants. It asks recommendation
`POST /internal/rec/v1/watches/authorize` using `X-Internal-Secret` to recheck the
current search, generation, criteria and per-watch opt-in; an unavailable
service defers rather than granting a stale search permission. Neither service
reads another service's DB. Compose forwards the existing `INTERNAL_API_SECRET`
to recommendation for this route.

Payment's full entitlement snapshot carries `watch.search_limit` (Free1/Pro5),
`watch.price_limit` (Free3/Pro20), and `watch.immediate` (Freefalse/Protrue).
Explicit null budgets mean STAFF unlimited; missing/invalid/stale keys do not.
Payment initializes a missing canonical Free identity on authenticated
`plans/me` and existing auth registration/login events (`payment-service-plan-identities`,
bare JSON `{userId,occurredAt,...}`). Insert-on-conflict plus the subscription
row lock emits one initial snapshot and never assigns over an existing paid/STAFF
subscription. The frontend awaits canonical lookup or offers an explicit retry;
asynchronous missing projections remain unavailable rather than granting locally.

Paid mailbox history or grace never grants Pro alerts. MAX remains historical,
not offered for sale, and retains 5/20/immediate watch policy.

The durable in-app result uses `WATCH_MATCH`/`WATCH_DIGEST` and bounded
`watchPayload={items:[{listingId,reasons:[string],oldPrice?,newPrice?}],totalCount,remainingCount}`.
At most 20 listing items and five bounded reasons per item are exposed in one
payload. User names remain plain text. Telegram identity is resolved through
auth's existing summary API; marketplace calls bot's secret-protected
`POST /bot/internal/watches/dm` only after committing its external delivery claim.
A timeout/crash with unknown Telegram outcome remains `UNCONFIRMED`/`SENDING`
and is not automatically resent; external exactly-once delivery is not claimed.
No real Telegram delivery occurs during local verification.


## E — seller analytics facts

`efbazaar.trade.seller-trade-completed` is recorded in the SUCCESS transaction
after required settlement, with deterministic `seller-trade-completed:<tradeId>`
identity and the frozen agreed price in UZS. Kafka acknowledgement/retry uses the
durable outbox. Marketplace stores the receipt and daily increment atomically;
replay cannot increment twice. A failed/rolled-back SUCCESS creates no fact.
Missing listing data leaves a pending receipt for later retry. Existing
`listing-sold`/`trade-succeeded` contracts remain; `listing-sold` also covers swaps
and lacks trade identity/kind, so it is not an analytics revenue source.

Only explicit SALE contributes gross completed-sale amount. SWAP and
SWAP_SURCHARGE contribute no sales amount. HUMAN completion has no wallet
settlement: this is agreed gross completed-sale volume, not net wallet proceeds
or profit. Source `completedAt` and frozen `priceUzs` are preserved; current
listing price, archive metadata and consumer/relay time cannot replace them.
Historical monetary facts are not invented.

Marketplace local durable records capture first-unique views, new favorite
additions since collection starts, and the first real `(listingId,requesterId)`
account request. Existing view/request rows supply actual first timestamps;
daily repeat visits, removed favorites and absent old inquiries cannot be
reconstructed. Chat navigation and `chats.createdAt` are not inquiry sources.
These local facts are not public Kafka topics and do not depend on collapsing
recommendation snapshots. Asia/Samarkand determines reporting days. Reports and
CSV expose only the authenticated seller's currently visible own listings,
without buyer, guest or private message identities.

Payment snapshots add `analytics.history_days` (Free `0`, Pro/MAX `90`, STAFF
explicit null) and `analytics.export` (Free `false`, Pro/MAX/STAFF `true`). Missing,
invalid or stale grants allow no paid history/export; basic Free counts remain.
Coverage exposes collection start and metric-specific history limits. Selecting
90 days does not promise that 90 complete days already exist. Monetary totals
are decimal strings in JSON to preserve exact UZS above JavaScript safe integers.


### Marketplace seller private-data cleanup (F)

The existing `efbazaar.auth.user-deleted` payload is also consumed by marketplace
in group `marketplace-private-data-deleted` (`SellerPrivateDataDeletedConsumer`).
It idempotently deletes only that user's reply templates, private notes, and saved
profile appearance. Subscription downgrade/expiry does not invoke this cleanup.
Seller private text never appears in any Kafka event. Product booleans
`seller.tools`, `seller.bulk`, and `profile.decoration` travel in the unchanged
payment plan-entitlements snapshot map (`false` on STANDARD, `true` on PRO/MAX/STAFF).
