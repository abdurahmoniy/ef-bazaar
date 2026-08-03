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

- [ ] Add a failing bootstrap test asserting creation of `player_identities` and `card_player_identities` and their indexes.
- [ ] Run `JAVA_HOME=/Users/abdurahmoniy/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home mvn -pl marketplace-service -Dtest=CardSchemaBootstrapTest test` from `backend`; confirm the new assertions fail.
- [ ] Add the immutable SQL migration with `player_identities(id uuid primary key, normalized_name text not null, display_name text not null, created_at timestamptz not null default now())` and `card_player_identities(card_type text not null, efhub_id bigint not null, player_id uuid not null references player_identities(id), primary key(card_type, efhub_id))`.
- [ ] Extend bootstrap SQL with the same `CREATE TABLE IF NOT EXISTS` and indexes so environments where the card DB is bootstrapped by the service converge safely.
- [ ] Backfill deterministic identity IDs with `uuid_generate_v5(uuid_ns_url(), 'ef-player:' || lower(regexp_replace(trim(name), '\\s+', ' ', 'g')))` and use the normalized name as the initial identity boundary.
- [ ] Re-run the focused test and commit with `feat(cards): add canonical player identities`.

## Task 2: Expose `playerId` through card reads and writes

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSearchResult.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSearchService.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardWriter.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardSearchServiceTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardWriterTest.java`

- [ ] Add failing row-mapping/query tests requiring `CardSearchResult(UUID playerId, long efhubId, ...)` and a left join from every card branch to `card_player_identities`.
- [ ] Add a failing writer test showing a newly scraped card receives the deterministic identity mapping after its card row is upserted.
- [ ] Run both focused tests and verify failures are limited to the missing identity behavior.
- [ ] Add the `playerId` record field, select `cpi.player_id`, map it with `rs.getObject("player_id", UUID.class)`, and qualify card columns to avoid ambiguous identifiers.
- [ ] Add an idempotent writer step that inserts the normalized identity and then `card_player_identities`, preserving an existing mapping on conflict.
- [ ] Run the focused tests and commit with `feat(cards): expose canonical player id`.

## Task 3: Normalize seller-declared listing cards transactionally

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V28__listing_cards.sql`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ListingCard.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/repository/ListingCardRepository.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingCardInventory.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingService.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/ListingCardInventoryTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/ListingServiceTest.java`

- [ ] Add failing inventory tests for ordered replacement, removal of stale rows, a missing `valuable_players` attribute, and rollback when inventory sync fails.
- [ ] Run the two focused tests and confirm the transaction/sync assertions fail.
- [ ] Add `listing_cards(listing_id uuid, efhub_id bigint, player_id uuid, ordinal smallint, snapshot jsonb, primary key(listing_id, efhub_id))`, a unique `(listing_id, player_id)` constraint, and player/listing indexes.
- [ ] Implement `replace(UUID listingId, Object valuablePlayers)` using delete-then-batch-insert inside the caller transaction; take `efhub_id`, `player_id`, ordinal, and the complete JSON snapshot from each validated entry.
- [ ] Refactor `create`/`update` so media upload remains outside the database transaction but a separate Spring bean performs `listings.save(...)` and inventory replacement in one short `@Transactional` method.
- [ ] Run the focused tests and commit with `feat(listings): persist normalized card inventory`.

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
- Test: `frontend/src/components/marketplace/card-picker.test.tsx`
- Test: `frontend/src/components/marketplace/listing-form.test.tsx`

- [ ] Add failing UI tests requiring `playerId`, a 30-card limit, duplicate-player prevention, a declared-inventory explanation, completeness feedback, and a META shortcut.
- [ ] Run `npm test -- card-picker.test.tsx listing-form.test.tsx` from `frontend`; confirm the new expectations fail.
- [ ] Add `playerId: string` to card types and serializers, use canonical identity for selection equality, and keep `efhubId` as card-edition identity.
- [ ] Add concise seller copy explaining that selected cards power buyer matching, show `n / 30`, and provide a META-filtered entry point without hiding ordinary search.
- [ ] Re-run the focused tests, run `npm run typecheck`, and commit with `feat(listings): improve declared card inventory editor`.

## Task 6: Verify the release slice

- [ ] Run marketplace-service tests with Java 21; record the known unrelated `MarketplaceApplicationTests.contextLoads` DreamTeamRepository configuration error separately if it remains.
- [ ] Run `npm test` and `npm run typecheck`; record the known unrelated homepage-copy assertion separately if it remains.
- [ ] Run `git diff --check` and inspect the migration/backfill for idempotency and rollback safety.
