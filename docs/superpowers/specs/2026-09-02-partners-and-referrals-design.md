# Partners and referrals — channel advertising, attribution and payouts

**Date:** 2026-09-02
**Status:** Design (approved via brainstorming)
**Owner:** Muxiddinov
**Builds on:** `V39__partners.sql`, `V40__partner_cancellation.sql` (application, approval, cancellation — already shipped)
**Depends on:** payment-service (wallet + ledger), trade-service (trade lifecycle), bot (Telegram delivery)

## 1. Purpose

Today `ROLE_PARTNER` grants nothing. A channel owner pays the joining fee, is approved, and receives
a single page that shows their channel name. Grep confirms it: the role is read in exactly one place
(`frontend/src/lib/admin.ts:isPartner`) and gates exactly one route.

This spec gives partnership its substance. A partner is a large Telegram channel that efBazaar
sellers can pay to advertise in, and that earns a share of the trades it brings.

Two mechanisms. They share plumbing — links, clicks, attribution — but they are separate features
with separate audiences, and the spec keeps them separate:

1. **Referrals — every user, not only partners.** Anyone can invite anyone. When someone who joined
   through your link completes their first trade, you are paid a fixed reward. (§4.4, §5.1)
2. **Channel advertising — partners only.** A seller pays a partner to post their listing in that
   partner's channel, and the partner earns a share of the trades that post produces. (§4.1, §4.2)

A partner is a user, so a partner gets both: the referral reward for the people their channel brings,
and the advertising revenue from their channel. The two are counted and paid independently.

## 2. Decisions taken

| Question | Decision |
|---|---|
| What does a partner earn from? | Posting fees, plus a share of trades their channel produced |
| Referral registrations | Counted only — no payout, this phase or later |
| Trade share basis | efBazaar's commission on the trade, never the trade total |
| Trade share on a failed trade | Nothing. `release` takes no commission, so there is nothing to share |
| Payout mode | Per-partner: PERCENT of commission, or a FIXED monthly sum. Mutually exclusive |
| Configuration | Global default in the admin panel, overridable per partner |
| Fixed payout timing | 1st of each month, first month pro-rated by days |
| Who sets the posting price | The partner, within admin-configured minimum and maximum |
| Platform cut of the posting fee | None. The partner receives the whole amount |
| When the posting fee reaches the partner | After the bot has actually posted. Refunded if it never does |
| Attribution when a listing is in several channels | Last click wins, frozen when the trade opens |
| Who can refer | Every user. Partners are users, so a partner channel link refers on the owner's behalf |
| What counts as a referral | Any referral-bearing link, including a listing post in a channel |
| Link shapes given to a referrer | Two, copied separately: a bot deep link and a site link |
| Referral reward | A fixed sum to the referrer when the referred user's **first** trade settles |
| Which side the referred user is on | Irrelevant — buyer or seller, the referrer is paid |
| Referral reward amount | Admin-configurable, default 5 000 so'm. Not hard-coded |

## 3. Data model

### 3.1 marketplace-service

`partner_settings` (existing single-row table) gains the global payout policy:

```
default_payout_mode        text        NOT NULL DEFAULT 'PERCENT'   -- PERCENT | FIXED
default_trade_percent_bp   integer     NOT NULL DEFAULT 1000        -- basis points of commission
default_fixed_monthly_som  numeric(14,2) NOT NULL DEFAULT 0
min_post_price_som         numeric(14,2) NOT NULL DEFAULT 1000
max_post_price_som         numeric(14,2) NOT NULL DEFAULT 100000
```

Basis points rather than a percentage: `10.5%` is not representable as an integer and a
`numeric(5,2)` invites rounding arguments at settle time. `1000 bp = 10%`.

**`partner_channels`** — one row per approved partnership. This is deliberately *not* stored on
`partner_applications`: an application is an immutable record of a decision, while a channel carries
mutable advertising configuration that changes for the life of the partnership.

