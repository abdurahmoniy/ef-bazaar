# trade-service

Savdoning butun hayot sikli: taklif (proposal) → savdo ochilishi → akkountni escrow
pochtaga o'tkazish → tekshiruv → to'lov → akkountni xaridorga topshirish → yopilish.
Holatlar mashinasi (`TradeStateMachine`), har tomon uchun shifrlangan chat, parolni bir
martalik uzatish, escrow pochta qutilari, trade-admin'lar va reytinglar shu yerda.

| | |
|---|---|
| Port | 8085 |
| Public yo'l | `/api/trade/**` → `/api/**` (token shart, aks holda 401); STOMP WebSocket `/ws/trade` |
| DB | `TRADE_DB_NAME` (Flyway `V1`–`V43`) |
| Redis | takliflar (10 daqiqa TTL), bir martalik parol, presence, recheck rate limit, deadline uzaytirish |
| Shifrlash | `MASTER_KEY_FILE` + HKDF (`crypto/`) — chat xabarlari va maxfiy maydonlar |

## Savdo turlari

| O'lcham | Qiymatlar | Ma'nosi |
|---|---|---|
| `TradeMode` | `SMART` | Avtomatik: smart-admin-worker pochta ochadi, Konami parolini tiklaydi, IMAP'dan kodlarni o'qiydi |
| | `HUMAN` | Inson trade-admin boshqaradi; qadamlar `TradeStep` checklist'i orqali belgilanadi |
| `TradeKind` | `SALE`, `SWAP`, `SWAP_SURCHARGE` | Sotuv, obmen, obmen + doplata. Obmenda har tomonga alohida pochta qutisi |
| `ParticipantRole` | `SELLER`, `BUYER` | Chat va harakatlar rolga qarab ajratiladi |

Holatlar (`TradeState`): `INITIATED`, `WAITING_PAYMENT`, `WAITING_EMAIL_CHANGE`, `VERIFYING_KONAMI_LINK`,
`WAITING_PASSWORD`, `WAITING_BUYER_VERIFY`, `WAITING_ADMIN`, `IN_PROGRESS`, `WAITING_CLOSE_CONFIRM`;
yakuniy: `SUCCESS`, `REJECTED`, `ORPHANED`. Qaysi holatdan qaysisiga o'tish mumkinligi rejim va
turga bog'liq — manba `TradeStateMachine`. O'tishlar faqat u orqali;
har o'zgarish `trade_audit_log` ga yoziladi (`TradeAuditService` — yagona yozuvchi, update/delete yo'q).

## Paketlar

