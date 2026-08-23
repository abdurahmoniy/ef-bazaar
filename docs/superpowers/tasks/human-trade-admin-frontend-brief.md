# Task: efBazaar — human trade-admin frontend

**Branch with the backend:** `mukhiddinov` (pushed to origin, 45 commits ahead of `main`, merged with current `main`)

**Your job:** build the frontend for the human trade-admin feature. The entire backend is done, tested and reviewed — nothing on the server side is waiting on you. Everything below is verified against the code on that branch, not from memory.

---

## 1. What the feature is

efBazaar sells eFootball accounts. Handing an account over is delicate: the seller must move the account to an escrow email, the buyer must pay, and somebody has to verify the account is real before money changes hands.

Until now that was done by the **smart admin** — a Python worker that provisions a Mailcow mailbox, drives Konami's forgot-password flow in headless Chromium and polls IMAP. That still exists and is unchanged.

This feature adds a **human alternative**. At proposal time the seller chooses:

- **Smart admin** — the existing automated flow.
- **Inson admin (human)** — the seller hires a real person, a `TRADE_ADMIN`, who runs the trade by hand.

### The rule that shapes everything

**In a human trade the platform only provides the email. Everything else is in the admin's hands.**

The buyer pays the admin **directly**. The money never touches the platform — there is no escrow, no wallet, no ledger, no payment-service. `adminFeeUzs` is stored for information only. Human trades are therefore **free**: the platform takes no cut.

The consequence you must reflect in the UI: **the platform's only recourse against a bad admin is the rating**. Do not build anything that implies the platform is holding money, guaranteeing the trade, or able to reverse it. If you write user-facing copy about payment, it must be clear that the payment is between the buyer and the admin.

---

## 2. The human lifecycle

Read this before designing screens — the states are what the UI has to render.

```
INITIATED
   │  mailbox provisioned (automatic, seconds)
   ▼
WAITING_ADMIN ──────────── 24 h ──────────► ORPHANED
   │   ▲                                    (nobody took it)
   │   └── admin declines (seller picks another, fresh 24 h)
   │  admin accepts
   ▼
IN_PROGRESS          ← the six-step checklist lives here
   │                   no deadline; 12 h of admin silence → escalation
   ├── admin cancels ─────────────────────► REJECTED
   │  admin closes (needs 6/6 steps)
   ▼
WAITING_CLOSE_CONFIRM
   │  both parties confirm  ──────────────► SUCCESS
   └── 24 h of silence      ──────────────► SUCCESS   (silence is consent)
```

Terminal states: `SUCCESS`, `REJECTED`, `ORPHANED`.

**A human trade never enters `WAITING_PAYMENT`, `WAITING_EMAIL_CHANGE`, `VERIFYING_KONAMI_LINK`, `WAITING_PASSWORD` or `WAITING_BUYER_VERIFY`** — those are smart-only. The backend uses two separate transition tables so the lifecycles cannot cross. Your state-dependent rendering can rely on that.

**Escalation does not change the state.** When an admin goes silent for 12 h, the trade stays `IN_PROGRESS` and only `escalatedAt` is set. A platform admin then reassigns or cancels it. A reassigned admin inherits the work in progress — the checklist and both chats survive.

Timeouts (from `application.yml`, do not hardcode differently in copy):

| What | Value |
|---|---|
| `WAITING_ADMIN` → `ORPHANED` | 24 h |
| `WAITING_CLOSE_CONFIRM` → `SUCCESS` | 24 h |
| Admin idle → escalation | 12 h |
| Rating window after `SUCCESS` | 7 days |

---

## 3. Auth model — read this, it is different from what you may assume

Nothing verifies a JWT except `auth-service`. nginx runs an `auth_request` subrequest and injects headers; the frontend never sends a role.