```
id                    uuid          PK
partner_user_id       uuid          NOT NULL          -- the partner
application_id        uuid          NOT NULL UNIQUE   -- which application produced this
telegram_channel_id   bigint        NOT NULL UNIQUE
title                 text          NOT NULL
username              text
photo_file_id         text                            -- Telegram file_id of the channel avatar
subscriber_count      integer       NOT NULL
subscriber_synced_at  timestamptz   NOT NULL
link_code             text          NOT NULL UNIQUE   -- short, random; serves both link shapes (§5)
post_price_som        numeric(14,2) NOT NULL
payout_mode           text                            -- NULL = follow global
trade_percent_bp      integer                         -- NULL = follow global
fixed_monthly_som     numeric(14,2)                   -- NULL = follow global
refresh_failures      integer       NOT NULL DEFAULT 0  -- consecutive failed daily refreshes
active                boolean       NOT NULL DEFAULT true
created_at            timestamptz   NOT NULL DEFAULT now()
```

`NULL` means "follow the global setting" rather than copying the global value at creation. A copied
value would silently ignore a later change to the global policy, which is the opposite of what an
admin editing the global setting expects.

### Reposting a listing to the same channel

A listing scrolls away in a busy channel within a day, and the only remedy is to publish it again.
That is a separate paid service each time, so `uk_listing_channel_posts` — one post per
(listing, channel) — was the wrong rule and is gone.

Ordering for an existing listing goes through `POST /api/v1/listings/{id}/channel-posts`, never
through the listing's own `PUT`. The update endpoint fires on every save; if channel ids rode along
with it, fixing a typo in a description could move money out of the seller's wallet. Money moves
only from a button pressed for that purpose.

When the fresh post lands, the previous one for that channel is deleted from Telegram and stamped
`replaced_at`. Deletion happens *after* the new post is confirmed, never before: if the new post
fails, deleting first would remove the listing from the channel entirely while the seller had
already paid. Failing to delete is forgiven — the bot may lack delete rights, or the message may
already be gone — because the new post is out and the seller has what they paid for.

The row is never deleted. It was paid for and the partner earned from it, so it stays in the
reports; `replaced_at` only records that its Telegram message is no longer there. Without it the
panel would show two POSTED rows for one channel and nobody could tell which message still exists.

Only an `ACTIVE` listing can be ordered, and only by its seller. Advertising a sold listing would
send readers to an offer that no longer exists, with the seller paying for the privilege.

### Rejoining after a cancellation

Cancelling a partnership sets `active = false` and keeps the row, because published posts and the
trades they produced hang off it and a report must not lose them. Approving a channel, meanwhile,
inserted a fresh row every time. The two met on `telegram_channel_id UNIQUE` and approval crashed
with a duplicate-key violation the moment a partner who had cancelled applied again.

The uniqueness is now scoped to live rows (`WHERE active`), and approval reuses the existing row for
the same partner instead of inserting a second one. Reuse rather than insert is the important half:
`link_code` is written into every post already published to that channel and into
`referrals.partner_channel_id`, so a new code would strand all of that history and split the funnel
across two rows. The partner's own posting price and any per-partner terms an admin set survive the
gap; the failure counter resets, since a channel closed by three failed refreshes is being read
again.

If the live row belongs to a *different* user, the channel changed hands on Telegram — the bot
verifies the applicant is the channel `creator`, so the new owner is legitimate. The previous row is
closed and its unposted orders refunded, and a new row is created. The old partner's clicks and
referrals stay attached to their own row: handing that history to whoever owns the channel next
would pay the wrong person.

### Daily channel refresh

`title`, `username`, `photo_file_id` and `subscriber_count` are read from Telegram when the channel
is verified, and every one of them changes over the life of a partnership. Left alone they rot in
three ways: the subscriber count is what a seller prices a post against, so a stale number means the
seller is paying for an audience that no longer exists; an avatar `file_id` stops resolving once
Telegram expires it, so the picture disappears entirely; and a channel that quietly removed the bot
stays listed and sellable forever, because `my_chat_member` only fires while the bot is connected.

