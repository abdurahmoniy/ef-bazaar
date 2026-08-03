# Player Card Inventory and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every card a canonical player identity and persist each seller-declared card in a normalized listing inventory without breaking the existing JSON attributes contract.

**Architecture:** The secondary card database owns canonical identity and exposes it through the existing card API. The primary marketplace database mirrors selected cards into `listing_cards` in the same transaction as each listing write, while continuing to emit `attributes.valuable_players` for compatibility.

**Tech Stack:** Java 21, Spring Boot, JdbcTemplate, Spring Data JPA, PostgreSQL/Flyway, JUnit 5, Mockito, Next.js, TypeScript, Vitest, React Testing Library.

---

## Task 1: Add canonical identity to the card catalogue

**Files:**
- Create: `infra/postgres/efbazaar/V4__player_identities.sql`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSchemaBootstrap.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardColumns.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardSchemaBootstrapTest.java`

- [x] Add a failing bootstrap test asserting creation of `player_identities` and `card_player_identities` and their indexes.
- [x] Run the focused Java 21 bootstrap/normalizer tests and confirm the missing behavior fails.
- [x] Add the immutable SQL migration with canonical identity and persisted card-mapping tables.
- [x] Extend bootstrap SQL with the same `CREATE TABLE IF NOT EXISTS` and indexes so environments where the card DB is bootstrapped by the service converge safely.
- [x] Backfill deterministic normalized-name groups, assign UUIDs once, and preserve mappings on subsequent runs.
- [x] Re-run the focused tests successfully; include this task in the release-slice commit.

## Task 2: Expose `playerId` through card reads and writes

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSearchResult.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSearchService.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardWriter.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardSearchServiceTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardWriterTest.java`

- [x] Add failing query tests requiring a player ID and a left join from every card branch to `card_player_identities`.
- [x] Add a failing writer test showing a newly scraped card receives the deterministic identity mapping after its card row is upserted.
- [x] Run both focused tests and verify failures are limited to the missing identity behavior.
- [x] Add the `playerId` record field, select `identity.player_id`, map it as UUID, and qualify card columns to avoid ambiguous identifiers.
- [x] Add an idempotent writer step that inserts the normalized identity and then `card_player_identities`, preserving an existing mapping on conflict.
- [x] Run all focused identity tests successfully and commit the card identity slice.

## Task 3: Normalize seller-declared listing cards transactionally

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V28__listing_cards.sql`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingCardInventory.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingPersistence.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingService.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/ListingCardInventoryTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/ListingServiceTest.java`

- [x] Add failing inventory tests for ordered replacement, removal of stale rows, and legacy/missing `valuable_players` data.
- [x] Add a failing transactional-boundary test and confirm the missing behavior.
- [x] Add `listing_cards(listing_id uuid, efhub_id bigint, player_id uuid, ordinal smallint, snapshot jsonb, primary key(listing_id, efhub_id))`, a unique `(listing_id, player_id)` constraint, and player/listing indexes.
- [x] Implement `replace(UUID listingId, Object valuablePlayers)` using delete-then-batch-insert inside the caller transaction; take `efhub_id`, `player_id`, ordinal, and the complete JSON snapshot from each validated entry.
- [x] Refactor `create`/`update` so media upload remains outside the database transaction but a separate Spring bean performs `listings.save(...)` and inventory replacement in one short `@Transactional` method.
- [x] Run all focused inventory and listing-service tests successfully; include this task in the inventory-slice commit.

## Task 4: Validate canonical selections and backfill existing listings

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/AttributeValidator.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/jobs/ListingCardBackfill.java`
- Modify: `backend/marketplace-service/src/main/resources/application.yml`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/AttributeValidatorTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/jobs/ListingCardBackfillTest.java`

- [ ] Add failing validation cases for missing/invalid `player_id`, duplicate `efhub_id`, duplicate `player_id`, and 31 cards; assert 30 distinct cards pass.
- [ ] Add failing backfill tests for idempotency, malformed legacy rows, and resume-after-partial-run behavior.
- [ ] Run both focused tests and confirm the intended failures.
- [ ] Reject duplicates rather than silently collapsing them; normalize UUIDs to canonical lowercase strings; raise the configured maximum from 12 to 30.
- [ ] Implement a disabled-by-default, batch-sized backfill that reads existing `attributes.valuable_players`, upserts normalized rows, records counters, and can be safely rerun.
- [ ] Run the focused tests and commit with `feat(listings): validate and backfill card inventory`.

## Task 5: Update seller card selection and compatibility types

**Files:**
- Modify: `frontend/src/lib/marketplace-types.ts`
- Modify: `frontend/src/components/marketplace/card-picker.tsx`
- Modify: `frontend/src/components/marketplace/listing-form.tsx`
- Test: `frontend/src/components/marketplace/card-picker.test.ts`
- Test: `frontend/src/lib/listing-form-data.test.ts`

- [x] Add failing tests requiring a 30-card limit and duplicate canonical-player prevention.
- [x] Run the focused card-picker/listing-form-data tests and confirm the new expectations fail.
- [x] Add `playerId` to card types and serializers, use canonical identity for selection equality, and keep `efhubId` as card-edition identity.
- [x] Add concise seller copy explaining that selected cards power buyer matching, show `n / 30`, completeness feedback, and a META-filtered entry point without hiding ordinary search.
- [x] Re-run the focused tests and `npm run typecheck` successfully; commit the seller inventory editor.

## Task 6: Verify the release slice

- [ ] Run marketplace-service tests with Java 21; record the known unrelated `MarketplaceApplicationTests.contextLoads` DreamTeamRepository configuration error separately if it remains.
- [ ] Run `npm test` and `npm run typecheck`; record the known unrelated homepage-copy assertion separately if it remains.
- [ ] Run `git diff --check` and inspect the migration/backfill for idempotency and rollback safety.
