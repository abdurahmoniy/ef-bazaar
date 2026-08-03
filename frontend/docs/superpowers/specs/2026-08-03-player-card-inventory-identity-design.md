# Player Card Inventory and Identity Design

## Goal

Give account matching a reliable data source by separating searchable listing cards from generic JSONB attributes and by identifying the real player independently from a particular card version or display-name spelling.

## Current constraints

Listings store at most twelve optional `valuable_players` snapshots inside `attributes`. Dream Team matching repeatedly scans that JSONB. Same-player matching compares names case-insensitively, so aliases or corrected names can fail and unrelated players with the same display name can collide. The seller form does not make the search consequence of incomplete card entry clear.

## Canonical identity model

The secondary cards database gains two tables:

- `player_identities`: UUID `id`, canonical name, normalized name, timestamps.
- `card_player_identities`: `efhub_id` primary key, `player_id` foreign key, assignment source (`AUTO` or `ADMIN`), timestamp.

Initial synchronization groups card versions by a deterministic Unicode-normalized name. The mapping is persisted, so a later spelling correction cannot silently change historical identity. Admins can merge identities or reassign selected cards from the existing players administration surface. These admin operations update mappings, not listing ownership data. Fresh-database SQL in `infra/postgres/efbazaar` and the idempotent card schema bootstrap create the same structures for clean installs and rolling deployments.

Card catalogue responses add `playerId`. New card snapshots written into listings and Dream Teams include both `efhubId` and `playerId`. Old snapshots without `playerId` remain displayable.

## Searchable listing inventory

The marketplace database gains `listing_cards` in a new immutable Flyway migration rather than modifying V27:

- `listing_id` UUID foreign key with cascade delete.
- `efhub_id` bigint.
- `player_id` UUID.
- `ordinal` smallint preserving seller order.
- card snapshot JSONB for name, image, type, rating, position, and playing style.
- primary key `(listing_id, efhub_id)`.
- indexes on `(player_id, listing_id)`, `(efhub_id, listing_id)`, and `listing_id`.

Listing create and update synchronize `listing_cards` in the same marketplace transaction as the listing. JSONB `attributes.valuable_players` remains populated during compatibility rollout because existing response and display helpers read it. The normalized rows become the source of truth for matching.

A Flyway migration creates `listing_cards`; an idempotent, explicitly enabled Spring backfill job then reads existing object-shaped `valuable_players` in bounded pages, resolves identities through the cards datasource, and writes each page in a marketplace transaction. Deployment runs the job after the schema migration and before enabling the new matcher. Legacy bare strings remain display-only and are marked unmatchable; they are never guessed into an identity.

## Seller experience

The listing wizard renames the section to “Searchable valuable cards” and explains that only selected cards participate in player matching. The limit increases from 12 to 30 to reduce false negatives while keeping data entry bounded.

The section provides:

- a searchable multi-card picker with duplicates prevented by `efhubId`;
- a META shortcut showing currently effective META cards for quick ownership selection;
- a visible completeness state: none at 0 cards, started at 1–10 cards, or strong coverage at 11–30 cards;
- an inline warning before submission when no cards are selected: the listing remains valid but will not appear in player-card searches.

The field stays optional. Accounts without notable cards must still be listable, and forcing fabricated metadata would reduce trust.

## Data flow

1. Card catalogue search returns a card with canonical `playerId`.
2. Seller selects up to 30 cards.
3. Frontend sends full snapshots including `efhubId` and `playerId`.
4. Attribute validation verifies unique card IDs and known player IDs.
5. Listing service writes the listing and replaces its `listing_cards` rows atomically.
6. Listing responses continue exposing the card snapshots expected by current components.

## Error handling

- Unknown `efhubId` or mismatched `playerId` returns HTTP 400 with a field-level error.
- Duplicate `efhubId` returns HTTP 400 rather than silently deduplicating server-side.
- Failure to synchronize normalized rows rolls back the listing write.
- Failure to resolve a legacy snapshot during backfill is recorded and skipped without inventing a player identity.
- Card identity merge rejects cycles and preserves one surviving canonical UUID.

## Testing

- Unit tests pin name normalization and identity assignment.
- Repository tests verify `listing_cards` indexes, uniqueness, cascade behavior, and backfill.
- Service tests prove create/update/delete synchronize normalized rows transactionally.
- API tests reject unknown identities, mismatched cards, duplicates, and more than 30 cards.
- Frontend tests cover the META shortcut, duplicate prevention, limit messaging, and empty-card warning.
- A compatibility test proves old listing responses still render while matching uses normalized rows.

## Acceptance criteria

- Every newly selected catalogue card carries a stable canonical `playerId`.
- Listing card rows always reflect the current submitted valuable-card snapshots.
- Existing listings remain readable after the migration.
- Seller copy accurately states what matching can and cannot see.
- Matching no longer needs to scan `attributes.valuable_players` for new data.