A daily job in marketplace-service enqueues one `efbazaar.marketplace.channel-refresh-requested`
event per active channel. The bot reads `getChat` and `getChatMemberCount` and reports back to
`/internal/marketplace/v1/partners/channel-refreshed`. Marketplace holds the schedule because it
owns the channels; the bot holds the Telegram token and never shares it.

The refresh is **all or nothing**: if either Telegram call fails, nothing is written. A partial write
would leave a channel carrying a new avatar beside an old subscriber count, and no one would see the
mismatch.

A failed read increments `refresh_failures`; a successful one resets it to zero. At
`app.partners.refresh-failure-limit` (default 3, one per day) the partnership is deactivated and
unposted orders are refunded. Consecutive failures, not a running total — an absolute count would
eventually kill a healthy channel from accumulated blips. Deactivating on the *first* failure would
end someone's partnership because Telegram was briefly unreachable; never deactivating would leave
sellers paying for posts that can never appear. If marketplace itself is unreachable the bot reports
nothing and the counter does not move: our own outage must not cost a partner their partnership.

One code serves both the referral link and every post link — both identify the same channel, and a
second code would be a second thing to keep in sync for no gain. It is random, not derived from the
channel name. A guessable code lets anyone forge
attribution, and a name-derived code breaks when the channel is renamed.

**`user_referral_codes`** — everyone's invite code. Created lazily, the first time a user opens the
page that shows their link.

```
user_id     uuid          PRIMARY KEY
code        text          NOT NULL UNIQUE
created_at  timestamptz   NOT NULL DEFAULT now()
```

**`referrals`** — who came to the platform through whom. Not partner-specific: the referrer is a
user, and `partner_channel_id` merely records that the link happened to be a channel post, which the
partner funnel needs and the referral reward does not.

```
referred_user_id    uuid          PRIMARY KEY
referrer_user_id    uuid          NOT NULL
partner_channel_id  uuid                        -- NULL unless they arrived via a channel post
created_at          timestamptz   NOT NULL DEFAULT now()
rewarded_at         timestamptz               -- when the first-trade reward was paid
reward_som          numeric(14,2)             -- frozen at payout
```

The primary key on `referred_user_id` is the enforcement of "one registration, one referrer". A
second referrer cannot claim the same user because the database will not allow the row.

`rewarded_at` is also the "first trade only" guard, and needs nothing else: it is set by the first
trade that settles, so every later trade finds it already stamped. Counting the user's trades would
be a second source of truth for the same fact.

**`pending_referrals`** — a code that arrived at the bot before the person had an account.

```
telegram_id  bigint       PRIMARY KEY
code         text         NOT NULL
created_at   timestamptz  NOT NULL DEFAULT now()
```

The bot holds no database, so it forwards the `/start` payload here immediately. The row is converted
into a `referrals` row when `efbazaar.auth.user-registered` arrives carrying the same `telegramId`.
Upserted, so the last bot link before registering wins — the same rule as every other path.

A row that never converts is a person who was already registered when they tapped the link. That is
the correct outcome, not a failure: an existing account is nobody's referral.

**`referral_settings`** — single row, like `partner_settings`.

```
id          smallint      PRIMARY KEY CHECK (id = 1)
reward_som  numeric(14,2) NOT NULL DEFAULT 5000
updated_at  timestamptz   NOT NULL DEFAULT now()
updated_by  uuid
```

**`listing_partner_attributions`** — which channel sent this person to this listing.

```
listing_id          uuid          NOT NULL
user_id             uuid          NOT NULL
partner_channel_id  uuid          NOT NULL
updated_at          timestamptz   NOT NULL DEFAULT now()
PRIMARY KEY (listing_id, user_id)
```

Written with `INSERT ... ON CONFLICT DO UPDATE`. Last click wins, by construction.

**`listing_channel_posts`** — the advertising order.

```
id                  uuid          PK
order_id            uuid          NOT NULL   -- the channels picked in one action; see §4.1
listing_id          uuid          NOT NULL
partner_channel_id  uuid          NOT NULL
price_som           numeric(14,2) NOT NULL   -- frozen at order time
state               text          NOT NULL   -- AWAITING_FUNDS | HELD | POSTED | FAILED | REFUNDED
telegram_message_id text
created_at          timestamptz   NOT NULL DEFAULT now()
posted_at           timestamptz
error               text
UNIQUE (listing_id, partner_channel_id)
```

