# Reliable Account Matcher Design

## Goal

Replace raw, weakly validated JSONB matching with a typed public contract and a single database relevance query that filters, ranks, and explains account matches consistently.

## Public match contract

Marketplace browsing gains top-level repeatable parameters rather than synthetic `attr.*` keys:

- `matchCard=<efhubId>:<playerId>:<importance>` repeated once per wanted player.
- `matchStrictness=<1..10>` with default `4`.

`importance` is `N` for normal or `P` for priority. The controller converts these strings into `MatchCriterion` values before repository access. Criteria are limited to 1–11 unique canonical players. The server verifies that each `efhubId` belongs to its claimed `playerId` and maps `N` to weight 1 and `P` to weight 3.

During rollout, the backend accepts current `attr.dream_team` JSON only through a compatibility parser. The parser applies the same limits and identity resolution, then calls the typed matcher. Malformed legacy input returns HTTP 400. The raw value is never passed directly into a SQL cast.

## Scoring semantics

For each unique wanted player:

- exact `efhubId` in the listing: `1.0` credit;
- another card for the same canonical `playerId`: `0.75` credit;
- no card for that player: `0` credit.

The weighted score is `sum(weight × credit) / sum(weight)`. Priority remains an influence, not a hard requirement, and all user-facing copy uses “priority.”

Strictness maps as follows:

- `1`: any positive overlap;
- `2` through `10`: minimum score of 20% through 100% respectively.

This special first level lets one exact card in an eleven-player squad produce useful discovery. The UI presents strictness as a search control, never as “N out of 10 players.”

## Query architecture

A custom listing match repository executes a native PostgreSQL query against `listing_cards`. Validated criteria are serialized by the service into bounded JSON and expanded with `jsonb_to_recordset` inside a CTE. The query calculates one best result per wanted canonical player and aggregates:

- numeric score and rounded `matchPercent`;
- `exactCount`;
- `alternateCount`;
- `missingCount`.

The same aggregate supplies `WHERE`, `ORDER BY`, and response projection, eliminating the Java twin scorer. Ordering is explicit and stable:

1. listing status (`ACTIVE` before `SOLD`);
2. match score descending;
3. the buyer-selected supported listing sort;
4. listing ID as the final deterministic tie-breaker.

The count query applies the same status, marketplace filters, and strictness predicate but omits result ordering. Marketplace sort fields are selected from an allowlist; no request string becomes SQL.

Ordinary browsing without match criteria continues through the current JPA specification path. Player matching uses the custom repository path, so pageable sorting cannot replace relevance ordering.

## Response contract

`ListingResponse` gains nullable `matchDetails`:

```text
matchDetails = {
  percent,
  exactCount,
  alternateCount,
  missingCount,
  selectedCount,
  strictness
}
```

The existing `matchPercent` field remains populated during one frontend compatibility release and mirrors `matchDetails.percent`. Listing detail accepts the same match parameters and returns the same explanation for the selected listing, allowing result links to preserve context.

## Saved Dream Teams

Dream Team requests become typed instead of `List<Map<String,Object>>`. Each filled slot contains index, position, importance, and a card snapshot with `efhubId` and `playerId`. Backend validation enforces:

- one of the currently rendered formations: `4-3-3`, `4-2-3-1`, or `3-5-2`;
- slot index 0–10;
- unique slot indices;
- unique canonical players;
- importance `NORMAL` or `PRIORITY`;
- card and player identity consistency.

The existing ten-teams-per-user limit remains.

## Error handling

- Invalid syntax, unknown identities, duplicates, and out-of-range strictness return structured HTTP 400 errors.
- Empty criteria mean ordinary browsing; they never activate the matcher.
- A valid match request with no overlap returns an empty page at strictness 2–10 and positive-overlap results at strictness 1.
- Unsupported sort input falls back to newest rather than entering SQL.
- Database match failures are logged with a request correlation ID; raw match criteria are not logged.

## Testing

- Pure unit tests cover parsing, uniqueness, identity verification, weight mapping, and strictness mapping.
- PostgreSQL Testcontainers tests exercise exact, alternate, missing, priority, duplicate, threshold, ACTIVE/SOLD, pagination, and tie-break ordering.
- Contract tests assert that the projected percent equals the value used for filtering and ordering.
- Controller tests prove malformed legacy JSON returns 400 instead of a database error.
- Regression tests prove ordinary marketplace filtering and sorting remain unchanged when no match criteria exist.
- Performance tests use representative listing/card counts and capture `EXPLAIN ANALYZE` to ensure the `listing_cards` indexes are used.

## Acceptance criteria

- Relevance ordering cannot be replaced by pageable sort.
- One owned card contributes to at most one unique wanted player.
- Match percentage and counts originate from one database calculation.
- All invalid public inputs are rejected before SQL expansion.
- Shared and listing-detail URLs reproduce the same match explanation.

