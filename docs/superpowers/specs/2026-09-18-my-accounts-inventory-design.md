# My accounts — a reusable account inventory behind every listing

**Date:** 2026-09-18
**Status:** Design (approved via brainstorming)
**Owner:** Muxiddinov
**Builds on:** `listings`, `listing_cards`, `attribute_definitions` (marketplace-service), mailbox handover (trade-service)
**Depends on:** marketplace-service (owner), trade-service (phase 2 events only)

## 1. Purpose

Every trade provisions a fresh platform mailbox for the buyer. After a few trades a user holds
several `…@efbazaar.uz` addresses and no way to tell which one opens which eFootball account. The
address is remembered nowhere: it arrives in a notification and is gone.

The listing has the same problem from the other side. A seller fills the whole form again for an
account they have already described once, and the description they typed dies with the listing when
it sells or is taken down.

This spec makes the **account**, not the listing, the thing a user owns on efBazaar. You build the
account once — platform, division, coins, squad, photos, and its email — and keep it up to date as
you play. Putting it on the market is then a small act: a price and a couple of terms. Like building
a house and later deciding to sell it.

"E'lonlarim" (My listings) is replaced by "Akkountlarim" (My accounts). A listing becomes a state an
account can be in, shown as a **Bozorda** (On the market) badge.

## 2. Decisions taken

| Question | Decision |
|---|---|
| Account ↔ listing relationship | Account is the source. Publishing copies its data into a listing and keeps a link (`current_listing_id`) |
| Editing an account that is on the market | The live listing is updated too. Price and exchange terms are never touched — they belong to the listing |
| Where the email comes from | Both: the platform mailbox attaches automatically (phase 2), and the user can type or edit one by hand |
| Password storage | None. Passwords stay in trade-service, encrypted, for the duration of a trade |
| Owning service | marketplace-service — it already owns the attribute schema and the player-card inventory |
| New listing without an account | An account is always created behind it, with no email attached. No checkbox: whoever can list an account owns it |
| Account created from "My accounts" | Stays private until the owner publishes it |
| Trade completes (phase 2) | Seller's account is archived; a new account appears for the buyer with the listing data and the handed-over mailbox |
| Seller marks "Sotildi" by hand (sold elsewhere) | The account is archived too and its email is detached — it is not theirs any more |
| Email visibility | Owner only. It never enters a listing row or a listing response |
| Phasing | Phase 1: inventory + autofill. Phase 2: trade integration |

## 3. Data model (marketplace-service)

```sql
CREATE TABLE user_accounts (
    id                  UUID PRIMARY KEY,
    owner_id            UUID        NOT NULL,
    title               TEXT,               -- user's own name for it: "Asosiy akkount"
    description         TEXT,               -- reused as the listing description
    attributes          JSONB       NOT NULL DEFAULT '{}',
    media_message_ids   TEXT[]      NOT NULL DEFAULT '{}',
    email               TEXT,
    email_source        VARCHAR(16),        -- MANUAL | PLATFORM
    mailbox_id          UUID,               -- trade-service mailbox, when PLATFORM
    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | ARCHIVED
    current_listing_id  UUID,               -- set while the account is on the market
    source_listing_id   UUID,               -- the listing this account was created from
    archived_reason     VARCHAR(24),        -- SOLD_ON_PLATFORM | SOLD_ELSEWHERE | BY_OWNER
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_accounts_owner_idx ON user_accounts (owner_id, status, created_at DESC);
CREATE UNIQUE INDEX user_accounts_listing_idx ON user_accounts (current_listing_id)
    WHERE current_listing_id IS NOT NULL;

CREATE TABLE user_account_cards (   -- same shape as listing_cards
    account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    player_id  UUID NOT NULL,
    efhub_id   BIGINT,
    CONSTRAINT user_account_cards_unique_player UNIQUE (account_id, player_id)
);
```

Three points worth stating plainly:

**Attributes use the listing schema, minus the requirement.** `AttributeValidator` and
`attribute_definitions` are reused as they are, but an account may leave required fields empty — it
is allowed to be a half-built draft. Completeness is enforced when the account is published, by the
existing listing validation.

**Attributes split by ownership.** Everything describing the account (platform, division, coins,
team strength, Google Play link, squad) lives on the account. The selling terms — price,
negotiability, `exchange_mode` — live only on the listing. The same account can be 2 000 000 so'm
today and exchange-only next month.

**Cards are normalized, like listings.** The squad is rows, not a JSON blob, so "add the new star
player to my account" and any later search work through the same code path as `listing_cards`.

## 4. API

All routes are under `/api/marketplace/v1/accounts` and scoped to `X-User-Id`. A request for an
account whose `owner_id` differs answers `404` — not `403`, which would confirm the id exists.

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | My accounts, newest first. Includes `email`, `status`, `current_listing_id` and a small listing summary (price, status, view count) when published |
| POST | `/` | Create an account by hand |
| GET | `/{id}` | One account |
| PATCH | `/{id}` | Edit title, description, attributes, media, cards |
| PATCH | `/{id}/email` | Set or clear the email (`email_source = MANUAL`) |
| DELETE | `/{id}` | Delete. Refused while on the market |
| POST | `/{id}/publish` | Put on the market: body carries price, negotiable, `exchange_mode`, channel ids. Creates the listing, sets `current_listing_id` |
| POST | `/{id}/unpublish` | Take off the market: the listing is deleted the way the current owner action does it |