The price is frozen when the order is placed. A partner who raises their price mid-flight must not
retroactively charge a seller who already committed.

`order_id` groups the channels picked in one action. It exists because the seller commits to a *set*,
and the money has to move for that set as a whole (§4.1).

**`partner_link_clicks`** — the raw click log, for the funnel in the admin dashboard.

```
id                  bigserial     PK
partner_channel_id  uuid          NOT NULL
kind                text          NOT NULL   -- REFERRAL | LISTING
listing_id          uuid                     -- NULL for REFERRAL
user_id             uuid                     -- NULL when the clicker is not logged in
created_at          timestamptz   NOT NULL DEFAULT now()
```

This is the only table expected to grow without bound. Indexed on
`(partner_channel_id, created_at)`; the dashboard reads aggregates, never rows.

### 3.2 trade-service

`Trade` gains two columns, both `updatable = false`:

```
partner_channel_id   uuid
partner_percent_bp   integer
```

Both are stamped when the trade opens and never change. Stamping the rate as well as the partner is
the point: an admin who edits the percentage tomorrow must not alter the terms of a trade that is
already in flight.

### 3.3 payment-service

New `TransactionKind` values. These are what produce the distinct labels the partner sees in their
wallet history:

| Kind | Wallet history label |
|---|---|
| `PARTNER_POST_HOLD` | (internal — the seller's funds being frozen) |
| `PARTNER_POST_SETTLE` | «Hamkorlik — e'lon joylashdan» |
| `PARTNER_POST_REFUND` | (the seller being made whole) |
| `PARTNER_TRADE_SHARE` | «Hamkorlik — savdodan» |
| `PARTNER_MONTHLY` | «Hamkorlik — oylik» |
| `REFERRAL_REWARD` | «Referal uchun» |

No new `LedgerAccount`. Partner and referral costs are debits against `PLATFORM_REVENUE`, which keeps
everything the two programmes cost the platform in one account and reportable with one query.

## 4. Money

Sign convention, as established in `TradeEscrowService`: negative is a credit (increases what is
owed), positive is a debit. Every transaction sums to zero.

### 4.1 The posting fee

Ordered when the seller publishes a listing and selects channels.

```
hold      USER_AVAILABLE  seller   +total      (one transaction for the whole order)
          USER_HELD       seller   -total

settle    USER_HELD       seller   +price      (per post, as each one lands)
          USER_AVAILABLE  partner  -price

refund    USER_HELD       seller   +price      (per post that never landed)
          USER_AVAILABLE  seller   -price
```

**The hold covers the whole order, in one transaction.** The seller picked a set of channels and saw
one total; charging per channel would let a seller with 12 000 who picked three 5 000 channels end up
advertising in two of them, having chosen three. All or nothing.

Settlement and refund stay per post, because posts land one at a time and some may fail while others
succeed. `USER_HELD` is a per-user pool — the same one `TradeEscrowService` uses — so paying two
partners out of a single 15 000 hold and refunding the remainder needs no special handling.

This is the hold/settle shape `TradeEscrowService` already uses, with different parties. The seller's
money is frozen, not spent, until the post exists. A partner whose bot was removed from the channel
earns nothing and the seller is made whole without an admin touching anything.

Idempotency keys: `partner-post-hold:<orderId>` for the hold, `partner-post:<postId>` and
`partner-post-refund:<postId>` for the per-post movements. Keyed on the order, never on the listing:
a seller who later adds a second channel to a listing they already advertised places a new order with
a new key. Had the key been the listing, `LedgerService.post` would have recognised it as a duplicate
and silently declined to charge them.

**Insufficient funds.** Checked once, against the order total. The listing is still created — losing
a filled-in listing because the wallet is short would be indefensible. The whole order is written as
`AWAITING_FUNDS`, an invoice is raised automatically for the full shortfall (the flow established for
the partner joining fee), and the listing page shows a
"To'lash" button that retries the hold. No Kafka retry machinery: the user is present, the button is
in front of them, and a background retry that fires days later would post an advertisement the seller
has forgotten ordering.

### 4.2 The trade share

Inside `TradeEscrowService.settle()`, in the same ledger transaction that records the commission:

```
share = fee * partner_percent_bp / 10000

USER_HELD       accepter  +accepterTiyin
USER_AVAILABLE  proposer  -proceeds
USER_AVAILABLE  partner   -share
PLATFORM_REVENUE null     -(fee - share)
```

The transaction still sums to zero and the books still balance. There is no separate payout job, no
lag between the trade closing and the partner being paid, and no reconciliation step that can drift.

`release()` — the unsuccessful path — takes no commission today. There is therefore nothing to share,
and the rule "no payout on a failed trade" needs no code to enforce it.

A `FIXED`-mode partner has `partner_percent_bp` stamped as `0` at trade open, so the same code path
handles both modes and `share` is zero.

### 4.3 The monthly fixed payment

A scheduler in marketplace-service, on the 1st of each month, calls payment-service's internal
endpoint for every active `FIXED` partner:

```
PLATFORM_REVENUE  null     +amount
USER_AVAILABLE    partner  -amount
```

Idempotency key `partner-monthly:<channelId>:<YYYY-MM>`. A job that runs twice — a redeploy on the
1st, a retry after a timeout — pays once, because `LedgerService.post` rejects a duplicate key.

The first month is pro-rated by days: a partner approved on the 20th receives `amount * 11 / 30` on
the 1st. Not pro-rating would pay a full month for ten days and make approval timing worth gaming.

Direction of the call is marketplace → payment, matching the existing `PartnerFeeClient`. The reverse
direction is never introduced: payment-service must not need marketplace to be up in order to settle.

### 4.4 The referral reward

Paid once per referred user, when their first trade settles successfully. Buyer or seller — the side
they were on is not consulted.

```
PLATFORM_REVENUE  null       +reward
USER_AVAILABLE    referrer   -reward
```

Unlike the partner trade share (§4.2), this is **not** carved out of the commission — it is a fixed
sum the platform spends to acquire a user. It therefore cannot be posted inside the settle
transaction, which must balance against that trade's own commission. Instead marketplace-service
consumes a trade-succeeded event and calls payment-service, the same direction as every other partner
payment.

**The event is new.** `efbazaar.trade.listing-sold` is the closest existing one and does not fit: it
is published only when `listingId` is present, so a trade opened from a spec produces none, and it
describes a listing changing hands rather than a trade succeeding. trade-service gains:

```
efbazaar.trade.trade-succeeded
{ tradeId, buyerId, sellerId, mode, occurredAt }
```

Published from the `SUCCESS` branch of `TradeStateHandler`, beside the existing `tradeClosed`. Both
modes are published: `HUMAN` trades never touch the wallet, but the referred user completed a trade
either way, and the reward is for having acquired an active user, not for the commission. `mode`
travels so a later policy can distinguish them without a new event.

No commission figure travels. The reward is a flat sum and nothing downstream divides it — carrying
`feeTiyin` would mean changing `EscrowClient.settle`, which discards its response body today, to
serve a field nobody reads.

Trigger, in marketplace-service, for each of the trade's two parties:

1. Is there a `referrals` row for this user with `rewarded_at IS NULL`? If not, stop — either they
   came on their own, or their referrer has already been paid.
2. Stamp `rewarded_at` and `reward_som` from `referral_settings`, then credit the referrer.

Both parties are evaluated. A trade between two first-timers with different referrers pays both
referrers, which is correct: two people were brought to the platform and both did what was asked.

Idempotency key `referral-reward:<referredUserId>`. The event may be redelivered; the reward is paid
once. `reward_som` is frozen on the row so that a later change to the setting cannot rewrite history,
and so the admin panel can show what was actually paid rather than what is configured today.

**The reward is not gated on the trade being profitable, and this is deliberate.** It is acquisition
spend: while the platform is filling up, the admins mean to pay it. Gating it on the settling trade's
commission — the obvious-looking guard — would suppress payouts on exactly the small first trades the
programme exists to produce.

The exposure is bounded by construction rather than by a threshold. One reward per referred user,
ever, on their first settled trade; `rewarded_at` (§3.1) enforces it. A referrer with a thousand
referrals costs a thousand rewards, not a recurring stream, and what the platform has in exchange is
a thousand users who have completed a trade.

For calibration, not as a rule the code applies: commission today carries a floor of 5 000 so'm below
the 100 000 band and 10 000 above it (`trade_commission_configs`), so at the default 5 000 reward the
platform is not out of pocket on a rewarded trade. That is a fact about today's settings, not an
invariant anything enforces — the two numbers live in different services and either may be changed.

**And it holds only for SMART trades.** A HUMAN trade never touches the wallet and therefore takes no
commission at all (`TradeStateHandler.settleEscrow` returns early for any other mode), so a rewarded
HUMAN trade costs the platform the whole reward and earns nothing. Two accounts belonging to one
person could collect it repeatedly at no cost to themselves. This is closed today only because
`FEATURES.humanAdmin` is `false`; the note lives on that flag, because the person who flips it is the
one who needs to read it.

## 5. Referrals and attribution

Two questions — *who brought this person to the platform* and *which channel produced this trade* —
and two link shapes, but not one shape per question: the post link answers both.

### 5.1 What counts as a referral

Every user has an invite link. Referring is not a partner privilege — a partner is simply a user
whose channel happens to be an unusually good place to put a link.

**Any** referral-bearing link counts. A newcomer who never saw an invite link, arrived through a
listing post in a channel, and registered is a referral of that channel's owner. The channel brought
them to the platform; which URL shape carried them is an implementation detail they never saw.

Every such link therefore records the same thing: a code, held until the person registers — in a
cookie for the web paths, in `pending_referrals` for the bot path. At registration, whatever code is
held is resolved — through `user_referral_codes` or `partner_channels.link_code` —
to a referrer, and becomes the `referrals` row. Last link before registering wins, which is the same
rule as §5.2 and needs no second explanation to anyone reading it.

Once written, never changed. The primary key on `referred_user_id` is the enforcement: a second
referrer cannot claim the same person because the database will not accept the row.

Self-referral is rejected at insert: `referrer_user_id <> referred_user_id`.

**Only newcomers.** An account that already exists must not become somebody's referral by clicking a
link. The bot path gets this for free: it converts on `user-registered`, which by definition fires
once, for a brand-new account. The web path has no such event to hang on, so before inserting,
marketplace-service reads the caller's `createdAt` from
`POST /internal/auth/v1/users/summary/batch` — already built, already used for user search — and
accepts the claim only for an account younger than one hour. Nothing is added to auth-service and no
new event is introduced; the age of an account is a fact auth already publishes.

The check is server-side rather than trusting a "this was a registration" flag from the browser. That
flag is client-controlled, and the whole point of the check is that the client is the party with a
reason to lie.

Feeds three surfaces: the referrer's own count, the partner funnel, and the admin leaderboard (§7).
The money is §4.4.

### 5.2 The two link shapes

**Bot link — `t.me/<bot>?start=ref_<code>`.** Telegram's own referral mechanism. The bot receives the
payload with `/start` and forwards it to `pending_referrals`; the registration event converts it.
Nothing in the browser is involved, so nothing about cookies, private windows or which app opened the
link can lose it.

**Site link — `efbazaar.uz/?ref=<code>`.** Captured by Next.js middleware into a cookie. Middleware
runs before routing, so the code survives a page that redirects an anonymous visitor to login — a
capture done in a React component would not, because `redirect()` in a server component throws before
the layout renders.

Both are offered to the referrer as separate rows to copy. The bot link is the one most people will
share, and the site link is kept because a mobile app will need referrals to arrive over a URL rather
than through Telegram.

**Post link — `efbazaar.uz/l/<listingId>?p=<code>`.** Seeds the referral cookie *and* attributes the
listing.

Every channel post carries its own link, so a click identifies the channel unambiguously. The listing
half is upserted into `listing_partner_attributions`; the last click wins.

The lifecycle the decision requires:

1. A buyer sees the listing in channel A, clicks, and is attributed to A.
2. The same buyer sees it in channel B, clicks, and is attributed to B. B overrides A.
3. The seller opens a trade with that buyer. `partner_channel_id` and `partner_percent_bp` are
   stamped on the `Trade` row, which is `updatable = false`.
4. Further clicks change `listing_partner_attributions`, and change nothing about the open trade.
5. The trade settles successfully — the stamped partner is paid. It fails — nobody is.

**Anonymous clicks.** A click from someone not yet logged in is written to a cookie and promoted to
rows when they authenticate. Dropping it would discard the beginning of every conversion the
programme exists to produce: the person who had not yet registered is exactly the person the channel
brought — and under §5.1 they are also the only person who can become a referral at all.

**Trades with no partner.** Expected and normal. A buyer who reached the listing through efBazaar
itself leaves `partner_channel_id` null, and the settle path posts no share.

## 6. Posting

marketplace-service publishes `efbazaar.marketplace.channel-post-requested`
`{ postId, listingId, telegramChannelId, caption, mediaMessageIds }`. The bot consumes it, posts to
the channel, and reports back to
`/internal/marketplace/v1/partners/channel-post-result` `{ postId, telegramMessageId | error }` —
the same shape as the existing `channel-verified` callback.

The post's inline button carries `efbazaar.uz/l/<listingId>?p=<code>` as a `url` button, not a
`web_app` button: `web_app` buttons only work in private chats.

No cadence engine, no queue throttling. Posting is seller-initiated and paid for, so it is
rate-limited by the thing that limits everything else — people not wanting to spend money.

### 6.1 When a partnership or a listing ends

Cancellation (`PartnerService.cancelByUser` / `cancelByAdmin` / `onChannelRemoved`) sets
`partner_channels.active = false`. The channel disappears from the picker immediately. Orders already
`HELD` but not yet posted are refunded — the bot has lost its administrator rights and the post is
never going to land. Orders already `POSTED` are left alone: the advertisement was delivered and paid
for, and trades still attributed to it still pay out, because the stamped `Trade` rows do not consult
`active`.

A listing that is sold or deleted leaves its channel posts in place. Deleting a Telegram message the
seller paid to publish would be destroying delivered goods; the post links to a listing page that
shows its own status.

## 7. UI

### 7.1 Listing creation — the channel picker

A section on the listing form: "Katta kanallarda ham chiqarish".

- Empty search: channels ranked by subscriber count, descending.
- Typed search: channels whose **title starts with** the query, still ranked by subscribers within
  the match. `"Pre"` returns `Premium Efootball akkountlari (4 219)` above `Prefer Efootball (2 334)`.
- Each row shows the channel avatar, title, subscriber count and posting price — the channel, not the
  partner. A seller is buying an audience and has no reason to care who owns it.
- Selected channels and a running total, so the seller sees the cost before committing.

### 7.2 Every user — the invite links

**Two links, each on its own row with its own copy button**, labelled "Bot havolasi" and "Sayt
havolasi". The referrer picks; both resolve to the same code and land in the same table.

Then: how many people joined through them, how many have traded, and what that has earned. It belongs
wherever the user's own account lives, not behind a partner-only route: this is now a feature of
being a user.

Without this screen the feature does not exist — a link nobody can find refers nobody.

### 7.3 `/partner` — the partner's own panel

- **Posting price** — one number, within the admin's bounds, with the bounds shown.
- **Channel funnel** — clicks and registrations *that came through this channel*. Not the personal
  invite link: referrals became a platform-wide feature with their own page (§7.2) after this section
  was first written, and duplicating the link here would give a partner two places to copy the same
  code from. What belongs here is the part `/invite` cannot show — how the channel itself is
  performing.
- **Earnings** — the three streams shown separately, because they behave differently and a partner
  deciding whether to lower their posting price needs to see which stream responds.
- **Posts** — what has been published to their channel, and what it earned.

### 7.4 `/admin/referrals` — the referral section

Separate from the partner section, because most referrers are not partners.

- **Every user who has referred anyone**, ranked by count. Partners appear here like anyone else —
  they are users with a link.
- **Click a user** to see who they referred: when, whether that person has traded yet, and what was
  paid.
- **Reward settings** — the amount. It is the only knob: the reward is not gated on anything (§4.4).

### 7.5 `/admin/partners` — the partner analytics dashboard

- **Payout policy** — the global default, and a per-partner override table.
- **Funnel, per partner** — clicks → registrations → trades → revenue. The funnel is the point: a
  channel with many clicks and no trades is a different problem from a channel with no clicks.
- **Posting activity** — orders, delivered, failed, refunded.

### 7.6 The main admin dashboard

A referral leaderboard: who is bringing the most people. It answers a question the per-section pages
cannot — *who is growing the platform right now* — and it is the reason the referral data is worth
collecting from people who will never be partners.

## 8. Deliberately deferred

**Tiered pricing by team strength** (3000+ → 15 000, 2000+ → 5 000). Not built. But price is never
read directly from `post_price_som` — every caller goes through `PartnerPricing.priceFor(channel,
listing)`, which today returns the single column. Adding tiers changes that method's body and nothing
else.

**Automatic posting of listings nobody paid for.** The original sketch had efBazaar pushing listings
into partner channels on a schedule. The paid model replaces it: the same links, the same tables, but
distribution the seller chooses and pays for.

**Splitting the referral reward, or paying it more than once per user.** One reward, one referrer,
one trade. If that ever changes, `referrals` is already keyed to carry it.

**Anti-abuse gating on the reward.** Considered and deliberately rejected: see §4.4. Should farmed
accounts ever become visible in the data, the narrowest available rule is to decline the reward when
the referred user's first trade is with their own referrer — it needs no new settings and no
threshold anybody has to keep in sync. Not built.

## 9. Testing

The claims that must not be taken on trust:

- `settle` with a partner sums to zero, and the platform's share drops by exactly the partner's.
- `settle` with no partner produces byte-identical postings to today's code.
- `release` pays no partner.
- The monthly job run twice pays once.
- Pro-rating on the first month.
- A second partner cannot claim an existing referral.
- Registering after arriving through a listing post — with no invite link ever clicked — records the
  channel owner as the referrer.
- An account older than the window claims nothing, however it arrived.
- A user cannot refer themselves.
- The reward is paid on the referred user's first settled trade and on no later one, whichever side
  they were on.
- A trade between two referred first-timers pays both referrers.
- A failed trade pays nothing, and leaves the reward still claimable by a later successful one.
- A redelivered trade-succeeded event pays once.
- The amount paid is the amount configured at payout time, and a later change to the setting does not
  alter the recorded row.
- Last-click-wins overrides; a stamped trade does not.
- An order whose total exceeds the balance charges nothing at all — not a partial set.
- Two partners are settled and the remainder refunded out of one bulk hold, summing to zero.
- A failed post refunds the seller in full.
- Search ranks by prefix then subscribers.

Each is written as a failing test first, and each is mutation-checked: remove the behaviour, confirm
the test fails.

## 10. Build order

1. `user_referral_codes`, `referrals`, `referral_settings`; the invite link screen; the cookie, the
   claim endpoint and the account-age check.
2. The referral reward: the trade-succeeded consumer, the payout, the wallet label.
3. `/admin/referrals` and the leaderboard on the main dashboard.
4. `partner_channels` + backfill from approved applications; channel link codes feeding the same
   referral path as step 1.
5. Posting price, admin bounds, the channel picker, the order and hold.
6. Bot posting and the result callback; settle and refund.
7. Trade stamping; the share inside `settle`.
8. Partner payout policy config; the monthly job.
9. Partner panel; the partner analytics dashboard.

Referrals come first and ship on their own. They are the smaller feature, they touch every user
rather than a handful of partners, and steps 1–3 are a complete, useful thing before a single line of
the advertising marketplace exists. The partner work then reuses the referral plumbing rather than
building a second copy of it.