- Roles: `ROLE_USER`, `ROLE_ADMIN` (platform admin), `ROLE_TRADE_ADMIN` (human trade admin).
- `ROLE_TRADE_ADMIN` is **granted from the platform admin panel**, not self-service. A user cannot make themselves a trade admin.
- A user holding `ROLE_TRADE_ADMIN` also holds `ROLE_USER` — they can still buy and sell.
- Everything under `/api/v1/admin/**` requires `ROLE_ADMIN`.
- `/api/v1/trade-admins/me/**` and the `admin-*` trade actions require `ROLE_TRADE_ADMIN`.

**Holding the role is not enough to see a trade.** The backend authorises on *assignment*: only the admin actually assigned to a trade can see it. An unassigned `ROLE_TRADE_ADMIN` is a stranger and gets 404. Do not build a UI that assumes a trade admin can browse trades.

`nginx/conf.d/api.conf` routes `/api/v1/(trades|mailboxes|cards|trade-admins|admin/mailboxes|admin/trades|admin/trade-admins)` to trade-service. **`limit_except GET POST DELETE OPTIONS` — `PUT` and `PATCH` are denied at the edge.** The API is deliberately shaped around GET/POST/DELETE; profile update is a `POST`, not a `PUT`. Do not send `PUT`.

---

## 4. API surface

All paths are absolute. `{id}` is a trade id unless stated otherwise.

### 4.1 Seller — choosing the mode and the admin

**Create a proposal** — `POST /api/v1/trades/proposals`
The existing endpoint gained three optional fields. For a human trade send `mode: "HUMAN"`, an `adminId` and an `adminFeeUzs`; the card fields are **not required** in human mode (in smart mode they are).

Only the seller may create a HUMAN proposal.

**Browse admins** — `GET /api/v1/trade-admins?q=&sort=`

- `q` — free-text filter on display name (optional). Admins whose name cannot be resolved are dropped from a filtered result.
- `sort` — `DEFAULT` | `RATING` | `FEE_ASC`. `DEFAULT` puts free admins first, then online ones, then by rating.
- **No pagination.** The endpoint returns the full list. See §7.

Response — `TradeAdminCardResponse[]`:

```ts
{
  userId: string
  displayName: string | null      // omitted when unresolved
  photoAvailable: boolean
  averageStars: number | null     // null until somebody rates
  ratingCount: number
  averageWorkSeconds: number | null
  minFeeUzs: number
  maxFeeUzs: number
  online: boolean
  lastSeenAt: string | null       // ISO instant
  activeTrades: number
  maxConcurrentTrades: number
  busy: boolean                   // activeTrades >= maxConcurrentTrades
}
```

`busy` admins must be **greyed out, not hidden** — the seller should see they exist.

Presence (`online` / `lastSeenAt`) is currently a Redis-TTL stopgap behind a port. A proper global presence feature is a separate future spec; treat these fields as best-effort.

**Invite (or replace) an admin on an open trade** — `POST /api/v1/trades/{id}/actions/assign-admin`
Body: `AssignAdminRequest { adminId: string, feeUzs: number }` (`feeUzs` ≥ 1)

Only the seller, only while `WAITING_ADMIN`. **Calling it again replaces the current invitee** and gives the new admin a fresh 24 h — this is how a seller escapes an admin who never opens the app. The fee must fall inside that admin's `[minFeeUzs, maxFeeUzs]` band or you get 400.

**Public admin profile** — `GET /api/v1/trade-admins/{userId}` → `TradeAdminProfileResponse`
**Public ratings** — `GET /api/v1/trade-admins/{userId}/ratings` → `TradeAdminRatingResponse[]`

```ts
// TradeAdminProfileResponse
{
  userId: string
  displayName: string | null
  minFeeUzs: number
  maxFeeUzs: number
  bio: string | null
  acceptingOrders: boolean
  maxConcurrentTrades: number
  active: boolean
  averageStars: number | null
  ratingCount: number
  completedCount: number
  abandonedCount: number      // walked away and got escalated
  cancelledCount: number      // cancelled the trade themselves
  averageWorkSeconds: number | null
}

// TradeAdminRatingResponse
{
  id: string
  stars: number               // 1..5
  comment: string | null      // null when a platform admin hid the text
  raterRole: "SELLER" | "BUYER"
  createdAt: string
}
```

