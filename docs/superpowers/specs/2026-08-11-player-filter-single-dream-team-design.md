# Player Filtering and Singleton Dream Team Design

## Context

The marketplace offers three entry points for player-based account filtering:
META cards, free-text player search, and a saved Dream Team. All three produce
the same typed `matchCard=<efhubId>:<playerId>:<importance>` query and are scored
by `JdbcListingMatchRepository` against the normalized `listing_cards` table.

The request reaches the backend correctly. The production failure is in the
listing inventory: `V28__listing_cards.sql` created the normalized table after
many listings already existed, and the Java repair job that can populate those
legacy rows is disabled by default. The production Compose service does not
enable it. Listings without normalized rows can never receive positive fuzzy
match credit, so all three UI entry points appear ineffective.

The Dream Team model also permits ten teams per user. The UI exposes switching,
creating, naming, and deleting teams, and the marketplace dialog requires an
extra click to select a team before applying it. The desired product is one
persistent, easy-to-manage Dream Team per user.

## Goals

- Make META, searched-player, and Dream Team account filters work for legacy
  and newly created listings.
- Preserve the existing 1–10 strictness scale and fuzzy scoring rules: exact
  card credit is `1.0`, another card for the same canonical player is `0.75`,
  and priority players carry three times the weight.
- Enforce at most one Dream Team per authenticated user at the database and
  service layers.
- Keep the most recently updated team when an existing user has duplicates.
- Remove create/delete/team-switching decisions from the Dream Team UI.
- Automatically use the single saved team from the marketplace filter dialog.
- Roll out without breaking cached frontend clients that still call the old
  create and update endpoints.

## Non-goals

- Changing the card catalogue, META administration, or canonical player
  identity model.
- Changing fuzzy scoring weights or strictness semantics.
- Automatically creating an empty Dream Team at registration time.
- Adding autosave. Saving remains explicit so authentication and network errors
  remain visible and predictable.
- Refactoring unrelated marketplace filters or listing persistence.

## Chosen Architecture

### 1. Repair missing listing card inventory

Keep `ListingCardInventoryBackfill` as the cross-database repair mechanism. A
Flyway-only data migration cannot resolve `efhub_id` values through
`card_player_identities` because the identity catalogue is served by the
separate read-only card datasource.

Tighten the backfill query so it selects only listings that:

- contain a non-empty `valuable_players` JSON array; and
- have no rows in `listing_cards`.

This makes the repair cheap and idempotent after its first successful run. New
listing create/update operations continue using `ListingCardInventory.replace`
inside the listing transaction and therefore remain synchronized normally.

Enable the repair for the marketplace container with
`LISTING_CARD_BACKFILL_ENABLED`, defaulting to `true` in Compose. Keep the
standalone Spring configuration default at `false`; production behavior is
explicitly owned by deployment, while tests and ad-hoc local starts do not run a
database repair unexpectedly. Operators may set the variable to `false` after
the repair, but leaving it enabled only checks for missing rows on future
starts.

The job continues past malformed or unresolved legacy cards and logs scanned,
updated, failed, and normalized-card counts. A failed listing remains eligible
for a future startup retry.

### 2. Enforce one Dream Team per user

Add `V31__single_dream_team_per_user.sql`. It ranks rows within each `user_id`
by `updated_at DESC`, then `created_at DESC`, then `id DESC` for deterministic
ties. It deletes every row except rank one and replaces the old non-unique user
index with a unique index on `user_id`.

The repository exposes one optional lookup for a user's team. The service
provides a `saveMine(userId, request)` operation:

- validate and normalize formation, slots, weights, and canonical card claims;
- update the existing row when present;
- otherwise create the user's first row.

The unique index is the final guard against a second team. The old `POST
/api/v1/dream-teams` becomes a compatibility alias for the same upsert behavior,
so a cached client cannot create duplicates. Existing `PUT /{id}` and read
routes remain compatible and user-scoped. The public DELETE route is removed,
so users cannot delete the singleton team through the API.

