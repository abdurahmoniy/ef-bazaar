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
| `efbazaar.auth.user-registered` | auth | bot (ro'yxat topigi + profil rasmi), marketplace (referal, akkount) |
| `efbazaar.auth.google-linked` | auth | bot |
| `efbazaar.auth.user-logged-in` | auth | — |
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
| `efbazaar.marketplace.listing-snapshot` | marketplace (outbox snapshot, trigger) — `{ idempotencyKey, listingId, sellerId, status, price, valueScore, cards: [{efhubId, playerId}], version, occurredAt }`; kalit `listingId` | recommendation (projection; xato → `<topic>.DLT`) |
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
| `efbazaar.trade.imap-poll-request` — `{ tradeId, mailboxEmail, purpose, passwordContext?, encryptedPassword?, iv?, tag?, restart? }`; `tradeId` savdo yoki custom quti ulash sessiyasi id'si | `efbazaar.trade.konami-email-received`, `efbazaar.trade.imap-2fa-code`, `efbazaar.trade.konami-email-change-code-received` |
| `efbazaar.trade.imap-poll-stop-request` — `{ mailboxEmail }` | — |
| `efbazaar.trade.mailbox-rotate-request` | `efbazaar.trade.mailbox-rotated` |
| `efbazaar.trade.mailbox-delete-request` | — |

`konami-email-received`: `resetLinkPresent` faqat haqiqiy tiklash havolasi bo'lsa `true`
(yo'lida `password`/`reset`/`reminder` bor konami havolasi). `emailNotRegistered` (bool, eski
hodisalarda yo'q = `false`) — Konami "bu pochta Konami ID ga ulanmagan" deb javob berdi: savdo
shu qadamda qoladi, trade o'sha tarafning panelida emailni o'tkazishni so'raydi, worker esa
haqiqiy havolani kuzatishda davom etadi.

## payment

| Topic | Producer | Consumer(lar) |
|---|---|---|
| `efbazaar.payment.card-credit-observed` | userbot-payment | payment (kartaga pul tushdi) |
| `efbazaar.payment.card-debit-observed` | userbot-payment | payment (kartadan pul chiqdi) |
| `efbazaar.payment.userbot-heartbeat` | userbot-payment | payment (userbot tirikmi) |
| `efbazaar.payment.deposit-credited` | payment | marketplace (qo'ng'iroqcha), auth (enricher → bot) |
| `efbazaar.payment.withdrawal-requested` | payment | marketplace |
| `efbazaar.payment.withdrawal-closed` | payment | marketplace |
| `efbazaar.payment.plan-entitlements` | payment | trade (`plan_entitlement_view` projection) |
| `efbazaar.payment.subscription-changed` | payment | trade (`user_plan_view` projection) |

`plan-entitlements` payload: plan snapshot — `planCode` (kalit) va `entitlements` ichida
`mailbox.slots` hamda `mailbox.custom_slots` (`null` = cheksiz, aks holda butun son >= 0). Admin
`plans/entitlements` ni saqlaganda faqat o'zgargan plan uchun commit'dan keyin darhol chiqadi;
payment-service ishga tushganda barcha planlar qayta chiqadi.
`subscription-changed` esa DB commit'dan keyin chiqadi — xarid (`plans/purchase`) va admin
`plans/assign` va rol bo'yicha `STAFF` o'tkazish uchun. Commit'dan oldin tushgan rollback'li o'zgarish hech qachon chiqmaydi.
`STAFF` — ADMIN roli uchun yashirin tarif (`active=false`, narxsiz, ommaviy katalogda yo'q): barcha
huquqi `null` (cheksiz), panelda tahrirlanmaydi. `plan-entitlements` snapshot'i uni ham chiqaradi.
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
