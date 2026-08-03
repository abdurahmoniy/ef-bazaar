# META and Dream Team Search Improvements

## Goal

Make player-card account search correct, explainable, resilient, and useful from seller data entry through buyer discovery. The finished experience lets a buyer select valuable cards or a saved Dream Team, choose an understandable strictness level, and see active listings ranked by a trustworthy match explanation.

## Scope decomposition

This initiative spans four independently deployable workstreams. Each workstream has its own design because the database, matching API, buyer interface, and catalogue operations have different failure modes and test strategies.

1. [Player card inventory and identity](./2026-08-03-player-card-inventory-identity-design.md)
2. [Reliable account matcher](./2026-08-03-reliable-account-matcher-design.md)
3. [Buyer search experience](./2026-08-03-player-match-experience-design.md)
4. [META catalogue relevance](./2026-08-03-meta-catalogue-relevance-design.md)

The implementation order is deliberate. Inventory and canonical identity make the matcher reliable; the matcher contract gives the buyer UI stable data; catalogue relevance then improves discovery without being allowed to alter matching correctness.

## Shared product decisions

- “Fuzzy” has two explicit meanings. Card-name search tolerates typing differences. Account matching gives full credit to the exact card and partial credit to another card belonging to the same canonical player.
- The UI exposes strictness from 1 through 10. It never claims that the value is a literal percentage of selected players.
- A starred Dream Team slot means **priority**, not “required.” Priority slots carry three times the score weight. This avoids promising a hard requirement that the current interaction cannot explain cleanly.
- Duplicate canonical players are rejected even when the user chooses different card versions.
- Search operates on seller-declared valuable cards, not an inferred complete account roster. Seller and buyer copy states this plainly.
- Active listings rank before sold listings. Within the same status, match relevance is primary and the buyer’s selected marketplace sort is the tie-breaker.
- Every returned match explains exact-card, alternate-card, and missing-player counts. A percentage alone is insufficient.
- Existing public listing responses and JSONB card snapshots remain readable during rollout. Compatibility is removed only after the new writer, matcher, and frontend are deployed.

## Release sequence

### Release 1: trustworthy data

Add canonical player identities, a normalized `listing_cards` projection, transactional synchronization from listing writes, seller completeness feedback, and compatibility backfill.

### Release 2: trustworthy matching

Add typed and validated match criteria, strictness 1–10, a custom relevance query, one score calculation per result, and match breakdowns. Keep a temporary adapter for current `attr.dream_team` links.

### Release 3: trustworthy interaction

Replace the hand-built dialog with accessible primitives, preserve search state across every marketplace navigation, expose active criteria and breakdowns, and add actionable no-result recovery.

### Release 4: trustworthy discovery

Rank name search by textual relevance, expand the META model with priority and validity windows, add load-more behavior, and aggregate filter-application interest for admin decision support.

## Global acceptance criteria

- The same canonical player cannot occupy multiple wanted slots.
- A listing containing one card cannot satisfy duplicated wanted criteria.
- Invalid or oversized public criteria return a structured HTTP 400 response and never reach a PostgreSQL JSON cast.
- Results are ordered by active status, descending match score, then the chosen marketplace sort.
- Match percentage and breakdown come from the same database calculation.
- Grid/list switches, quick chips, pagination, sorting, sidebar filters, and listing-detail navigation preserve the player match.
- The default grid view displays match relevance.
- Keyboard and screen-reader users can open, operate, and close the player picker without focus escaping behind it.
- Seller-declared card coverage is visible and honest; listings with no declared cards are described as unavailable for player matching rather than as zero-quality accounts.
- SQL, repository, service, serialization, URL-state, component, and accessibility behavior have automated regression coverage.

## Out of scope

- OCR or automatic roster extraction from account screenshots.
- A machine-learned recommendation engine.
- Automatically declaring cards META without admin review.
- Requiring every seller to enter the account’s complete roster.

These exclusions keep this initiative focused on a reliable, explainable marketplace filter rather than an account-ingestion platform.
