# Reliable Account Matcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile JSON/name matching with a typed, weighted canonical-player matcher that returns stable ordering and an auditable result breakdown.

**Architecture:** A typed query parser produces 1–11 unique match criteria. A native PostgreSQL repository aggregates `listing_cards` once per listing, applies the strictness threshold, and returns score plus exact/alternate/missing counts. The existing `attr.dream_team` route becomes a compatibility adapter.

**Tech Stack:** Java 21, Spring MVC, Spring Data JPA/JdbcTemplate, PostgreSQL, JUnit 5, Testcontainers, TypeScript.

---

## Task 1: Parse and validate typed match criteria

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/dto/MatchCardCriterion.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/dto/MatchRequest.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/MatchRequestParser.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/MatchRequestParserTest.java`

- [ ] Add table-driven failing tests for `<efhubId>:<playerId>:<importance>`, importance `N|P`, strictness 1–10, empty criteria, 12 criteria, duplicate player IDs, malformed UUIDs, and unsupported importance.
- [ ] Run the focused test and confirm all validation cases fail for the intended reason.
- [ ] Implement immutable criteria with `weight()` returning 1 for normal and 3 for priority, and a parser returning no match request when no `matchCard` is supplied.
- [ ] Map strictness to minimum score: 1 means `> 0`; 2–10 mean 20%–100% in ten-point increments.
- [ ] Run the focused test and commit with `feat(search): add typed card match request`.

## Task 2: Query normalized inventory once and order stably

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/repository/ListingMatchRepository.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/repository/JdbcListingMatchRepository.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/dto/ListingMatchRow.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/repository/JdbcListingMatchRepositoryTest.java`

- [ ] Add PostgreSQL integration fixtures covering exact edition `1.0`, alternate edition same player `0.75`, missing `0`, priority weight `3`, duplicate inventory defense, strictness boundaries, ACTIVE before SOLD, and deterministic page ties.
- [ ] Run the focused integration test and confirm the repository is missing.
- [ ] Implement a CTE with a `VALUES(efhub_id, player_id, weight)` wanted set and one grouped join to `listing_cards`; compute `earned_weight`, `possible_weight`, `match_score`, and exact/alternate/missing arrays once.
- [ ] Apply `WHERE match_score > 0` for strictness 1 or `match_score >= threshold` otherwise, then order `status`, `match_score DESC`, the allowed caller sort, and `listing.id`.
- [ ] Bind every user value and allow-list sortable columns; never concatenate arbitrary request data.
- [ ] Run the integration test and commit with `feat(search): rank listings by canonical card match`.

## Task 3: Return match explanations from browse and detail

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/dto/MatchDetails.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/dto/ListingResponse.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/ListingController.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingService.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingViewAssembler.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/controller/ListingControllerTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/ListingServiceTest.java`

- [ ] Add failing tests for repeated `matchCard` request parameters, `matchStrictness`, response `matchDetails`, compatibility `matchPercent`, page totals, and detail lookup with the same match context.
- [ ] Run focused tests and verify the current `attr.dream_team`/`CardMatchScorer` route cannot satisfy them.
- [ ] Parse typed match parameters in the controller, call the native repository only when criteria exist, and assemble the returned row without re-scoring JSON in Java.
- [ ] Populate exact/alternate/missing card identifiers and weighted numerator/denominator; derive rounded `matchPercent` from the same database score.
- [ ] Accept the same typed parameters on `GET /api/v1/listings/{id}` so navigation preserves the explanation.
- [ ] Re-run focused tests and commit with `feat(search): explain listing card matches`.

## Task 4: Preserve the legacy Dream Team filter safely

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/ListingController.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingSpecifications.java`
- Delete: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/CardMatchScorer.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/controller/ListingControllerTest.java`

- [ ] Add failing compatibility tests for valid old `attr.dream_team`, malformed JSON, wrong shapes, duplicate players, and the interaction between legacy and typed parameters.
- [ ] Implement a bounded JSON adapter that validates old entries and converts them to typed criteria; typed `matchCard` wins when both are supplied.
- [ ] Remove SQL JSON casts and score ordering from `ListingSpecifications`, and remove the in-memory scorer after all callers use the normalized matcher.
- [ ] Re-run focused tests and commit with `refactor(search): retire fragile JSON match scoring`.

## Task 5: Tighten saved Dream Team validation

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/dto/DreamTeamRequest.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/DreamTeamService.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service/DreamTeamServiceTest.java`

- [ ] Add failing tests for supported formations `4-3-3`, `4-2-3-1`, `3-5-2`, exactly 11 positions, duplicate canonical players, invalid priority flags, and a valid partial draft versus save.
- [ ] Implement server-owned formation slots and reject invalid or duplicated persisted teams with stable error codes.
- [ ] Ensure priority is a weight, not a required-card constraint.
- [ ] Re-run focused tests and commit with `feat(dream-team): enforce canonical valid squads`.

## Task 6: Verify the release slice

- [ ] Run matcher parser, repository, controller, service, and Dream Team tests with Java 21.
- [ ] Run the marketplace-service suite and separate any known baseline context-load error from regressions.
- [ ] Run `git diff --check` and inspect generated SQL with EXPLAIN on representative fixture sizes.