Add `PUT /api/v1/dream-teams/me` as the canonical frontend save endpoint. It
returns the saved `DreamTeamResponse` whether it created or updated the row.
`GET /api/v1/dream-teams` remains an array response for compatibility, but the
database invariant limits it to zero or one element.

### 3. Simplify the Dream Team page

The page still supports an unauthenticated local draft and redirects to login
when Save is pressed. Its editor becomes a single-team experience:

- fixed heading/name: `Mening jamoam`;
- one formation selector;
- one interactive pitch with up to eleven distinct canonical players;
- the existing priority-star control;
- `Saqlash` (or `Kirish va saqlash`) and `Shu jamoa bo'yicha qidirish` actions.

Remove the team chip switcher, `Yangi`, editable team-name field, and delete
button. The first and only server team initializes the editor. Restored local
drafts replace the current editable formation/slots but never create a second
team. Save always calls the singleton upsert endpoint.

Searching from the Dream Team page continues to use the currently visible
slots, including unsaved edits, because that most closely matches what the user
sees and does not make navigation depend on a successful save.

### 4. Make the marketplace Team tab one-click

The filter dialog no longer stores or renders a selected team ID. When the
`Mening jamoam` tab is active, it displays the only saved team and Apply uses
that team's populated slots automatically. Users no longer need to click a team
chip first.

META and searched-card selection remain independent. Switching back to either
tab makes Apply use the manually selected cards. Clearing removes the typed
match query regardless of the current tab.

## Data Flow

1. The user selects META cards, searched cards, or opens the single Dream Team.
2. The frontend writes repeated typed `matchCard` parameters and a strictness
   value while preserving other marketplace filters.
3. `ListingController` validates canonical card/player pairs and delegates to
   `browseMatched`.
4. `JdbcListingMatchRepository` scores candidate listings using
   `listing_cards`, filters by the requested threshold, and orders by relevance.
5. The startup repair ensures legacy listings with declared valuable players
   have the same normalized inventory that new listings receive transactionally.

## Error Handling and Compatibility

- Malformed match criteria keep their existing stable 400 response.
- Backfill failures are isolated per listing and reported in logs; they do not
  prevent other listings from being repaired.
- Saving a malformed Dream Team keeps existing validation errors and never
  replaces the stored team.
- A cached client calling POST updates or creates the singleton rather than
  receiving a team-limit error.
- A cached delete request receives method-not-allowed after the DELETE mapping
  is removed; no row is deleted.
- Signed-out users can still use META/player search and can build a local Dream
  Team draft before authentication.

## Testing Strategy

### Backend unit tests

- Prove the inventory repair query targets only non-empty legacy card arrays
  with no normalized rows and preserves keyset pagination.
- Prove `saveMine` creates when absent and updates when present.
- Prove compatibility POST delegates to singleton behavior and the ten-team
  limit/count path is gone.
- Preserve all formation, duplicate-player, weight, and identity validation
  coverage.

### Backend integration and migration tests

- Run the matching repository against PostgreSQL with listings representing an
  exact card, alternate card for the same player, and no match; verify scores,
  threshold filtering, and relevance order.
- Apply the singleton migration to duplicate user rows and verify the latest
  row survives and a second row violates the unique index.

### Frontend tests

- Prove singleton save uses `PUT /dream-teams/me`.
- Prove the Team tab automatically applies the saved team's cards without a
  team-selection click.
- Preserve URL serialization tests for repeated `matchCard` values, strictness,
  and unrelated marketplace filters.
- Run unit tests, ESLint, TypeScript checking, and the production build.

## Rollout and Observability

Deploy the database migration, backend, Compose configuration, and frontend in
one release. On the first marketplace-service start, inspect the existing
`Listing card inventory backfill finished` log and confirm `failed=0` or
investigate listed IDs. Then test one META card, one searched player, and the
saved Dream Team at several strictness levels. The backfill remains safe to run
again because successfully normalized listings are excluded from subsequent
pages.
