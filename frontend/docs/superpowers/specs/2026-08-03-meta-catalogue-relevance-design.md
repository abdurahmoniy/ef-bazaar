# META Catalogue Relevance Design

## Goal

Make card discovery genuinely relevant by ranking name search by textual similarity, giving admins explicit META lifecycle controls, exposing all effective META cards, and measuring buyer selection interest without collecting unnecessary personal data.

## Card-name search relevance

The catalogue query calculates a relevance class and trigram similarity for non-empty searches. Ordering becomes:

1. case-insensitive exact name;
2. name prefix;
3. substring;
4. trigram similarity descending;
5. effective META priority;
6. max overall rating;
7. name and `efhub_id` deterministic tie-breakers.

The PostgreSQL trigram match threshold remains a server configuration value, not the buyer’s account-match strictness. API responses need not expose the raw similarity score. Tests cover typos, prefixes, aliases represented by canonical identity, and deterministic pagination.

## META lifecycle model

Binary `meta_tier` remains for compatibility, while each card table gains:

- `meta_priority` smallint from 0 to 100, default 0;
- `meta_active_from` timestamp, nullable;
- `meta_active_until` timestamp, nullable;
- `meta_reason` varchar(160), nullable;
- `meta_updated_by` UUID, nullable;
- `meta_updated_at` timestamp.

A card is effective META only when tier is `META` and the current time is inside its optional validity window. META browsing orders by priority descending, then max rating and name. Expired cards remain visible to admins but disappear from the buyer META tab automatically.

Admin bulk tier updates continue working and gain optional shared priority, validity, and reason. Single-card editing supports different values. Validation rejects priority outside 0–100 and an end before the start.

Buyer copy says “Curated META cards” rather than “most searched now.” When a reason exists, the card exposes it in an accessible tooltip or details affordance.

## Complete browsing

The buyer META tab uses paginated catalogue data rather than stopping after 24 cards. It initially loads 24, then offers a visible “Load more” action with loading, retry, and end states. Search results use the same paginated component and preserve selected cards while additional pages load.

Requests are aborted when query or tab changes. Loading state is request-scoped so an older aborted request cannot clear the spinner for the current request.

## Buyer-interest aggregation

Interest measures deliberate use, not every search keystroke. When a buyer applies player criteria, the frontend sends a best-effort `POST /api/v1/card-interest/apply` request containing only the selected card IDs. Redis aggregates card ID, UTC day, and count only. It stores no raw query, account criteria, user ID, IP address, or browser token.

To limit refresh spam, trusted Nginx supplies the request network identity and the service immediately HMAC-pseudonymizes it before building a per-card, per-day dedupe key. Raw network identities never enter Redis, PostgreSQL, application logs, or analytics output; normal Nginx access logging remains governed by operations retention. Dedupe and daily count keys expire after 90 days, each identity is capped at 100 accepted cards per day, and Nginx applies a dedicated per-network write limit. Interest remains a directional curation signal rather than a security-sensitive metric.

The marketplace database keeps `card_interest_daily` with primary key `(day, efhub_id, source)` and an atomic counter. Rows older than 90 days are deleted by a scheduled maintenance job. The admin cards API returns 7-day and 30-day totals alongside catalogue cards.

Interest does not automatically toggle META. Admins use the totals as decision support, preserving editorial control and preventing a feedback loop in which already-promoted cards permanently dominate.

## Admin experience

The players administration page adds:

- filters for effective, scheduled, expired, and normal cards;
- sortable 7-day and 30-day interest columns;
- bulk priority and validity controls;
- visible expiry and reason;
- a preview of the exact buyer ordering.

Bulk updates report requested, changed, skipped, and invalid counts. Permission remains `ROLE_ADMIN` through the existing controller boundary.

## Error handling

- Catalogue failure shows Retry without replacing selected cards.
- Invalid pagination is clamped to current API bounds.
- Interest recording is best-effort after a successful match application; failure is logged and never blocks search navigation.
- Admin lifecycle validation returns structured field errors.
- When optional META columns are absent during rolling deployment, schema bootstrap adds them idempotently and buyer reads fall back to the current binary behavior.

## Testing

- JDBC tests pin exact/prefix/substring/trigram ordering and pagination stability.
- Time-controlled tests cover scheduled, active, and expired META cards.
- Admin API tests cover lifecycle validation, bulk counts, and authorization.
- Component tests cover load more, abort races, retry, selection persistence, and end state.
- Interest tests verify daily upsert, source aggregation, 90-day retention, and absence of personal fields.
- A compatibility test proves binary META data remains readable during rolling deployment.

## Acceptance criteria

- The intended card appears before higher-rated but less textually relevant cards.
- Every effective META card is reachable from the buyer tab.
- META status can expire without manual cleanup.
- Admins can explain and order curated META cards.
- Buyer interest assists curation without identifying buyers or automatically changing editorial state.
