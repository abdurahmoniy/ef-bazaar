# Contextual pop-ups design

Approved intent: add the illustrated status/action pop-ups, meaningful contextual triggers, conservative interruption rules, and an admin sender. Implement inside existing marketplace-service and frontend; no new deployable worker, Kafka topics, or transactional payment behavior.

## Delivery contract
- Authenticated users only for remotely sent campaigns. Backend derives identity from the existing trusted auth principal.
- Campaign fields: id, title (1–100), message (1–600), tone INFO/SUCCESS/WARNING, audience ALL/SELLERS/SELECTED, recipientIds (up to 100 UUIDs; required only for SELECTED), trigger BROWSE/LISTING_PUBLISHED/EMPTY_SEARCH/TRADE_COMPLETED, actionLabel and actionPath optional as a pair, startsAt, endsAt (required, max 30 days after start), priority (0–10), status DRAFT/ACTIVE/PAUSED, createdAt, createdBy. Render plain text only. CTA is an allowlisted internal destination.
- GET /api/v1/admin/popups returns newest-first bounded list of campaigns with shownCount/clickedCount/dismissedCount. POST creates DRAFT. PATCH /{id}/status accepts ACTIVE/PAUSED. Admin role enforced on all management calls.
- GET /api/v1/popups/next?trigger=... returns highest-priority currently eligible campaign or 204. POST /popups/{id}/claim with {trigger, sessionId: UUID} rechecks eligibility and atomically reserves delivery, returns {deliveryId, campaign} or 204. POST /popups/deliveries/{id}/events with {event: SHOWN|DISMISSED|CLICKED} is user-scoped/idempotent.
- At most one campaign per user/session, two per rolling 24 hours, six hours apart, and only one delivery of each campaign per user. Serialize claims across tabs/devices at database level. Paused, expired, scheduled, dismissed/claimed, or wrong-audience campaigns cannot be claimed.
- Persist reservations separately from impressions: SHOWN is acknowledged by the browser only after rendering. Failed/abandoned delivery is conservatively counted against limits but not shownCount.

## Browser coordinator
- One host shared across routes, only signed-in marketplace browsing surfaces. Checks for new campaigns no more often than once a minute; hidden tabs do not fetch. Initial dwell 15 seconds; three seconds without keyboard/pointer/scroll activity.
- Defer for inputs/contenteditable, hidden documents, another dialog, push invitation/support overlay, and sensitive routes (auth, chat, wallet/trade, forms, support, admin). Recheck before claim and render. Context change aborts stale work and discards stale candidates; bounded trigger lifetime prevents later unrelated prompts.
- Trigger BROWSE on eligible marketplace/profile/favorites/help navigation. LISTING_PUBLISHED from the owner-only completion notice. EMPTY_SEARCH from rendered empty results. TRADE_COMPLETED queued on a new successful trade, displayed only after leaving the trade flow to an eligible route.
- One accessible Radix modal/bottom-sheet presentation with icon, title, concise body, optional CTA, explicit dismiss, focus trap/restore, keyboard handling, reduced motion and safe-area support. Existing action feedback stays local; optional campaigns never replace payment confirmations or create fictitious success.
- Coordinate the existing push-permission invitation so it does not stack with campaigns and is deferred on sensitive routes.

## Admin UI
New /admin/popups navigation. Composer with clear audience, trigger, schedule, expiry, tone, priority, safe CTA, user IDs for selected recipients, preview and Save draft. Preview is isolated and never records delivery. Campaign list includes status, schedule, counts, publish/pause and a use-as-new action. Explain fixed frequency rules; publish only on explicit admin action.

## Verification
TDD first for eligibility, concurrency/idempotency, cross-user and admin permissions, safe links, hidden/busy/sensitive-page suppression, dismissal, CTA, and campaign preview/publish interactions. Full Java 21 marketplace clean verify (install outbox dependency first) and Node 22 npm ci, typecheck, lint, full tests, production build. Verify visually in local browser with seeded local responses, no production sends. Inspect diff and whitespace; report local-only changes and precise limitations.

Implementation refinements: the shared host is mounted by MarketplaceShell with authenticated identity; session/history budgets and throttling survive route remounts. Eligible profile views are accounts/favorites only. Context includes search parameters, normalizing only the consumed listing completion result flag. Page-specific triggers are withdrawn when their result component disappears.