`abandonedCount` and `cancelledCount` are deliberately public — that is the trust signal. Show them.

### 4.2 The trade admin's own workspace

**My profile** — `GET /api/v1/trade-admins/me` → `TradeAdminProfileResponse`
**Save my profile** — `POST /api/v1/trade-admins/me` (**POST, not PUT**)

```ts
// TradeAdminProfileUpsertRequest — all required except bio
{
  minFeeUzs: number           // >= 1
  maxFeeUzs: number           // >= 1, and >= minFeeUzs
  bio?: string                // <= 500 chars
  acceptingOrders: boolean
  maxConcurrentTrades: number // 1..20
}
```

**My invitations** — `GET /api/v1/trade-admins/me/invitations` → `TradeResponse[]` (trades in `WAITING_ADMIN` naming me)
**My trades** — `GET /api/v1/trade-admins/me/trades` → `TradeResponse[]`

**Accept** — `POST /api/v1/trades/{id}/actions/admin-accept`
Fails 409 if I am already at `maxConcurrentTrades` (capacity binds on accept, not on invitation — two sellers may invite the same admin). Fails 403 if I lost the role or paused orders since the invitation.

**Decline** — `POST /api/v1/trades/{id}/actions/admin-decline`
Returns the trade to `WAITING_ADMIN` with the assignment cleared.

### 4.3 The six-step checklist

**Read** — `GET /api/v1/trades/{id}/steps` → `TradeStepResponse[]`
**Mark** — `POST /api/v1/trades/{id}/steps/{step}` body `MarkStepRequest { note?: string }` (≤ 500)
**Unmark** — `DELETE /api/v1/trades/{id}/steps/{step}`

```ts
{ step: TradeStep, labelUz: string, completed: boolean, completedAt: string | null, note: string | null }
```

The six steps, in order, with the exact Uzbek labels the backend returns:

| `step` | `labelUz` |
|---|---|
| `SELLER_BRIEFED` | Sotuvchi bilan gaplashdim |
| `ACCOUNT_TRANSFERRED` | Akkount escrow emailga o'tkazildi |
| `ACCOUNT_VERIFIED` | Akkountni tekshirdim — haqiqiy |
| `PAYMENT_RECEIVED` | Xaridordan to'lovni oldim |
| `CREDENTIALS_DELIVERED` | Xaridorga email va parol berildi |
| `SELLER_PAID` | Sotuvchiga pulni o'tkazdim |

Behaviour to honour:

- **Markable in any order.** Do not enforce a sequence in the UI.
- **Both parties can read the checklist; only the assigned admin can change it.** This is how the parties follow progress — build the read-only view too.
- **Only while `IN_PROGRESS`.** Once the admin closes, the checklist is frozen — it is the record the parties confirm against.
- Unmarking clears the note as well.
- **6/6 is required to close.** Show the count.

Every mark and every admin chat message resets the 12 h idle timer.

### 4.4 The two chats

The admin talks to seller and buyer in **separate** chats. **Neither party ever sees the other's chat.** This is the single most important thing not to break.

**Read** — `GET /api/v1/trades/{id}/messages?target=SELLER|BUYER`
**Write** — `POST /api/v1/trades/{id}/messages?target=SELLER|BUYER`

- For a **party**, `target` is ignored — they always read and write their own chat. Sending it changes nothing.
- For the **admin**, `target` is required; omitting it is 400.
- An **invited but not yet accepted** admin gets refused. Chat access begins at accept.

`senderType` on a message is `USER | SMART_ADMIN | SYSTEM | HUMAN_ADMIN`. Style `HUMAN_ADMIN` distinctly from `SMART_ADMIN` — the parties should be able to tell a person from the bot at a glance.

`messageType` is `TEXT | BUTTON_PROMPT | STATUS | PASSWORD_ONETIME`. `STATUS` rows have no body — they carry a `code` and metadata, and you render them as system lines (step marked, admin accepted, and so on).

