# smart-admin-worker

Python service that replaces Plan B's `MockWorker`. Consumes Kafka trade
lifecycle request topics, provisions Mailcow mailboxes, drives Konami's
forgot-password via `rotate.py`, polls IMAP for reset/2FA emails, and rotates
mailbox passwords when trades close.

It also serves the admin panel: `efbazaar.trade.mailbox-provision-request`
creates a standalone (trade-less) mailbox with an admin-chosen local part and
answers on `efbazaar.trade.mailbox-provisioned`.

See `docs/superpowers/specs/2026-07-15-plan-c-smart-admin-worker-design.md`.

No database. State lives in Kafka, Mailcow, and short-lived Redis locks.
Runs as a FastAPI app (`uvicorn smart_admin_worker.main:app`); the HTTP surface
is only the health check on `WORKER_HEALTHCHECK_PORT` (8086).

## Topics

| Request (from trade-service) | Handler | Answers with |
|---|---|---|
| `efbazaar.trade.email-provision-request` | `handlers/email_provision.py` | `email-provisioned`; after retries are exhausted `main.py` emits `email-provision-failed` |
| `efbazaar.trade.mailbox-provision-request` | `handlers/mailbox_provision.py` — quti `domain` (eventdan; yo'q bo'lsa `efbazaar.uz`) da ochiladi: admin va custom qutilar; `custom: true` da Mailcow'da shu nomli quti allaqachon bo'lsa `mailbox-provisioned` yuborilmaydi va adminlarga xabar ketadi | `mailbox-provisioned` |
| `efbazaar.trade.forgot-password-request` | `handlers/forgot_password.py` | `worker-queued` / `worker-started` (the reset email itself arrives through IMAP polling) |
| `efbazaar.trade.imap-poll-request` | `handlers/imap_poll.py` — parol keshda bo'lmasa so'rovdagi `passwordContext` + `encryptedPassword/iv/tag` ni ochadi (worker restart'dan keyin custom qutilar uchun); `restart: true` eski poller'ni to'xtatib qayta boshlaydi | `konami-email-received`, `imap-2fa-code`, `konami-email-change-code-received` |
| `efbazaar.trade.imap-poll-stop-request` | `handlers/imap_poll_stop.py` — qutining barcha poller'larini to'xtatadi (custom quti ulash sessiyasi tugadi) | — |
| `efbazaar.trade.mailbox-rotate-request` | `handlers/mailbox_rotate.py` | `mailbox-rotated` |
| `efbazaar.trade.mailbox-delete-request` | `handlers/mailbox_delete.py` | `mailbox-delete-result` (confirmed success/absence or explicit refusal/UNKNOWN) |
| `efbazaar.trade.mailbox-inventory-request` | `handlers/mailbox_inventory.py` | `mailbox-inventory-observed` (complete paged snapshot or explicit failure) |

Backpressure: when every rotate slot is busy the worker emits `worker-queued`,
then `worker-started` when it picks the job up, so trade-service extends the
deadline instead of timing the trade out. It also forwards its own WARN/ERROR
logs to `efbazaar.system.log-event`. Full catalogue: [docs/kafka-topics.md](../docs/kafka-topics.md).

## Layout

| Package | What |
|---|---|
| `handlers/` | One handler per request topic |
| `mailcow/` | Mailcow API client (create, rotate, delete mailboxes) |
| `konami/` | Konami client; `konami/rotate/rotate.py` runs Chromium as a subprocess for forgot-password |
| `imap/` | IDLE watcher (one connection per mailbox), poller, sender allowlist and code detector for Konami emails |
| `redis/` | Locks — one IMAP poll per mailbox at a time (polling fallback only) |
| `crypto/` | Field encryption with the shared master key (same key as trade-service) |
| `telegram/` | Notifier for the email topic in the admin group |
| `kafka/` | Topic names (`topics.py`), event schemas (`events.py`) |

## Configuration

`KAFKA_BOOTSTRAP_SERVERS`, `MAILCOW_API_URL`, `MAILCOW_API_KEY_FILE`, `MASTER_KEY_FILE`,
`IMAP_HOST`, `IMAP_PORT`, `IMAP_POLL_INTERVAL_SECONDS`, `IMAP_POLL_LOCK_TTL_SECONDS`,
`IMAP_IDLE_MAX_CONNECTIONS` (default 200; 0 — IDLE o'chiq), `IMAP_IDLE_REFRESH_SECONDS` (default 300, ≤ 1740),
`IMAP_IDLE_MAX_LIFETIME_SECONDS` (default 86400),
`KONAMI_SENDER_ALLOWLIST`, `MAX_CONCURRENT_ROTATE` (default 1, capped by `MAX_CONCURRENT_ROTATE_CAP`, default 5),
`REDIS_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_TOPIC_EMAIL`, `TELEGRAM_TOPIC_LOGS`.

## Contract with trade-service

Messages are plain JSON with no `__TypeId__` header; trade-service picks the
Java type per listener. Renaming a field here silently breaks the consumer.

## Inventory and deletion acknowledgements

Inventory requests carry `{requestId, domains}`. Trade-service supplies only its
configured platform domains; the Kafka request topic must be restricted to that
trusted publisher. Worker validates 1–50 DNS domains and reads Mailcow's
`GET /api/v1/get/mailbox/all/{domain}`. Mailcow `quota_used` and `quota` are
already **bytes**, unlike the create-mailbox quota input (MiB). Source:
[official Mailcow OpenAPI](https://github.com/mailcow/mailcow-dockerized/blob/master/data/web/api/openapi.yaml).
Only requested-domain rows are published, including server-only orphan mailboxes;
no password, staff metadata, or unrelated domain rows are exposed.

Responses carry `{requestId, observedAt, page, lastPage, success, error, mailboxes}`;
mailbox entries are `{mailboxEmail, usedBytes, quotaBytes, active}`. Pages start
at zero, contain at most 100 entries, and share one observation timestamp. The
complete snapshot is collected and validated before publishing any page. Empty
inventory is success only for an actual empty list. HTTP errors, malformed,
negative or missing counters, duplicate addresses and oversized responses emit
`success=false,lastPage=false` with no mailbox rows. Limits: 8 MiB per domain
response and 10,000 mailboxes across the entire snapshot. Trade-service should
mark a snapshot current only after every page through the successful last page
arrives; earlier observations remain stale after any failure. Kafka delivery can
duplicate pages; consumers must deduplicate by request ID and page.

Delete requests add optional `requestId`; old two-field payloads still decode,
but commands without it fail closed with a visible warning and
`success=false,error=MISSING_REQUEST_ID`. They never touch Mailcow or pollers.
During rolling deployment, legacy cleanup must wait for a new correlated
delete intent after inventory/ownership review.
The result is `{requestId,mailboxId,mailboxEmail,success,alreadyAbsent,error,occurredAt}`.
Only a successful Mailcow mutation or an explicit `object_dne`/`not_found` is
success. `access_denied` and malformed/mixed responses are failures, never
proof of absence. Transport failures report `UNKNOWN:<exception type>` and
rethrow for the consumer's three attempts. Replays after deletion return
`alreadyAbsent=true` when Mailcow confirms absence. Safety depends on
trade-service retaining permanent unique-address tombstones and correlating
request ID, mailbox ID and address before retiring ownership; an old request
must never delete a reused address. A null legacy request ID cannot authorize
physical deletion or trade-service ownership removal. Inventory never triggers automatic deletion.

Both handlers await Kafka broker acknowledgement. If required result publication
fails for all three attempts, the consumer stops with error health and leaves
the request offset uncommitted for recovery/restart. `/health` returns HTTP 503
with `status=DOWN,kafka=error` for a crashed consumer; startup/connecting states
stay HTTP 200. Docker healthchecks do not automatically restart an unhealthy
container: monitoring or an operator must trigger recovery/restart. Ordinary transport retries
that successfully report UNKNOWN still exhaust after three attempts. Pollers
stop as soon as deletion is requested, including when Mailcow refuses deletion.

## IMAP: IDLE va o'qilgan belgisi

**Kod qanday keladi.** Har quti uchun bitta doimiy IMAP IDLE ulanish
(`imap/watcher.py`), o'z thread'ida. Dovecot xat tushishi bilan xabar beradi,
watcher UNSEEN'ni olib, shu qutini kuzatayotgan har bir qadamga (purpose)
uzatadi — kod xat kelgandan ~1 soniya ichida Kafka'da. Bitta qutining barcha
qadamlari bitta ulanishni bo'lishadi; turli savdolar parallel ishlaydi.

- Ulanish qutiga birinchi `imap-poll-request` kelganda ochiladi va qutining
  oxirgi poller'i bekor qilinganda yopiladi — savdo tugaganda
  (`SUCCESS`/`REJECTED`/`ORPHANED` → `mailbox-rotate-request` →
  `cancel_mailbox`).
- Ulanish ochilganda va har qayta ulanishda UNSEEN bir marta o'qiladi: oraliqda
  kelgan xat yo'qolmaydi. IDLE har `IMAP_IDLE_REFRESH_SECONDS` da yangilanadi
  (NAT/firewall jim ulanishni uzmasligi uchun). Uzilsa — backoff bilan qayta
  ulanadi.
- `IMAP_IDLE_MAX_LIFETIME_SECONDS` — himoya: rotate kelmay qolsa ham ulanish
  shu muddatdan keyin yopiladi va qutining poller'lari to'xtaydi.
- `IMAP_IDLE_MAX_CONNECTIONS` dan oshgan qutilar eski usulda
  `IMAP_POLL_INTERVAL_SECONDS` bilan poll qilinadi — hech kim navbat kutmaydi.
- Har ulanishda 30s socket timeout (`SOCKET_TIMEOUT_SECONDS`): yarim ochiq TCP
  thread'ni abadiy ushlab qolmaydi.

**O'qilgan belgisi.** Poller faqat UNSEEN xatlarni o'qiydi va qadamning
sarlavhasiga mos kelgan eng yangi xatdan kodni oladi. Kod Kafka'ga
muvaffaqiyatli publish qilingandan **keyingina** shu qadamning xatlari
(yuborilgani va undan eskilari) SEEN qilinadi; boshqa qadamning xatlari
o'qilmagan bo'lib qoladi. Shunda "qayta jo'natish" yoki worker restartidan
keyin eski kod qayta yuborilmaydi. Publish yiqilsa xat UNSEEN qoladi va
`IMAP_POLL_INTERVAL_SECONDS` dan keyin qayta urinadi. Ogohlantirish:
foydalanuvchi xatni webmail'da ochib qo'ysa, u SEEN bo'ladi va worker uni
ko'rmaydi.

## Local dev

```bash
cd smart-admin-worker
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
ruff check smart_admin_worker/ tests/
pytest -q
```

## Docker

Built as part of the efbazaar stack — `docker compose up smart-admin-worker`
from the repo root.


## Destructive release proof origin

`VERIFY_RELEASE` is separate from existing trade/link polling. Its original IMAP
RFC822 bytes pass `imap/release_auth.py` before a fresh not-registered response
can authorize deletion. Parsed-message reserialization and unsigned
`Authentication-Results` headers provide no authority. A new release request
binds the proof to its request ID, mailbox, start instant and deadline.

The helper verifies DKIM using pinned `dkimpy==1.1.8` and the deployment's trusted
system DNS resolver. It accepts only the exact configured Konami senders
`noreply@konami.com`, `no-reply@konami.jp`, `noreply@konami.net`, and
`konami-info@konami.net`, with a strictly matching signing `d=` domain,
`rsa-sha256`, and an RSA key of at least 1024 bits (RFC8301 verifier minimum). `From`, `To`, `Subject`, `Date`
and every present MIME interpretation header must be signed. Duplicate critical
headers, partial-body `l=` signatures, mismatched recipients and malformed
messages fail closed. `To` must identify the current mailbox alone.

Signed `Date` must be at or after the exact request start, at or before the
verification clock, and before expiry. RFC5322 Date has whole-second precision:
the helper does **not** round a fractional start down. A same-second email dated
before that exact start is conservatively rejected; request a new email in the
next second. Unsupported algorithms, weak keys, missing signatures and DNS
failures keep release unverified/manual. They do not remove owner recovery mail
or explicit owner ZIP export access.

Verification limits are 2 MiB per message, 64 KiB/200 headers, four signatures,
8 KiB per signature, a 2 KiB DNS key record, 0.5 seconds per DNS lookup, and three
seconds per async verification. At most four offloaded crypto/DNS jobs can exist
at once. A coroutine timeout keeps its slot reserved until the physical work
finishes, preventing an unbounded background queue. DNS is queried only for the
strictly aligned allowlisted domain's selector, never a sender-supplied resolver.
Tests generate real RSA signatures and use local fixture DNS; no Konami or real
DNS calls are made. DKIM requirements follow [RFC6376](https://www.rfc-editor.org/rfc/rfc6376)
and SHA/key restrictions follow [RFC8301](https://www.rfc-editor.org/rfc/rfc8301).


## One-shot provisioning and replay safety

Both provisioning request types require `addressVersion=2`. Older payloads
still decode as legacy but are visibly rejected without contacting Mailcow;
operators must reconcile old commands and issue a current authorized request.
Random names are `trade-` followed by all 32 lowercase mailbox UUID hex digits.
Custom/admin names keep their chosen address; trade-service permanently reserves
addresses including deleted tombstones.

`TRADE_INTERNAL_BASE_URL` defaults to `http://trade-service:8085` and
`INTERNAL_API_SECRET` is the existing shared internal API secret forwarded by
Compose. It is masked in settings diagnostics and sent only as
`X-Internal-Secret`. No local or Redis fallback grants creation. Before any
Mailcow create the worker posts to
`/internal/mailboxes/{mailboxId}/provision-claim` with
`{tradeId,mailboxEmail,addressVersion,encryptedPassword,iv,tag}`. Credentials are
sealed under `mbox-{mailboxId}` before the claim. Only the first committed claim
returns `allowCreate=true`; its response contains the exact mailbox identity,
claim UUID and immutable original sealed password.

A duplicate STARTED response returns `allowCreate=false`. It can only authenticate
with the original password over IMAPS, using AUTH without SELECT/FETCH/flags,
then emit `claimId` with the unchanged sealed credential fields on the existing
provisioned topic. It never creates, rotates, or adopts an unproven mailbox.
A fresh custom-name collision remains protected. Claim HTTP failures, malformed
responses, wrong identities, redirects and missing configuration never authorize
creation. Bounded consumer retries leave the request uncommitted with error
health if the authority remains unavailable. A Mailcow outcome or duplicate
credential proof that remains unknown keeps the durable STARTED hold and visible
manual-reconciliation error; no lease expiry or automatic reset releases it.

Destructive release uses only `VERIFY_RELEASE`, with `startedAt`/`expiresAt` and
the release UUID in `tradeId`. The poller preserves original RFC822 octets from
IMAP and expires its watcher at the deadline. It tries every matching candidate
so an unsigned newest message cannot hide a valid signed response. Only a fresh
cryptographically verified non-registration message emits `originVerified=true`.
Unverified candidates report `originVerified=false,emailNotRegistered=false`
with a pending error and do not consume the message or authorize deletion.
Ordinary trade `VERIFY_LINK` keeps its original behavior and wire payload.
