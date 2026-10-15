# trade-service

Savdoning butun hayot sikli: taklif (proposal) → savdo ochilishi → akkountni escrow
pochtaga o'tkazish → tekshiruv → to'lov → akkountni xaridorga topshirish → yopilish.
Holatlar mashinasi (`TradeStateMachine`), har tomon uchun shifrlangan chat, parolni bir
martalik uzatish, escrow pochta qutilari, trade-admin'lar va reytinglar shu yerda.

| | |
|---|---|
| Port | 8085 |
| Public yo'l | `/api/trade/**` → `/api/**` (token shart, aks holda 401); STOMP WebSocket `/ws/trade` |
| DB | `TRADE_DB_NAME` (Flyway `V1`–`V29`) |
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
| `plan` | payment-service tariflarining lokal projection'i; `MailboxSlotService` — nechta quti ochish mumkin; `MailboxAccessService` — limitdan oshgan qutilar qulflanadi (`mailboxes.access_priority`, hisoblanadi, saqlanmaydi; jonli savdodagi quti hech qachon qulflanmaydi) |
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
| Pochta | `/mailboxes`, `/mailboxes/slots`, `/mailboxes/{id}/detach`, `/name`, `POST /mailboxes/{id}/unlock` (body `{lockInsteadId}` → 204; qulflangan qutini ochiq quti bilan almashtiradi, aks holda 409 `invalid_unlock_swap`); `/mail/mailboxes`, `/mail/{mailboxId}/inbox`, `/messages/{id}`, attachments. Ro'yxat/summary qatorida `locked` (qulflangan qutida `unreadCount`/`lastActivityAt` null, IMAP ochilmaydi), `/mailboxes/slots` da `lockedCount`. Foydalanuvchi mail API'si (inbox, xat, o'qilgan, attachment) qulflangan qutiga 403 `{code:"mailbox_locked", message}` qaytaradi va IMAP'ga tegmaydi; admin endpointlar va smart-admin-worker IMAP'i qulfdan mustasno |
| Admin | `/admin/mailboxes/**`, `/admin/smart-trades/**`, `/admin/trades/escalated`, `/admin/trades/{id}/cancel`, `/reassign`, reytingni yashirish |
| Ichki | `GET /internal/trades/live` (marketplace) |

## Kafka

- Chiqaradi: `trade.proposal-*`, `trade.action-notification`, `trade.admin-invited`,
  `trade.listing-sold`, `trade.trade-succeeded`, `trade.mailbox-handed-over`,
  `trade.trade-opened` / `trade-closed`, `chat.changed.v1` va worker'ga so'rovlar.
- Tinglaydi: worker natijalari, `payment.plan-entitlements`, `payment.subscription-changed`,
  `auth.user-role-changed`.
- Worker bilan so'rov/natija juftlari: [docs/kafka-topics.md](../../docs/kafka-topics.md#trade--smart-admin-worker).

## Rejali job'lar

| Job | Oraliq (default) | Vazifasi |
|---|---|---|
| `TradeTimeoutScheduler` | 10 s | `state_deadline` o'tgan savdolarga `TIMEOUT` hodisasini beradi |
| `TradeEscrowSweeper` | 60 s | Birinchi urinishda o'tmagan escrow harakatlarini qayta bajaradi |
| `TradeEscalationSweeper` | 60 s | `IN_PROGRESS` da uzoq harakatsiz qolgan savdolarni eskalatsiya qiladi (alohida ustun — `IN_PROGRESS` da `TIMEOUT` o'tishi yo'q) |

## Ehtiyot bo'l

- Holatni to'g'ridan-to'g'ri `UPDATE` qilmang — faqat `TradeStateMachine`. Sekin o'tish
  savdo allaqachon o'tib ketgan holatni yozib yubormasligi uchun tekshiruvlar bor.
- Har savdoda **yangi** pochta qutisi. Qutini qayta ishlatish obmenda ikki akkountni
  bitta pochtaga bog'lab yo'qotishi mumkin.
- Worker band bo'lsa `worker-queued` keladi va deadline uzayadi — savdo jim yetim qolmasligi kerak.
- Pul birliklari: trade so'mda (`price_uzs`), payment tiyinda. Konvertatsiya `EscrowClient` ichida.

## Test

`mvn -B -ntp clean verify` — 47 unit, 48 integratsion (`*IT`).

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