**WebSocket** — SockJS/STOMP endpoint `/ws/trade`, broker prefix `/topic`.
Topics: `/topic/trades/{tradeId}/seller` and `/topic/trades/{tradeId}/buyer`.
A party may subscribe to their own topic only. An **accepted** admin may subscribe to **both**. No new topic was added for this feature.

### 4.5 Closing and confirming

**Admin closes** — `POST /api/v1/trades/{id}/actions/admin-close` (409 unless 6/6)
**Admin cancels** — `POST /api/v1/trades/{id}/actions/admin-cancel`
Body: `AdminCancelRequest { reason?: string }` (≤ 500) — **JSON body, not a query parameter.** An empty body is allowed.

**Party confirms** — `POST /api/v1/trades/{id}/actions/close-confirm` → `CloseConfirmResponse`

```ts
{ sellerConfirmed: boolean, buyerConfirmed: boolean, state: TradeState }
```

Confirming is **not** a state change on its own — it writes one timestamp. The trade only reaches `SUCCESS` when both have confirmed, or after 24 h of silence. Use the response to render "you have confirmed, waiting for the other side".

### 4.6 Ratings

**Rate** — `POST /api/v1/trades/{id}/rating` body `RateAdminRequest { stars: 1..5, comment?: string }`

- Only a **party** (never the admin, never a stranger).
- Only after `SUCCESS`, and only within **7 days** of it.
- **One rating per party per trade** — a second attempt is refused.
- A rating is not a chat message, so it still works after the chat closes.

### 4.7 Platform admin (`ROLE_ADMIN`)

**Escalation queue** — `GET /api/v1/admin/trades/escalated` → `EscalatedTradeResponse[]`, ordered oldest-escalated first:

```ts
{
  id: string, sellerId: string, buyerId: string, priceUzs: number,
  assignedAdminId: string | null, adminFeeUzs: number | null,
  escalatedAt: string, escalationReason: string | null, createdAt: string
}
```

**Reassign** — `POST /api/v1/admin/trades/{id}/reassign` body `AssignAdminRequest { adminId, feeUzs }`
Rotates the escrow mailbox password and revokes the old admin's access. The new admin inherits the checklist and both chats.

**Cancel** — `POST /api/v1/admin/trades/{id}/cancel` body `AdminCancelRequest { reason? }`

**Hide an abusive rating comment** — `POST /api/v1/admin/trade-admins/{userId}/ratings/{ratingId}/hide`
Blanks the **text only**. The star still counts toward the average — deliberately, so a platform admin cannot lift an admin's score by moderating. Make that unambiguous in the panel's copy.

There is deliberately **no "switch to smart"** action. A human trade cannot be handed to the automation, because `IN_PROGRESS` does not exist on the smart path and there is no state for it to resume from. Do not offer it.

### 4.8 Notifications (marketplace-service)

`NotificationType` gained `TRADE_ADMIN_INVITED`, and `NotificationResponse` gained `tradeId`:

```ts
{ id, type, chatId, listingId, tradeId, actorDisplayName, readAt, createdAt }
```

Use `tradeId` to deep-link the bell straight into the admin's invitation.

Separately: while a trade is live its marketplace chat is **pinned** so the 24 h chat-expiry sweeper leaves it alone, and unpinned when the trade ends. That is server-side; you do not have to do anything, but do not be surprised that a trade chat outlives 24 h of silence.

---

## 5. Screens to build

Five, from spec §15. The spec (`docs/superpowers/specs/2026-07-30-human-trade-admin-design.md`) has the intended shape — read §15 and §12.4, but **the API in §4 above is authoritative** where they disagree; a few endpoint shapes changed during implementation.

1. **Proposal creation** — mode toggle (Smart / Inson admin). Choosing human opens an admin picker: search, cards, online dot, stars, fee band, busy state. Fee input validated against the chosen admin's band. **Hide the card selector in human mode** — it is not required.

2. **Admin catalogue** — the picker as a standalone browsable page, with the three sorts.

3. **Trade admin workspace** — invitations with their countdowns, accept/decline, my active trades, the six-step checklist, the two chats side by side, close/cancel. Also the profile editor (fee band, bio, accepting-orders toggle, capacity).

