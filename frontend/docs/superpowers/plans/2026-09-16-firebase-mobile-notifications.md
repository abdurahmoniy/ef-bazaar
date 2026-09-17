# Firebase Mobile Notifications Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement independent backend work and review the integrated result.

**Goal:** Make notifications accessible on mobile and deliver existing notifications through Firebase Cloud Messaging.

**Architecture:** Keep marketplace notifications as the source of truth. Register browser FCM tokens with authenticated marketplace endpoints; dispatch push only after notification transactions commit. A client provider reconciles subscriptions with the session and refreshes notification UI on foreground messages.

**Tech Stack:** Next.js, React, Firebase Web SDK, Spring Boot, PostgreSQL, Firebase Admin SDK, Vitest, JUnit.

## Tasks

- [x] Backend: add authenticated PUT/DELETE `/api/v1/notifications/push-tokens` with `{token}` and GET `/api/v1/notifications/push-status` with `{enabled}`. Persist unique token ownership, clean invalid tokens, and send after commit for creation and coalesced chat updates. Payload uses `notificationId`, `title`, `body`, and same-origin `url`. Add focused ownership, failure-isolation, and transaction tests before implementation.
- [x] Client: add Firebase configuration and messaging service worker; authenticated token registration through the existing marketplace proxy; serialize subscription changes; permission only from explicit user action; foreground update event; lifecycle cleanup on logout/account changes. Test denial, missing configuration, API failure, and logout.
- [x] UI: show a 44px mobile bell in a sticky marketplace header, route mobile taps to `/notifications`, preserve desktop dropdown and existing bottom tabs. Add Uzbek push settings with available/enabled/blocked/unsupported/error states and iPhone Home Screen guidance.
- [x] Verification: run focused tests, frontend typecheck and lint, backend unit tests, then review source and mobile rendering. Record any environment limitations explicitly.
- [x] Setup: document Firebase web config, public VAPID key, backend service credentials and live-device verification; update environment examples and deployment build configuration where needed.

## Shared API contract

The browser sends only `{ "token": "FCM registration token" }`. Authentication determines ownership. DELETE is idempotent and only removes the authenticated owner's association. GET push-status allows the opt-in UI to avoid announcing success when delivery is not configured. FCM messages carry a stable notification ID and a validated same-origin URL. Public Firebase values are configuration, while Admin credentials remain server-only.

## Scope and working tree

Preserve unrelated admin chat changes already present. Implement in the current checkout so the user's in-progress work stays intact. Do not commit unrelated files or deploy.

## Verification results

- Frontend production compilation, type checking, and generation pass with `npm run build -- --webpack`. Turbopack was blocked by a local child-process port restriction.
- New notification tests cover permissions, registration failure, retained subscriptions during outages, cleanup failure, shared-tab serialization, recipient filtering, safe links, and mobile navigation. Full frontend suite passes.
- All 524 marketplace backend unit tests pass, including ownership/auth checks, rollback behavior, coalesced events, and delivery failure isolation.
- The actual migration and ownership SQL passed against a new isolated PostgreSQL instance, which was stopped afterward. Testcontainers-based integration tests could not start because Docker was not running; they remain available for CI.
- Actual components were rendered for browser inspection at 360px, 390px, and desktop width; the sticky bell and notification settings fit correctly. The temporary rendering fixture and preview server were removed/stopped.
- Targeted lint has no errors; the existing analytics image in the root layout produces its pre-existing image optimization warning.
- A separate final review found no remaining blockers after lifecycle and cross-tab fixes.
- Firebase project credentials were not provided. No live push or deployment has been performed. See `docs/firebase-notifications.md` for activation and device verification.
