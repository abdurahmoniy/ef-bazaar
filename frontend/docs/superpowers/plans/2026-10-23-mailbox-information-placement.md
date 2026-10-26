# Mailbox Information Placement Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review these scoped tasks.

**Goal:** Remove general mailbox information from account lists, retain one compact profile summary, and place detailed mailbox management in webmail.

**Architecture:** Frontend profile keeps an authoritative total allocation summary and a webmail link. Webmail gains an authenticated `/settings/mailboxes` page using existing trade APIs for quotas, owned boxes, access swaps, and physical resource release; mailbox warnings stay with their context. Existing profile mailbox deep links redirect to webmail management. Account email linking remains its existing main-site flow.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Vitest; existing same-origin trade proxies and server authentication.

## Frontend summary and routing
- [x] Add failing regression tests proving accounts/trades/favorites/cards have no general mailbox banners or resource panel and profile has only a summary.
- [x] Add summary tests covering authoritative total usage, zero, unknown/error, explicit unlimited and STAFF; link to configured webmail.
- [x] Remove profile mailbox banners/resources and replace ProfileAccount's detailed panel with the summary card.
- [x] Redirect old `/profile?mailbox=...` links to webmail `/settings/mailboxes?mailbox=...`; update management links in upgrade CTA and custom mailbox list, retaining related trade error coverage.

## Webmail management
- [x] Add failing tests for management navigation, local access-selection links and server authentication.
- [x] Add an authenticated management page and summary/unused-mailbox information from existing APIs. Unknown account linkage must never be presented as unused.
- [x] Move resource release UI into webmail, preserving fresh proof, pending/failed/confirmed state, active-trade/legal hold and provisioning guards; retain admin's existing frontend resource panel.
- [x] Add inline access selection with explicit confirmation, guarded candidates, backend errors and pending state using existing unlock endpoint.
- [x] Link management from desktop/mobile mail navigation. Replace mailbox access and legacy lock links with local management URLs. Ordinary available boxes render neutral information, not warnings.

## Verification
- [x] Run affected frontend/mail regression tests red before production changes, then green.
- [x] Node 22: frontend `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; mail locked dependencies via `npm ci --no-audit --no-fund`, `npm run test`, `npm run build` (and typecheck).
- [x] Browser QA with isolated synthetic fixture data: clean account list, compact profile summary, management page at 320px and desktop, local navigation, normal/full/unknown quota, unavailable resource information and access selection.
- [x] Review full intended diff and `git diff --check`; preserve unrelated pricing edits. Leave changes local until deployment is requested for this change.

## Validation evidence

- Frontend, Node 22: typecheck, lint (0 errors; 27 existing warnings), 307 test files / 2,597 tests, production build passed.
- Webmail, Node 22: locked dependency install, 21 test files / 143 tests, production build and subsequent typecheck passed.
- Playwright: 320px, 375px and 1440px; no horizontal overflow, one compact profile summary, clean account list, management navigation, guarded access swap with immediate refresh, normal/full/unknown states and unavailable resource measurement passed. Mutations were limited to the local fixture API.
- Specification and quality reviews passed, including regression coverage for legacy locked-mailbox unlinking.
- Reviewed mail files match the verified source; git diff --check passed. Changes remain local.
