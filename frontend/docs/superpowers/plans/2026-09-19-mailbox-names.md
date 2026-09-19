# Mailbox names implementation plan

**Goal:** Let mailbox owners add, edit, and clear an optional name that appears above the email address on desktop and mobile and persists across devices.

**Architecture:** Store nullable `displayName` (maximum 60 UTF-16 characters) on the mailbox. Expose it in mailbox summaries and update it through an owner-checked PATCH endpoint. Clear names on ownership changes. Keep the existing email address and copy action visible.

**Tech stack:** Spring Boot / PostgreSQL / Flyway, Next.js / React / Tailwind, JUnit / Vitest.

## Backend

- [x] Add failing tests covering normalization, clearing, overlong input, ownership rejection, ownership transfer, and summary serialization.
- [x] Add a new migration for `display_name varchar(60)` without modifying existing migrations.
- [x] Implement `PATCH /api/v1/mailboxes/{id}/name` accepting `{ "displayName": "Main account" }`, returning 204. Require a non-null string; trim whitespace; blank clears the name. Check ownership on the update itself to prevent a concurrent transfer from retaining an old owner's name.
- [x] Add nullable `displayName` to the mailbox summary and clear it whenever ownership changes.
- [x] Run focused backend tests using Java 21 and existing mailbox ownership tests.

## Mail UI

- [x] Add tests for named/unnamed sidebar rendering and the update request/error contract.
- [x] Extend `MailboxSummary` with optional nullable `displayName` for compatibility with the currently deployed backend.
- [x] Add an inline mailbox title/editor component: accessible edit control, 60-character input, Save/Cancel, pending state, retained input on error, and refresh on success. Clearing the name restores the email title.
- [x] Show the name above the address in the sidebar, mobile sidebar, and inbox header. Copy always copies the email address.
- [x] Run mail tests and typecheck. Review the full diff for scope and ownership behavior.

## Delivery

- [x] Report checks and the need to deploy the backend migration/API before the local frontend (currently using production API) can save names. Do not deploy or modify real mailbox names during verification.

## Verification results

- Mail: 68 tests pass, including editor focus, cancellation, failed saves, clearing, repeat-submission prevention, sidebar rendering, and expired API sessions.
- Mail typecheck and production build pass.
- Running local signed-out PATCH returns 401 JSON as expected.
- Frontend and backend changes remain local and uncommitted. Deploy trade-service (including Flyway V24) before attempting saves against the production API; the mail frontend should be deployed after it.

- Backend: 33 focused unit/controller tests and 24 selected integration tests pass; database migration, ownership transfer, concurrent provisioning, and rename persistence verified.
- Independent UI and backend reviews completed; identified issues fixed and covered by regression tests.
