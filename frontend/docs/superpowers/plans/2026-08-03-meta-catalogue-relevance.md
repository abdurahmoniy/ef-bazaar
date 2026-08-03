# META Catalogue Relevance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the META catalogue relevant, paginated, auditable, and informed by privacy-preserving buyer intent rather than a permanent manual flag alone.

**Architecture:** Card tables gain lifecycle metadata controlled by admin APIs. Search ranking combines textual relevance with active META priority and rating. A small Redis-backed interest service accepts deduplicated anonymous apply events and exposes aggregate 7/30-day signals to admins without making META assignment automatic.

**Tech Stack:** Java 21, Spring Boot/JdbcTemplate, PostgreSQL/pg_trgm, Redis, Next.js, TypeScript, JUnit 5, Vitest.

---

## Task 1: Add auditable META lifecycle columns

**Files:**
- Create: `infra/postgres/efbazaar/V5__meta_lifecycle.sql`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardColumns.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSchemaBootstrap.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardSchemaBootstrapTest.java`

- [ ] Add failing schema tests for `meta_priority`, `meta_active_from`, `meta_active_until`, `meta_reason`, `meta_updated_by`, and `meta_updated_at` on all card tables.
- [ ] Run the focused test and confirm the columns are absent.
- [ ] Add an immutable migration and idempotent bootstrap alterations with defaults that preserve current `meta_tier` behavior.
- [ ] Add active-window indexes suitable for tier browsing.
- [ ] Re-run the focused test and commit with `feat(meta): add lifecycle metadata`.

## Task 2: Rank card search by textual relevance and active META state

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSearchService.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardSearchResult.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardSearchServiceTest.java`

- [ ] Add failing query-order tests for exact normalized name, prefix, substring, trigram similarity, active META priority, max rating, name, and EFHub ID tie-breaks.
- [ ] Add boundary tests for future `active_from`, expired `active_until`, and inactive META rows.
- [ ] Compute a bound-query rank expression once per UNION branch and order by text rank first when searching; use META priority/OVR order for catalogue browse without a query.
- [ ] Return lifecycle fields needed by admin while exposing only active META as `META` to public callers.
- [ ] Re-run focused tests and commit with `feat(cards): improve catalogue relevance`.

## Task 3: Manage lifecycle through the admin API and UI

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardMetaTierRequest.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardMetaTierResponse.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/AdminCardController.java`
- Modify: `frontend/src/app/admin/players/page.tsx`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/controller/AdminCardControllerTest.java`
- Test: `frontend/src/app/admin/players/page.test.tsx`

- [ ] Add failing tests for priority/window/reason validation, actor audit, activate, schedule, expire, and clear lifecycle operations.
- [ ] Implement explicit request fields and update every selected card atomically with the authenticated admin ID and timestamp.
- [ ] Add admin controls for priority, start/end, reason, current state, and a one-click expire action.
- [ ] Re-run focused tests and commit with `feat(admin): manage META lifecycle`.

## Task 4: Paginate META cards safely in the buyer dialog

**Files:**
- Modify: `frontend/src/components/marketplace/player-filter-dialog.tsx`
- Modify: `frontend/src/lib/marketplace-client-api.ts`
- Test: `frontend/src/components/marketplace/player-filter-dialog.test.tsx`

- [ ] Add failing tests for initial 24 cards, Load more, total/has-more, deduplication, aborting stale requests, retry, and preserving selected cards across pages.
- [ ] Extend the card hook to store page/total/error, append unique EFHub IDs, and cancel superseded search/tab requests.
- [ ] Show an explicit Load more control with progress text rather than infinite scroll.
- [ ] Re-run the focused test and commit with `feat(meta): paginate buyer catalogue`.

## Task 5: Collect privacy-preserving apply interest

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardInterestController.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardInterestService.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/CardInterestRequest.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/AdminCardController.java`
- Modify: `backend/marketplace-service/src/main/resources/application.yml`
- Modify: `frontend/src/components/marketplace/player-filter-dialog.tsx`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards/CardInterestServiceTest.java`
- Test: `frontend/src/components/marketplace/player-filter-dialog.test.tsx`

- [ ] Add failing service tests for one event per trusted network identity/card/day, authenticated-user HMAC keys, duplicate requests, 90-day expiry, invalid cards, and 7/30-day totals.
- [ ] Add a failing UI test proving interest is sent only after Apply and never blocks marketplace navigation.
- [ ] Implement `POST /api/v1/card-interest/apply` with a bounded card list, server-side HMAC identity key, Redis `SET NX` dedupe keys, daily sorted/count keys, and 90-day TTL.
- [ ] Do not store raw IP addresses, raw user IDs, or the whole query; emit only aggregate counts from admin endpoints.
- [ ] Send the event best-effort after applying a non-empty selection.
- [ ] Re-run focused tests and commit with `feat(meta): collect deduplicated card interest`.

## Task 6: Surface interest to admins without automatic promotion

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/AdminCardController.java`
- Modify: `frontend/src/app/admin/players/page.tsx`
- Test: `frontend/src/app/admin/players/page.test.tsx`

- [ ] Add failing tests for 7-day and 30-day count columns, sortable interest, missing-data fallback, and lifecycle actions remaining manual.
- [ ] Join aggregate interest by EFHub ID in the admin response and add concise trend columns/tooltips.
- [ ] Keep recommendations informational: never mutate `meta_tier` from interest counts.
- [ ] Re-run focused tests and commit with `feat(admin): show META demand signals`.

## Task 7: Verify the release slice

- [ ] Run all touched card-service/controller tests with Java 21 and all touched frontend tests.
- [ ] Run the marketplace-service suite, `npm test`, and `npm run typecheck`, separating known baseline failures from regressions.
- [ ] Run `git diff --check`; inspect query plans, Redis cardinality bounds, TTLs, audit fields, and anonymous-data handling.
