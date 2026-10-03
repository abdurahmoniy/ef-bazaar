# Marketplace Filter Panel Implementation Plan

**Goal:** Implement the approved filter panel design.
**Architecture:** Shared controlled fields and debounced preview hook; existing player selector reached through its hash. Synthetic exchange acceptance value interpreted by the existing backend specification.
**Tech Stack:** React, Next.js, Vitest, Spring Data JPA.

- [x] Add rendered regression coverage to marketplace-filter-sheet.test.ts for removal of search/sort, platform fields, clean preset, price formatting, secondary controls, player handoff, and desktop previews. Add draft URL tests and matching-preview tests. Run focused Vitest and confirm expected failures.
- [x] Update listing-filter-fields.tsx, marketplace-filter-draft.ts and both controllers. Extract preview lifecycle into use-marketplace-filter-preview.ts. Preserve URL search, sort and player state; clear mobile constraints when leaving Mobile. Run focused Vitest.
- [x] Add exchange-acceptance integration regression to RankedListingsIT.java; confirm failure before updating ListingSpecifications.java. Add the synthetic ACCEPTS_EXCHANGE choice and applied-chip label, retaining exact choices for compatibility. Verify Java 21 clean verify with Docker.
- [x] Update frontend and marketplace README descriptions; review diff. Run npm ci on Node 22, typecheck, lint, full tests, production build, and git diff --check. Report exact evidence and blockers.

Evidence: regression tests were observed failing before implementation. Marketplace Java 21 clean verify passed 665 Surefire and 125 Failsafe tests with no failures/errors/skips, using local Docker API compatibility -Dapi.version=1.44. Final frontend checks are recorded in the task completion message. Browser verification covers desktop and 390px mobile sheet, platform field visibility, and repeated player-selector handoff.

## Uzum refinement execution
1. Add a mobile overview regression covering selection summaries, preserved collapsed edits and visible errors; confirm failure before production changes.
2. Add native disclosure groups to shared fields, full-height mobile layout, and unframed desktop sections. Retain debouncing, request cancellation, validation and one-shot navigation.
3. Run the focused lifecycle suite, full frontend typecheck/lint/tests/build on Node 22, inspect desktop/mobile in browser, and run git diff --check.