Listing creation keeps its current endpoint. It gains one behaviour: after a successful create, an
account is created from the same payload (no email) and linked. This runs in the same transaction —
a listing without its account would be a half-built record that later edits could not propagate from.

## 5. Flows

**Publish.** `publish` validates the merged payload through the normal listing validation, creates
the listing (status ACTIVE), writes `current_listing_id`, and fires the existing listing-created
events, so channel posting and the official channel keep working untouched.

**Edit propagation.** `PATCH /{id}` writes the account, then — if `current_listing_id` is set —
copies description, attributes, media and cards onto that listing and saves it through
`ListingService`, so its existing side effects (search index fields, channel post edit, events) run
exactly as a manual listing edit does. Price, negotiability and `exchange_mode` are excluded by an
allow-list, not by a "copy everything except" rule.

**Unpublish.** Deletes the listing (existing owner action), clears `current_listing_id`. The account
stays, with everything it holds.

**Sold by hand (sold elsewhere).** The existing "Sotildi" action keeps marking the listing SOLD, and
now also archives the account with `archived_reason = SOLD_ELSEWHERE`, clearing `email`,
`email_source` and `mailbox_id`. The confirmation dialog says so in plain words, and warns when a
platform mailbox is attached: that mailbox stays in the buyer's hands, so the seller should not
expect to keep it.

**Sold through a trade (phase 2).** On `trade-succeeded`, the seller's account is archived with
`SOLD_ON_PLATFORM`, and a new ACTIVE account is created for the buyer from the listing snapshot.
When the mailbox handover event arrives, the buyer's account gets `email`, `mailbox_id` and
`email_source = PLATFORM`. Both steps are idempotent by trade id — the events can be replayed.

**Mailbox attaches late.** If the handover event never arrives, the buyer's account simply has no
email and the buyer can type one. Nothing blocks.

## 6. Email privacy

The email is private to the owner, enforced in three independent places, so no single mistake leaks
it:

1. The `listings` table has no email column, and `ListingResponse` has no such field.
2. `GET /accounts` reads by `owner_id` from the nginx-injected header; no admin or public route
   returns account emails.
3. Publishing copies an explicit allow-list of fields into the listing. A new account column added
   later cannot ride along by accident.

In the UI the address is masked until the owner taps it — the person next to them can read a screen.

## 7. UI

**Profile tab `listings` becomes `accounts`.** "Sevimlilar" is unaffected; those are other people's
listings and never accounts.

Account card: photo, title, the key attributes on one line, the masked email with a reveal, the
squad count, and — when published — a **Bozorda** badge with the price and a link to the listing.
Actions: Tahrirlash, Bozorga chiqarish / Bozordan olish, E'lonni ko'rish, O'chirish (hidden while
published).

**Publish dialog:** price, negotiable, exchange terms, channel selection. Everything else comes from
the account.

**Edit screen:** the existing listing form minus price and exchange terms. When the account is on
the market, a notice at the top: changes reach the listing too.

**`/marketplace/new` gains a first step:** "Akkountlarimdan tanlash" (with a count) or "Yangi akkount
ma'lumotlarini kiritish". The first path autofills the form from the chosen account and asks only for
price and terms; the second is today's form, and the account is created behind it. A user with no
accounts never sees the first option.

## 8. Migration and backfill

`V<n>__user_accounts.sql` creates both tables. A one-time backfill then creates an account for every
`ACTIVE` listing, copies its cards, and links `current_listing_id` / `source_listing_id`. `SOLD` and
`DELETED` listings get nothing: a sold account is not the seller's any more, and would only clutter
the new list.

The backfill runs at startup behind a flag, in the shape of the existing
`LISTING_CARD_BACKFILL_ENABLED` job, and is idempotent — a listing that already has an account is
skipped.

## 9. Error cases

| Case | Behaviour |
|---|---|
| Delete an account that is on the market | `409`, UI says to take it off the market first |
| Publish an account that is already published | `409` with the existing listing id |
| Publish an incomplete account | `400` from the existing listing validation, pointing at the missing fields |
| Propagation finds the listing SOLD | Account is saved, link cleared, user told the account was sold |
| Propagation finds the listing DELETED | Same, silently — the listing is already gone |
| Account not found or not mine | `404` |
| Handover event for an unknown account | Logged and dropped; the buyer can attach the email by hand |

## 10. Testing

Backend: ownership on every route (another user's id answers 404); publish / unpublish round trip;
propagation updates the live listing but never price or `exchange_mode`; listing responses carry no
email; manual "Sotildi" archives the account and clears the email; backfill is idempotent and skips
sold listings. Phase 2 adds: trade-succeeded moves the account, handover attaches the mailbox, both
replay-safe.

Frontend: the Bozorda badge and the disabled delete; autofill fills the form from an account; the
email stays masked until revealed; the two-way first step on `/marketplace/new`.

## 11. Phasing

**Phase 1 — inventory and autofill.** Tables, backfill, CRUD API, publish/unpublish, propagation,
the accounts tab, the new listing flow. Email is typed by hand. Shippable and useful on its own.

**Phase 2 — trade integration.** Mailbox attaches automatically, accounts move between parties when
a trade completes. Kafka consumers only; phase 1 keeps working if this is delayed.

## 12. Out of scope

Reminders when a new player card appears ("add it to your account"), account history across owners,
multiple listings per account, sharing an account card with another user, and any storage of account
passwords. None of them serve the pain this spec exists for.
