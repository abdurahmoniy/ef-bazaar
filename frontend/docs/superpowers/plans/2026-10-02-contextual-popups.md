# Contextual Pop-ups Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for backend implementation and separate review; root integrates frontend. Follow test-first project rules.

**Goal:** Deliver contextual, rate-limited in-app campaigns and an admin composer.
**Architecture:** Marketplace PostgreSQL campaign/delivery module + authenticated APIs; a route-aware browser host claims only at safe moments; Radix UI presents messages.
**Tech Stack:** Java 21/Spring Boot/PostgreSQL/Flyway; Next.js/React/TypeScript/Radix; JUnit/Testcontainers/Vitest.

## 1. Backend delivery module
- [x] Add failing tests under backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/popup for validation, targeting, time windows, atomic claims, caps, deduplication, ownership, admin permissions and statistics. Run focused Maven tests and confirm expected red.
- [x] Implement popup package (DTOs, service, persistence, controllers) with the exact contract in the design. Add next versioned Flyway migration; never edit applied migrations. Seed no active campaigns.
- [x] Verify focused tests, then install outbox and run full Java 21 mvn -B -ntp clean verify. Check Surefire and Failsafe totals. Update marketplace README API/table documentation.

## 2. Browser eligibility and presentation
- [x] Add failing src/lib/popups/policy.test.ts cases covering safe paths, cooldown/dwell/activity, visible forms/dialogs, safe actions and stale context.
- [x] Add failing src/components/popups/popup-host.test.ts (including dialog accessibility) tests for dismiss, CTA, duplicate/hidden delivery and errors.
- [x] Implement src/lib/popups/types.ts, client.ts, policy.ts; implement components/popups/popup-dialog.tsx and popup-host.tsx. Integrate authenticated shell identity and trigger sources.
- [x] Coordinate existing push prompt with shared blocking state; keep ordinary transactional feedback usable. Verify focused tests.

## 3. Admin sender
- [x] Add failing admin-popups.test.ts for preview without sends, draft save, selected audience validation, explicit publish, failed requests and stale list responses; pause and plain-text preview also verified in the browser.
- [x] Implement /admin/popups page + admin-popups.tsx using API client and reusable preview dialog. Add navigation item. Verify focused tests and update frontend README.

## 4. Integration and review
- [x] Node 22 npm ci --no-audit --no-fund; npm run typecheck; npm run lint; npm test; npm run build on final frontend.
- [x] Local browser inspect admin preview, recipient dialog, small-screen behavior and dismissal with local fixtures; do not publish production campaigns.
- [x] Independent spec review, then quality review; resolve findings and rerun affected checks. git diff --check and inspect diff for generated files/secrets.