| Paket | Vazifasi |
|---|---|
| `trade` | Savdo, taklif, holatlar mashinasi, xabarlar, bir martalik parol, sweeper'lar, `ws` (STOMP push) |
| `mailbox`, `mail` | Escrow pochta qutilari (Mailcow), foydalanuvchi uchun IMAP o‘qish, aniq xatlarni tasdiqlangan cleanup va archive export (mail.efbazaar.uz frontendi shu API'ni ishlatadi) |
| `admin` | Trade-admin: profil, katalog, taklif qilish (invite → accept/decline), ish navbati, eskalatsiya, SMART savdoga qo'lda aralashish |
| `seller` | Sotuvchi reytingi (xaridordan 1–5) |
| `plan` | payment projection; `MailboxSlotService` random/custom uchun yagona `mailbox.total_slots` resource poolini hisoblaydi. `CustomSlotService` yangi custom nom yaratishdagi `mailbox.custom_slots` sublimitini tekshiradi. `MailboxAccessService` mavjud qutilarni yagona access-priority tartibida ochadi/qulflaydi; admin sovg‘alari va qarzga berilgan jonli human escrow qutilari kvotadan mustasno. |
| `payment` | `EscrowClient` — payment-service `/internal/trades/{id}/escrow/*` (trade so'mda, payment tiyinda hisoblaydi) |
| `marketplace`, `partner`, `security` | marketplace (e'lon shartlari, akkount), hamkor attributsiyasi, auth (ismlar) HTTP klientlari |
| `card` | Foydalanuvchining bank kartalari (PAN shifrlangan, Luhn tekshiruvi). Hozir faqat o'z CRUD'i bor — boshqa kod ishlatmaydi |
| `crypto` | Master key va HKDF asosidagi shifrlash |
| `kafka` | Worker natijalari, plan projection, rol o'zgarishi consumerlari; `MockWorker` (faqat `local`/`test`/`mockworker` profilida) |

## API

| Guruh | Endpointlar (`/api/v1/...`) |
|---|---|
| Takliflar | `GET/POST /trades/proposals`, `POST /trades/proposals/{id}/accept`, `/reject` |
| Savdolar | `GET /trades`, `GET /trades/{id}`, `GET /trades/busy-accounts` |
| Harakatlar | `POST /trades/{id}/actions/`: `confirm`, `reject`, `payment-confirmed`, `email-changed`, `email-change-code`, `login-code`, `recheck`, `assign-admin`, `close-confirm` |
| Xabarlar | `GET/POST /trades/{id}/messages`, `POST .../messages/password`, `POST .../messages/{msgId}/reveal` |
| Trade-admin | `/trade-admins`, `/trade-admins/me`, `/me/invitations`, `/me/trades`; `/trades/{id}/actions/admin-accept|admin-decline|admin-cancel|admin-close`; `/trades/{id}/steps` |
| Reytinglar | `POST /trades/{id}/rating`, `/trades/{id}/seller-rating`, `/sellers/{id}/ratings`, `/rating-summary`, `POST /sellers/rating-summaries/batch` |
| Custom qutilar | `GET /mailboxes/custom/availability?localPart=&domain=` → `{email, available, reason, canClaim, claimBlock}` (`reason`: `TAKEN` — o'chirilgan qator ham, `RESERVED`, `INVALID` — 5–24 belgi `[a-z0-9]`, `DOMAIN_NOT_ALLOWED`; `claimBlock`: `PLAN_DOMAIN` — boshqa domen faqat `MAILBOX_PREMIUM_DOMAIN_PLANS`, `NO_SLOT`); `POST /mailboxes/custom {localPart, domain}` → 202 (`source=USER`, `kind=CUSTOM`; xatolar 400 `invalid`/`reserved`/`domain_not_allowed`, 403 `plan_domain`/`no_slot`, 409 `taken`); `GET /mailboxes/custom` — `{id, email, provisioned, locked, linkedAccountId, activeSessionId}` |
| Quti ulash | `POST /mailboxes/{id}/link-sessions {accountId, emailAlreadySet}` → 201 (`emailAlreadySet` — akkount emaili allaqachon shu quti: to'g'ridan `WAIT_RESET`; xatolar 404, 409 `mailbox_pending`/`mailbox_in_trade` (savdodagi RANDOM quti)/`mailbox_linked`/`session_live`, 403 `mailbox_locked`); `GET /mailboxes/link-sessions/{sid}` → `{id, mailboxId, email, accountId, state, stepDeadline, emailChangeCode, notRegistered}`; `POST .../{sid}/email-changed`, `/retry`, `DELETE .../{sid}` (409 `invalid_state`). Holatlar `WAIT_EMAIL_CHANGE → WAIT_RESET → VERIFIED`, yon `EXPIRED`/`CANCELLED`; har qadam `MAILBOX_LINK_STEP_MINUTES` (15). Jadval `mailbox_link_sessions`; `mailboxes.linked_account_id` — quti tasdiqlangan akkount. Bitta quti — bitta akkount: `retry`/`email-changed` ham `open` kabi tekshiriladi, boshqa akkountga ulangan qutida reset xati sessiyani bekor qiladi, `republish` faqat quti hali o'sha akkountda bo'lsa. Qadam boshlanishidan oldingi reset xati e'tiborsiz (poller qayta boshlanadi). Quti egasi o'zgarsa (detach, admin detach/reassign) sessiyalar bekor qilinadi va bog'lanish uziladi; sessiyani faqat qutining hozirgi egasi ko'radi va boshqaradi. Custom qutini user bo'shata olmaydi — `POST /mailboxes/{id}/detach` 409 `custom_mailbox_permanent` |
| Pochta | `/mailboxes`, `/mailboxes/slots`, `/mailboxes/{id}/detach`, `/name`, `POST /mailboxes/{id}/unlock` (body `{lockInsteadId}` → 204; qulflangan qutini ochiq quti bilan almashtiradi, aks holda 409 `invalid_unlock_swap`); `/mail/mailboxes`, `/mail/{mailboxId}/inbox`, `/messages/{id}`, attachments. Ro'yxat/summary qatorida `locked`, `kind`, `linkedAccountId` (`GET /mailboxes` da yana `activeSessionId`, `provisionedAt`, `slotExempt`, `activeTrade` — frontend bo'sh qolgan custom va savdo qutilarini shu bilan topadi) (qulflangan qutida `unreadCount`/`lastActivityAt` null, IMAP ochilmaydi), `/mailboxes/slots` da `lockedCount`. C bosqichida `locked=true` RECOVERY degani: inbox faqat tasniflangan Konami recovery/security xatlarini ko‘rsatadi; to‘g‘ridan UID, attachment va o‘qilgan qilish ham shu filtrdan o‘tadi. Admin endpointlar va smart-admin-worker IMAP‘i alohida ruxsatga ega |
| Admin | `/admin/mailboxes/**` (`POST /admin/mailboxes` body `{localPart, ownerUserId, domain?}` — `domain` `MAILBOX_DOMAINS` ro'yxatidan, bo'lmasa birinchisi, aks holda 400 `domain_not_allowed`; `GET /admin/mailboxes/domains`), `/admin/smart-trades/**`, `/admin/trades/escalated`, `/admin/trades/{id}/cancel`, `/reassign`, reytingni yashirish |
| Ichki | `GET /internal/trades/live` (marketplace) |

## Kafka

- Chiqaradi: `trade.proposal-*`, `trade.action-notification`, `trade.admin-invited`,
  `trade.listing-sold`, `trade.trade-succeeded`, `trade.mailbox-handed-over`,
  `trade.trade-opened` / `trade-closed`, `trade.account-email-verified`, `chat.changed.v1` va worker'ga
  so'rovlar (`imap-poll-stop-request` ham).
- Tinglaydi: worker natijalari, `payment.plan-entitlements`, `payment.subscription-changed`,
  `auth.user-role-changed`, `marketplace.account-email-unlinked`. Quti ulash sessiyasi bor quti uchun
  worker javoblari (`konami-email-received`, `konami-email-change-code-received`) savdoga emas, sessiyaga
  boradi (manzil bo'yicha).
- Worker bilan so'rov/natija juftlari: [docs/kafka-topics.md](../../docs/kafka-topics.md#trade--smart-admin-worker).

## Rejali job'lar

| Job | Oraliq (default) | Vazifasi |
|---|---|---|
| `TradeTimeoutScheduler` | 10 s | `state_deadline` o'tgan savdolarga `TIMEOUT` hodisasini beradi |
| `TradeEscrowSweeper` | 60 s | Birinchi urinishda o'tmagan escrow harakatlarini qayta bajaradi |
| `LinkSessionSweeper` | 30 s | Muddati o'tgan quti ulash qadamlarini `EXPIRED` qiladi va worker poller'ini to'xtatadi |
| `TradeEscalationSweeper` | 60 s | `IN_PROGRESS` da uzoq harakatsiz qolgan savdolarni eskalatsiya qiladi (alohida ustun — `IN_PROGRESS` da `TIMEOUT` o'tishi yo'q) |

## Ehtiyot bo'l

- Holatni to'g'ridan-to'g'ri `UPDATE` qilmang — faqat `TradeStateMachine`. Sekin o'tish
  savdo allaqachon o'tib ketgan holatni yozib yubormasligi uchun tekshiruvlar bor.
- Har savdoda **yangi** pochta qutisi. Qutini qayta ishlatish obmenda ikki akkountni
  bitta pochtaga bog'lab yo'qotishi mumkin.
- Worker band bo'lsa `worker-queued` keladi va deadline uzayadi — savdo jim yetim qolmasligi kerak.
- Pul birliklari: trade so'mda (`price_uzs`), payment tiyinda. Konvertatsiya `EscrowClient` ichida.

## Test

`mvn -B -ntp clean verify` — 345 unit, 443 integratsion (`*IT`) (E bosqich, lokal Java 21).

### Konami verification-code notifications

Fresh email-change and login OTP reports (4–8 ASCII digits, five-minute lifetime) emit
`trade.action-notification` actions `EMAIL_CHANGE_CODE_RECEIVED` and `LOGIN_CODE_RECEIVED`.
`details` carries the code and `occurredAt` keeps the email detection time. Email-change
codes go to the mailbox's transferring party; login codes go to the receiving party.
Unknown mailboxes and addressless swap reports are dropped. Atomic timestamp guards
prevent worker replays and older reports from replacing or announcing newer codes.
Admin-supplied codes use the same notification pipeline. Chat-change events refresh
the authorized participant's trade panel; auth enriches bot identity and marketplace
creates code-bearing notifications/push messages.

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

Trade `EntitlementService` noma’lum, manfiy yoki noto‘g‘ri numeric capabilityni
0 deb oladi; faqat yangi, aniq `null` grant cheksizdir. Pullik obuna snapshoti
eskirsa Free holatga tushadi. Payment vaqtincha yetib kelmaganida asosiy savdo
uchun Free jami mailbox fallbacki 3; custom va boshqa pullik capabilitylar
berilmaydi. Jonli savdo pochtasining mavjud kirish himoyasi saqlanadi.
B bosqichida random/custom bir umumiy poolga birlashtirilgan (quyida).

Mavjud egaga tegishli pochtani o‘qish alohida siyosatga ega: snapshot kechiksa,
oxirgi ma’lum, muddati tugamagan plan va valid limit ishlatiladi;
subscription qatori butunlay yo‘q bo‘lsa, mavjud o‘qish ruxsati saqlanadi
(aniq STANDARD tombstone va haqiqiy expiry bundan mustasno); yo‘q yoki buzilgan
read limit mavjud qutini yangi qulflamaydi. C bosqichida haqiqiy pullik expiry
Free limitidan ortiq qutilar uchun 30 kun GRACE, keyin RECOVERY beradi.
Bu faqat o‘qish; yangi allocation huquqi emas.

Ma’lum, hali muddati tugamagan pullik obuna uchun subscription yoki zarur mailbox
entitlementi eski/yo‘q/buzilgan bo‘lsa, yangi savdo allocationi va
`GET /api/v1/mailboxes/custom/availability`, `POST /api/v1/mailboxes/custom`
`503 {code: "plan_projection_unavailable", message: ...}` qaytaradi. Bu quota
band yoki tarifni yangilang degani emas; keyinroq takrorlash kerak. Free fallback
(3 random quti) va oddiy Free/custom ruxsat xatolari o‘z holicha qoladi.


## Free/Pro — yagona mailbox pool (B bosqich)

`mailbox.total_slots` — yangi, aniq jami limit: STANDARD (Free) 3, PRO 10,
STAFF explicit `null` (cheksiz). Tarixiy `mailbox.slots` random-limit capabilitysi
saqlanadi, ammo jami limit o‘rniga ishlatilmaydi. Yangi custom nom yaratish yana
`mailbox.custom_slots` sublimitiga kiradi (Free 0, Pro 2, STAFF `null`); bu
sublimit mavjud custom qutilarni downgrade paytida alohida qulflamaydi.
Muddati tugamagan pullik plan uchun jami grant yo‘q/buzilgan/eski bo‘lsa random
allocation va custom availability/claim `503 plan_projection_unavailable` beradi.

Kvota random va custom egalikni, detachdan so‘nggi `mailboxes.retained_user_id`
mas’uliyatini va jonli savdo rezervlarini `COUNT(DISTINCT mailbox)` orqali sanaydi.
SALE bitta qutini sotuvchi va bo‘lajak xaridor uchun rezerv qiladi; SWAP har
tomon uchun o‘z tarafidagi bittadan qutini rezerv qiladi. Crossed handoff va
terminal holat bitta tranzaksiyada yoziladi. Barcha allocation, swap va savdo
transitionlari user UUID bo‘yicha tartiblangan PostgreSQL transaction advisory
locklardan foydalanadi; bo‘sh foydalanuvchida ham random/custom oxirgi slotga
parallel da’vo qilganda faqat bittasi o‘tadi. Admin transferlari oldingi owner va
retained mas’uliyatini yozuv vaqtida yana tekshiradi; stale snapshot 409 qaytaradi.

UI detach, link sessiyasining tugashi yoki `linked_account_id = null` tashqi
Konami emaili ko‘chganini isbotlamaydi. Detach kirishni yopadi, resource kvotasi
esa mas’ul userda qoladi; retained quti oddiy orphan delete orqali o‘chirilmaydi.
Tasdiqlangan egalik transferi mas’uliyatni yangi egaga o‘tkazadi; ochilmagan,
egasiz failed-trade placeholder rezervi bo‘shaydi. SWAP provisioning qisman
o‘tsa, real yaratilgan quti o‘z source tarafining `retained_user_id` hisobida
qoladi; bu yangi inbox kirishini bermaydi. V34 oldingi owneri noma’lum bo‘lgan eski
detach qatorlariga taxminiy user yozmaydi. Qutilar avtomatik qayta ishlatilmaydi.

`GET /api/v1/mailboxes/slots` quyidagilarni qaytaradi:
`totalUsed`, `totalLimit`, `customUsed`, `customLimit`, `full`, `plan`, `lockedCount`,
`exemptUsed`, `resourceUsed`. Eski `used`/`limit` jami qiymatlarga alias.
Limitlardagi `null` faqat explicit cheksiz grantni anglatadi. Admin sovg‘alari
(`source=ADMIN`) va qarzga berilgan jonli escrow kvotani yemaydi, lekin
`exemptUsed` va `resourceUsed` ichida ko‘rinadi; user claim bu istisnoni tanlay olmaydi.
Custom claimda jami yoki custom joy tugashi bir xil `NO_SLOT`/`no_slot` kodi.
Custom availability/claim jami va custom limit, domen uchun plan va projection
freshnessini bitta SQL/MVCC snapshotdan oladi; parallel katalog tahriri ikki
turli versiya limitlarini qo‘shib yangi quti ocholmaydi.

Mavjud random/custom qutilar umumiy `access_priority` tartibi orqali ochiladi;
kindlararo unlock swap mumkin. Jonli savdodagi quti va admin sovg‘asi lock-victim
bo‘la olmaydi. `GET /api/v1/mailboxes` va `GET /api/v1/mailboxes/{id}` qo‘shimcha
`slotExempt` va `activeTrade` booleanlarini beradi; historical `tradeId` jonli
savdo borligini o‘zi tasdiqlamaydi. Boshqa egaga tegishli qutini o‘qish taqiqlangan.
Premium domen defaulti `PRO,STAFF` (`MAILBOX_PREMIUM_DOMAIN_PLANS` bilan override).
Custom quti escrow sifatida ishlatilmaydi.


Worker’ning ma’lum `email-provisioned` javobi trade row → tartiblangan user
quota lock → mailbox column-write tartibida saqlanadi. Javobdagi mailbox ID
haqiqiy trade tarafining RANDOM qutisi bo‘lishi shart; begona va CUSTOM ID
inkor qilinadi, eski ID’siz javob trade’ning o‘z placeholderiga tushadi.
`PROVISION_FAILED` dan keyin kelgan ma’lum muvaffaqiyat qatorni qayta foydalanish
uchun bermaydi: o‘sha haqiqiy resursni undelete qilib, original tarafga retained
mas’uliyat yozadi; trade terminal qoladi va inbox egaligi berilmaydi. Keyingi
confirmed transfer yoki boshqa retained egaga tegilmaydi. Provisioning credentiali
faqat birinchi marta yoziladi; duplicate worker eventi keyingi password rotationni
orqaga qaytarmaydi. State transition alohida tranzaksiyada: kechikkan eventning
rad etilishi muvaffaqiyatli resource yozuvini rollback-only holatga keltirmaydi.
Bu B bosqichidagi ma’lum worker javobi accounting’i. C bosqichida quyidagi
inventory reconciliation va davriy monitoring ham qo‘shilgan.


Admin `DELETE /api/v1/admin/mailboxes/{id}` faqat DB’da hozir egasiz,
retained mas’uliyatsiz va jonli trade/main/side rezervisiz qutini o‘chiradi.
O‘chirish column-only shartli UPDATE: stale JPA snapshot yangi owner yoki
retained userni bosmaydi. Address yoki provisioning holati tekshiruvdan keyin
o‘zgarsa 409; allaqachon o‘chirilgan qator idempotent 204. Worker delete so‘rovi
faqat guard muvaffaqiyatli bo‘lib, aynan tekshirilgan real quti uchun yuboriladi.
C bosqichida bu durable PENDING intentdir: `deleted_at` va hisob faqat
korrelyatsiyalangan muvaffaqiyat/confirmed absence kelgach bo‘shaydi.

## Mailcow inventory and resource observations (C)

`GET /api/v1/mailboxes/resources` lists the authenticated user's owned or retained
resources, including locked and recovery resources. Retained responsibility does
not grant inbox access. `GET /api/v1/admin/mailboxes/resources` requires admin
role and additionally includes server-only Mailcow mailboxes (`id=null`,
`kind=SERVER_ONLY`) and locally deleted rows still present on the server. These
responses never include credentials. Ownership, access, slot exemption, live
trade, preservation hold and deletion state are reported separately from usage.

Usage fields are `usageBytes`, `quotaBytes`, `usageObservedAt`, `usageStatus`,
`usageError` and nullable `mailcowPresent`. `UNKNOWN` has no confirmed usage;
`STALE` preserves old bytes after ten minutes or confirmed absence; `ERROR`
preserves old observations when the latest refresh fails. Only `FRESH` values
represent a recent successful usage observation. Missing or failed observations
never invent zero usage, prove absence, or free quota. Mailcow quota `0` is its
unlimited-quota marker; a null quota is unknown.

The durable `mailbox_inventory_runs` table is the request outbox. Production
scheduling checks every 30 seconds, requests a refresh at least five minutes
apart, waits for Kafka acknowledgement before marking a dispatch, and retries
an unanswered request after 60 seconds with its original UUID. Failed sends
remain retryable after 30 seconds. An observation unanswered for ten minutes
becomes an explicit error. Scheduler properties are
`trade.mailbox.inventory-dispatch-ms` and `trade.mailbox.inventory-initial-delay-ms`
(default initial delay ten seconds); tests invoke the service directly.
Only configured `trade.mailbox.domains` are requested.

`efbazaar.trade.mailbox-inventory-request` carries `{requestId,domains}`. Worker
answers on `efbazaar.trade.mailbox-inventory-observed` with
`{requestId,observedAt,page,lastPage,success,error,mailboxes}`; each mailbox has
`{mailboxEmail,usedBytes,quotaBytes,active}`. Both byte counters already use
bytes in the [official Mailcow GET schema](https://github.com/mailcow/mailcow-dockerized/blob/master/data/web/api/openapi.yaml).
Page numbers start at zero, contain at most 100 rows, and share one timestamp.
There are at most 100 pages / 10,000 mailboxes per run. Only responses to a
persisted request are accepted. Pages are stored in `mailbox_inventory_pages`;
missing pages, conflicting duplicates, mixed timestamps, foreign domains,
negative/missing counters and malformed payloads cannot produce a complete
snapshot. Replayed older requests cannot replace the newest requested snapshot.

A complete newest snapshot atomically updates `mailbox_inventory_current`.
Server-only resources become visible to admins, but are never assigned owners,
credentials or inbox access. Known rows with no provisioning reply can be
observed without inventing credentials. A local deleted row seen on Mailcow
remains counted as an actual server resource; inventory does not resurrect or
automatically delete it. Confirmed absence only completes an already explicit,
correlated pending/failed deletion whose request predates the observation;
otherwise ownership, retention, credentials, holds and quota remain untouched.

## Free/Pro — access and mail portability (C)

`user_plan_view.last_paid_expires_at` preserves the actual paid subscription
expiry independently of the current plan expiry. `SubscriptionChanged` adds the
optional `lastPaidExpiresAt` field; a legacy paid event falls back to its
`expiresAt`, and a STANDARD snapshot never erases the stored history. V35
backfills finite subscriptions; V41 corrects its STAFF backfill without changing
the applied V35 checksum. Only PRO/MAX legacy expiries supply paid history. Grace ends at that timestamp plus exactly
30 days; the boundary itself is already RECOVERY. STAFF/extra plan access does
not create a new paid expiry. Existing known, unexpired paid mail keeps the A
outage policy; new allocation still uses the A/B fresh-projection checks.

Owner mailbox responses, custom mailbox responses and mail sidebar summaries
add `accessState`, `paidExpiresAt`, `graceEndsAt`, and `selectedForFree`.
`/mailboxes/slots` adds those dates, aggregate `accessState`, and
`selectedForFreeCount`. The persisted cross-kind access priority determines
which three chargeable boxes are selected for Free. Admin gifts and borrowed
live escrow are not Free selections. Live mailboxes stay ACTIVE and cannot be
the victim of an unlock swap. `POST /mailboxes/{id}/unlock {lockInsteadId}` also
works during GRACE, preserving the selected order through renewal.

* ACTIVE permits normal owned mail access. A valid paid entitlement restores
  the same existing boxes; renewal does not allocate another ten resources.
* GRACE permits full owner-visible mail for the excess boxes until
  `paidExpiresAt + 30 days`. It grants no additional allocation capacity.
* RECOVERY permits only recognised Konami recovery, login, password and
  security messages. Legacy `locked` is true in this state, so old clients
  do not assume full inbox access. The sidebar keeps restricted counts/activity
  unknown (`null`). The normal inbox filters before pagination and totals;
  details, attachments and mark-read apply the same rule to direct UIDs.

Recovery classification requires all of an exact allowlisted sender
(`noreply@konami.com`, `no-reply@konami.jp`, `noreply@konami.net`, `konami-info@konami.net`), an exact
known security subject (the English/Japanese worker subjects), and matching
purpose content: a password-reset URL under `https://my.konami.net/`, the
not-registered notice, or a six-digit verification code for a known code
subject. Unknown senders, subjects or content fail closed. Classification skips
attachments and bounds MIME nesting, part count and classified text. Inbox rows
and message details expose `criticalRecovery`; known sender/subject security candidates cannot be selected for cleanup, even
when their MIME body is temporarily unreadable.

Every normal mail and portability operation checks current ownership and the
persisted `owner_mail_visible_from` cutoff. IMAP INTERNALDATE provides the
arrival boundary; a forged sender Date cannot reveal a previous owner's mail.
A retained resource is visible in resource accounting but does not grant mail
access. Admin audit overloads remain separately authorised by ROLE_ADMIN.

| Owner endpoint (`/api/v1`) | Contract |
| --- | --- |
| `GET /mail/{id}/export?limit=100&beforeUid=...` | Explicit full owner-visible archive portability in ACTIVE, GRACE and RECOVERY. ZIP contains `<uid>.eml` and `manifest.json`; limit 1–100, total uncompressed content and compressed output bounded to 128 MiB. `manifest.nextBeforeUid` and `X-Next-Before-Uid` provide the next descending UID page when one remains. This archive endpoint is distinct from the filtered RECOVERY inbox. |
| `POST /mail/{id}/cleanup` | `{messageIds: ["uid", ...], confirmDelete: true}`, 1–100 distinct positive UIDs; response `{deleted}`. Validates the entire selection, ownership, arrival boundary, critical-mail protection and preservation hold before setting flags. Uses UIDPLUS `UID EXPUNGE` for exactly those selected messages and closes without general expunge; a server without UIDPLUS returns `503 safe_cleanup_unavailable`. No whole-archive or automatic cleanup exists. |
| `POST /admin/mailboxes/{id}/preservation-hold` | ROLE_ADMIN only, `{reason}` of 1–1000 characters; returns `{legalHold, holdReason}`. Writes the first explicit reason and an immutable actor/time audit entry (V39). This endpoint cannot clear a hold. A mailbox already pending, failed, confirmed or deleted for removal returns `409 mailbox_deletion_unresolved` because preservation can no longer be guaranteed. |

Live trades, escalations, unresolved ORPHANED trades (except
`PROVISION_FAILED`) and explicit preservation holds block destructive cleanup
and mailbox release. Owner archive portability remains available under a hold.
Mailbox row locking keeps an explicit hold and destructive cleanup mutually
exclusive. Konami reset/browser interaction remains user initiated; these
endpoints do not invoke production Konami automation.

### Bounded IMAP operations and fixture measurement

All folder operations use `ImapConnectionPool.Lease`; the Store is held
exclusively for that mailbox until the folder closes. Both active leases and
cached stores have a global ceiling of eight by default
(`trade.mail.imap.max-connections`, env `IMAP_MAX_CONNECTIONS`). Capacity and
mailbox-lock waits are bounded to five seconds. Idle eviction does not close a
leased Store, credentials changing invalidate its cache identity, and failed
connections do not become zero usage/unread counts. TLS, certificate identity
verification and connection/read timeouts remain enabled for production IMAPS.

Owner sidebar polls coalesce per mailbox and cache counts for ten seconds,
with at most 512 cache entries. Owner, arrival boundary and encrypted credential
identity are part of the cache identity. Mark-read and cleanup invalidate the
summary; ownership and access mode are still checked on every request.

`ImapPoolLoadTest` uses a loopback IMAP protocol fixture with real Angus sockets
and empty INBOX folders. Its plaintext transport is confined to the test Store
factory; production always uses IMAPS. It performs 100 SELECT/folder cycles
across ten mailboxes with 16 clients and asserts a maximum of eight active IMAP
sessions and one concurrent lease per mailbox. A session leaves the fixture
count before its LOGOUT completion is acknowledged; delayed server-handler/FD
cleanup is not an active cached client connection. A latch-controlled one-slot
regression holds cleanup after the ACK to verify this accounting boundary.
The report records `peakActiveSessions`, not server-handler lifetime.
One local Java 21 run on 2026-10-20 measured
150.338 ms total, p50 19.122 ms and p95 47.149 ms; the fresh report is written to
`/tmp/c-trade-imap-benchmark.json`. These are controlled fixture measurements,
not production latency or capacity estimates. Reproduce with Java 21:
`mvn -B -ntp -Dtest=ImapPoolLoadTest test`.

Pending/FAILED mailbox deletion freezes identity and ownership. The current owner
can continue authorised read/export until correlated confirmation removes ownership;
Mailcow unavailability is reported as unavailable. A request or ambiguous timeout
never grants another owner access or makes the address reusable.

### One-shot external mailbox creation (C, V42)

Every production Mailcow create first requires an authenticated
`POST /internal/mailboxes/{mailboxId}/provision-claim` with `X-Internal-Secret`.
The request carries `{tradeId, mailboxEmail, addressVersion:2,
encryptedPassword, iv, tag}`; sealed byte arrays are base64 JSON and use the
`mbox-{mailboxId}` context. Random addresses are
`trade-{all 32 UUID hex characters}@{defaultDomain}`. Short legacy address
requests cannot authorise an external create. Custom/admin requests must match
their current pending reserved address and owner.

The database locks responsible users and the mailbox row, validates its live
reservation, and stores one immutable claim and its sealed credentials. Only
the first claim returns `{claimId, mailboxId, mailboxEmail, allowCreate:true,
encryptedPassword, iv, tag}`. A replay of the same STARTED identity returns
`allowCreate:false` and the original seal, even when the caller sent a new
seal. It permits only a read-only IMAP credential proof; it never permits
another create or a password rotation. Unresolved outcomes are not automatically
expired, reset or retried as creates.

`provisioningStatus=STARTED`, `provisioningClaimId` and a visible
`provisioningError` preserve the uncertain resource. Identity, credentials,
ownership, account linkage and deletion are frozen while STARTED. Random
claims retain the source party's resource responsibility before any external
mutation, so a terminal/failed trade cannot silently free an uncertain real
resource. Only a matching success `claimId`, address, trade identity and exact
original seal confirms provisioning atomically. Duplicate success cannot
replace a later password rotation. A delayed success after a failed trade
retains the real mailbox without reviving the trade or granting inbox ownership.
Legacy success without a claim is accepted only when no claim exists; it cannot
rename a reserved custom address or overwrite established credentials.

Resources expose additive `provisioningStatus` (`NONE`, `STARTED`, `CONFIRMED`),
`provisioningClaimId`, and `provisioningError`. An unknown outcome requires
credential proof or manual reconciliation. Test/local MockWorker performs no
Mailcow mutation and keeps explicit no-claim fixture compatibility.

The sidebar network fixture also runs 100 concurrent ten-mailbox polls with
16 clients: exactly ten cold folder reads are issued inside the ten-second
cache window, and changing one ownership cutoff causes exactly one additional
read. One local run measured 52.619 ms. Current measurements are written to
`/tmp/c-trade-sidebar-benchmark.json`; they measure the loopback IMAP/cache
boundary with fixture-owned mailbox metadata, not production database/query
latency. Recovery classification is an owner mail-triage rule; it does not by
itself authenticate a destructive release proof.


### C: foydalanuvchi tasdiqlagan bo‘shatish va server natijasi

`POST /api/v1/mailboxes/{id}/release-check` yangi 10 daqiqalik tekshiruv yaratadi;
`GET .../{id}/release-check/{requestId}` uning `PENDING|VERIFIED|EXPIRED|FAILED`
holatini beradi. Faqat hozirgi owner yoki retained mas’ul user ruxsat oladi. User
Konami’da akkountini shaxsiy tashqi emailga ko‘chiradi va o‘z brauzerida eski manzil
uchun forgot-password so‘raydi. `detach` va `linkedAccountId=null` ko‘chirish isboti emas.

Yangi `VERIFY_RELEASE` IMAP oqimi eski savdo `VERIFY_LINK`dan alohida. Worker asl
RFC822 baytlarida Konami domenining DKIM imzosi, imzolangan From/To/Subject/Date,
aynan quti recipienti va requestning vaqt oynasini tekshiradi. Oddiy From yoki
Authentication-Results sarlavhasi isbot emas. Faqat `originVerified=true`, aynan
request nonce/manzil va yangi “email not registered” javobi (reset link yo‘q) qabul
qilinadi. Worker/DNS/origin noma’lum bo‘lsa quti saqlanadi, tekshiruv muddati tugaydi;
foydalanuvchi yangi tekshiruv boshlashi mumkin. Recovery maqsad klassifikatori
DKIM tekshiruvi degani emas: u owner vakolatidagi muhim xatlarni ajratadi; delete
vakolati esa alohida tasdiqlangan origin proof talab qiladi. To‘liq owner eksporti
recovery holatida ham obuna to‘lovisiz ishlaydi.

`POST .../{id}/release` body `{requestId,confirmDelete:true}` yangi, hali amal qiluvchi
VERIFIED proof, o‘zgarmagan owner/retained/address/provision snapshot va preservation
himoyasi yo‘qligini talab qiladi. `mailbox_deletion_requests` navbati broker ack bilan
aynigan requestni qayta yuboradi. `PENDING` yoki `FAILED` slotni bo‘shatmaydi; identity,
credentials, yangi trade va account attachment muzlatiladi. Hozirgi owner read/export
vakolati confirmed ackgacha qoladi. FAILED’dan keyin faqat yangi proof bilan yangi
request tuziladi; old request javobi yangi intentni o‘zgartirmaydi.

V37 natija nonce/manzil/current responsibilityni tekshiradi. Faqat workerning aniq
success/not-found javobi yoki requestdan keyingi to‘liq successful inventorydagi absence
`CONFIRMED` qiladi; local deleted va owner/retained bo‘shashishi shu tranzaksiyada.
`provisionedAt=null` real manzil yo‘qligini isbotlamaydi. Faqat ichki zero-credential
`pending-UUID` synthetic placeholder (bu manzil serverga hech qachon yuborilmaydi)
uchun server delete kerak emas; real target manzilga acknowledgement talab qilinadi.
V40 confirmed real mailbox identityni o‘zgartirish/hard delete’dan himoyalaydi;
unique manzil tombstone sifatida qoladi. Provisioning v2 ham to‘liq UUID manzil va
V42 bir martalik DB claim bilan eski manzilni qayta yaratishdan himoyalanadi.

Upgrade paytida eski workerlarni to‘xtatib, avval yangi trade API/migratsiya va
internal secret konfiguratsiyasini, keyin yangi workerni ishga tushirish kerak.
Eski worker bilan aralash ishlash yangi create fence kafolatini bermaydi. Yangi
worker nonce/version bo‘lmagan eski destructive/create requestlarni bajarmaydi;
backlogdagi bunday yozuvlar reconciliation/operatsion ko‘rib chiqishni talab qiladi.
Bu hujjat deploy bajarilganini anglatmaydi.

V43 extends the permanent confirmed-address guard to real mailboxes whose original
provision acknowledgement was lost. A positive deletion acknowledgement reserves
the address even when `provisioned_at` is null; legacy success callbacks cannot
rename or resurrect it. Internal never-created `pending-UUID` placeholders have no
Mailcow deletion acknowledgement and use deletion status `NONE`, allowing a known
late resource to be restored and charged to its responsible user.

Final local C verification (Java 21): `mvn -B -ntp clean verify` passed with
345 unit tests and 441 integration tests, zero failures/errors/skips. Both
Surefire and Failsafe exited cleanly without fork-termination dumps. Results are
local; no remote CI, push or deployment was performed.


## E — durable seller completion facts

V44 installs the existing shared outbox schema and `seller_trade_completions`.
`SellerTradeCompletionPublisher` emits `efbazaar.trade.seller-trade-completed`
inside the SUCCESS transaction immediately after successful escrow settlement.
A failed settlement or later transaction rollback stores neither completion nor
outbox event. HUMAN has no wallet settlement but its completed agreed amount is
still explicitly labelled by kind/mode. Spec trades without a listing emit no
seller-listing analytics fact. Existing legacy events are unchanged.

Payload: `{idempotencyKey,tradeId,listingId,sellerId,buyerId,kind,mode,priceUzs,
completedAt}`. Key is `seller-trade-completed:<tradeId>`; Kafka key is trade UUID.
The one-time database completion timestamp survives relay delays/restarts.
Only explicit SALE contributes agreed gross sales at the consumer; swaps remain
zero revenue. There is no historical trade backfill. The unchanged shared outbox
provides acknowledged at-least-once delivery, durable retry/backoff during broker
outage, and pending/parked operational metrics; see [outbox README](../libs/outbox/README.md).
Trade Dockerfile already installs this library from the backend build context.

`TradeActionControllerIT` verifies the exact durable fact and failed settlement
rollback/retry; `TradeMailVisibilityTest` keeps the required publisher dependency
explicit in its isolated fixture. Run Java 21 `mvn -B -ntp clean verify`.
