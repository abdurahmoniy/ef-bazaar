# trade-service

Savdoning butun hayot sikli: taklif (proposal) → savdo ochilishi → akkountni escrow
pochtaga o'tkazish → tekshiruv → to'lov → akkountni xaridorga topshirish → yopilish.
Holatlar mashinasi (`TradeStateMachine`), har tomon uchun shifrlangan chat, parolni bir
martalik uzatish, escrow pochta qutilari, trade-admin'lar va reytinglar shu yerda.

| | |
|---|---|
| Port | 8085 |
| Public yo'l | `/api/trade/**` → `/api/**` (token shart, aks holda 401); STOMP WebSocket `/ws/trade` |
| DB | `TRADE_DB_NAME` (Flyway `V1`–`V32`) |
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
| `mailbox`, `mail` | Escrow pochta qutilari (Mailcow), foydalanuvchi uchun read-only IMAP (mail.efbazaar.uz frontendi shu API'ni ishlatadi) |
| `admin` | Trade-admin: profil, katalog, taklif qilish (invite → accept/decline), ish navbati, eskalatsiya, SMART savdoga qo'lda aralashish |
| `seller` | Sotuvchi reytingi (xaridordan 1–5) |
| `plan` | payment-service tariflarining lokal projection'i; qutilar ikki turda (`mailboxes.kind`): `RANDOM` (savdo va admin qutilari, `mailbox.slots`) va `CUSTOM` (user o'zi olgan nomli quti, `mailbox.custom_slots`, savdoda ishlatilmaydi) — har tur o'z limiti bo'yicha alohida qulflanadi va almashtiriladi; `CustomSlotService` — custom limit (projection'da qator bo'lmasa 0, `null` — cheksiz); admin paneldan yaratilgan qutilar ham `CUSTOM` (`source=ADMIN`, V32 eskilarini o'tkazdi), lekin ular sovg'a — slot band qilmaydi va hech qachon qulflanmaydi; `MailboxSlotService` — nechta random quti ochish mumkin (egasi savdo tomoni bo'lmagan jonli savdodagi quti — adminga berilgan human escrow quti — egasining hisobiga kirmaydi); `MailboxAccessService` — limitdan oshgan qutilar qulflanadi (`mailboxes.access_priority`, hisoblanadi, saqlanmaydi; jonli savdodagi quti hech qachon qulflanmaydi; egasi savdo tomoni bo'lmagan jonli quti — human savdoda adminga berilgan escrow quti — ham ochiq, lekin egasining limitiga sanalmaydi) |
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
| Pochta | `/mailboxes`, `/mailboxes/slots`, `/mailboxes/{id}/detach`, `/name`, `POST /mailboxes/{id}/unlock` (body `{lockInsteadId}` → 204; qulflangan qutini ochiq quti bilan almashtiradi, aks holda 409 `invalid_unlock_swap`); `/mail/mailboxes`, `/mail/{mailboxId}/inbox`, `/messages/{id}`, attachments. Ro'yxat/summary qatorida `locked`, `kind`, `linkedAccountId` (qulflangan qutida `unreadCount`/`lastActivityAt` null, IMAP ochilmaydi), `/mailboxes/slots` da `lockedCount`. Foydalanuvchi mail API'si (inbox, xat, o'qilgan, attachment) qulflangan qutiga 403 `{code:"mailbox_locked", message}` qaytaradi va IMAP'ga tegmaydi; admin endpointlar va smart-admin-worker IMAP'i qulfdan mustasno |
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

`mvn -B -ntp clean verify` — 306 unit, 296 integratsion (`*IT`).

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