4. **Party trade panel (human mode)** — read-only checklist so the parties can follow progress, their own chat, the escrow email shown as an info banner above the chat the way the smart flow shows it, and the confirm button once the admin closes. Show which side has confirmed.

5. **Platform admin panel** — escalation queue with age, reassign (reusing the admin picker), cancel, and rating-comment moderation.

---

## 6. Design constraints worth stating in the UI

- **No escrow.** Never imply the platform holds the money or can refund. The buyer pays the admin directly.
- **A human trade is free** — no platform commission. Say so where the seller picks the mode.
- **The admin's reputation is the only guarantee.** Give `averageStars`, `ratingCount`, `completedCount`, `abandonedCount` and `cancelledCount` real prominence in the picker, not a footnote.
- Countdowns matter: the 24 h invitation window and the 24 h confirm window are what stop trades stranding. Render them as live countdowns, not static timestamps.

---

## 7. Known backend gaps — read before you start

These are recorded, not forgotten. Two of them will affect you on day one.

**a) `TradeResponse` is missing the human-mode fields.** It currently returns:

```ts
{ id, state, sellerId, buyerId, priceUzs, mailboxId, mailboxEmail, chatId,
  createdAt, expiresAt, stateDeadline, role, passwordMessageId,
  emailChangeVerificationCode }
```

It carries **no** `mode`, `assignedAdminId`, `adminFeeUzs`, `sellerConfirmedAt`/`buyerConfirmedAt`, or escalation state. So a party panel cannot currently tell a human trade from a smart one, or know whether it has already confirmed, from this DTO alone.

This was left open **on purpose** so the frontend drives the DTO shape rather than the backend guessing. **Decide what you need and ask for it** — it is a small, contained backend change. Do not work around it with client-side inference.

**b) The catalogue has no pagination.** `GET /api/v1/trade-admins` returns everything. Fine at tens of admins, not at hundreds. If you want `?page=`, ask; do not build a pager against an endpoint that ignores it.

**c) The assigned admin can now fetch a single trade** (`GET /api/v1/trades/{id}` uses the admin-aware lookup), but `role` comes back `null` for an admin — only parties get `SELLER`/`BUYER`. Branch on that rather than treating `null` as an error.

**d) A revoked trade admin keeps an in-flight trade.** If a platform admin removes `ROLE_TRADE_ADMIN` mid-trade, the profile is deactivated and they drop out of the catalogue, but the assignment survives until the 12 h idle sweeper escalates it. Spec §4.3 wanted immediate escalation; that was deferred. Do not build UI that promises instant removal.

**e) Two concurrent close-confirms** from the same party can surface a 500 instead of a 409 in a rare race. Data stays correct. Do not special-case it; it is on the follow-up list.

---

## 8. Conventions

- Frontend is **Next.js**. Follow the existing app's patterns — do not introduce a new state-management or data-fetching library without asking.
- **Stable releases only.** No RC or beta versions of React/Next or anything else.
- If you touch `frontend/package.json`, **commit `package-lock.json` with it** — CI breaks otherwise.
- Copy is in **Uzbek**, matching the rest of the app. The backend already returns Uzbek strings for step labels and error messages — reuse them rather than translating separately.
- Server-side rendering reaches the backend through `http://nginx:8080/api` internally, not the public host.
- Commit format: `feat(frontend): ...`, imperative, lowercase after the colon.

---

## 9. How to verify as you go

The backend is running-ready on branch `mukhiddinov`. Bring the stack up and drive a full human trade end to end: create a HUMAN proposal → accept it → invite an admin → accept as the admin → mark all six steps → close → confirm from both sides → rate. Then a second run where the admin goes silent, to see the escalation queue populate.

One check that has **not** been run yet, because the stack was not up on the machine where the backend was built — please do it once you have it running:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.efbazaar.uz/api/v1/trade-admins
```

Expect **401**. That proves nginx routed the request to trade-service and it hit the auth subrequest. A **404** means the nginx regex did not match and routing is broken — tell whoever owns the backend branch immediately, do not work around it.
