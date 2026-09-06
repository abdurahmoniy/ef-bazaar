# Invitations and partnership implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded tasks with independent review. The user has approved implementation; no additional design approval is pending.

**Goal:** Make invitations discoverable and easy to send, and make channel partnership understandable and usable from first visit through setup.

**Architecture:** Reuse MarketplaceShell, existing authentication, referral and partner APIs. Share small growth entry/link components and an optional non-identifying analytics helper. Keep referral and partner domains independently owned so concurrent work does not overlap.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, Lucide, Vitest.

## Task 1: Referral reliability and sharing

Files: `src/lib/referrals.ts`, `src/lib/referral-capture.ts`, `src/components/referral/*`, `src/app/invite/page.tsx`, focused tests.

- [x] Write failing behavioral tests for temporary HTTP failures retaining attribution, definitive claim results, sharing URL encoding and copy/error recovery.
- [x] Run `npx vitest run src/lib/referral-capture.test.ts` plus newly added tests; verify failures correspond to missing behavior.
- [x] Change unsuccessful HTTP handling to throw for temporary/auth failures. Keep the existing boolean business-result contract. Retry from a mounted capture component with cleanup and avoid duplicate successful notices.
- [x] Build the invitation screen around live reward -> Telegram sharing -> copy -> three steps -> results -> wallet. Do not hardcode money. Use standard shell/back navigation and preserve login return.
- [x] Verify focused tests and report exact files/contract changes for integration.

## Task 2: Public partnership and application

Files: `src/app/partnership/page.tsx`, `src/components/partners/*`, partner flow tests; no global navigation files.

- [x] Reproduce anonymous fetch failure and out-of-order bot action using focused tests.
- [x] Render public benefit/eligibility/preview copy without calling authenticated client APIs. Sign-in links preserve `/partnership`.
- [x] Render authenticated terms and stateful application with only valid next actions. Correct rejected/canceled state, retry and focus refresh.
- [x] Show actual earnings mode separately from posting income and disclose existing payment-before-review/cancellation semantics. Do not invent refund or review policies.
- [x] Add actionable price-setup emphasis and navigation to the existing partner panel, retaining explicit free pricing.
- [x] Run focused tests and report any backend-only limitations.

## Task 3: Discovery surfaces

Files: `src/app/marketplace/page.tsx`, new `src/components/growth/*`, `src/components/navigation/user-menu.tsx`, `src/components/marketplace/marketplace-shell.tsx`, `src/components/profile/profile-account.tsx`, `src/components/payment/wallet-view.tsx`, `src/app/page.tsx`, `src/components/site-footer.tsx`.

- [x] Create a reusable `InvitationCard` with source placement and optional dismissal, a secondary channel-owner entry, and a tracked link. Use existing semantic colors and 44px+ touch controls.
- [x] Place the persistent invitation card at the top of Profile, channel offer separately, and labeled desktop invitation shortcut. Retain five mobile tabs.
- [x] Add one compact dismissible marketplace card and small wallet/home/footer entry points. Suppress repeat promotions after dismissal without removing permanent navigation.
- [x] Check rendered small-phone hierarchy and adjust spacing based on screenshots; add regression coverage for critical access routes.

## Task 4: Context and measurement

Files: `src/lib/growth-analytics.ts`, growth components, existing completed-trade component and listing-share surface.

- [x] Add safe analytics calls only when the existing analytics function exists. Parameters are placement/method/state, not names, identifiers, referral codes or balances.
- [x] Add a completed-trade prompt with dismissal; do not treat marking a listing sold as a qualifying completed trade.
- [x] Add contextual listing sharing preserving a clean listing destination and referral attribution when available; do not rewrite partner tracking policy.
- [x] Add a non-blocking recipient acknowledgement and test auth/landing transitions.

## Task 5: Verification and handoff

- [x] Run the focused tests for each changed domain, then `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [x] Review guest and authenticated screens with controlled local fixtures at 360/390px, 768px and 1440px: discovery/dismissal, zero reward, error/retry, account linking, active partner pricing, listing sharing and keyboard dismissal. Cover denied clipboard, completed trades and pending/rejected states with focused component tests.
- [x] Request independent spec review followed by code-quality review. Resolve actionable findings and rerun affected checks.
- [x] Report the implemented frontend behavior, evidence, and remaining operating/backend limitations. Do not claim a live deployment, measured uplift, or completed user study.

## Verification record

- Complete suite: 895 tests in 113 files passed.
- Production build and standalone typecheck passed. The build retains existing edge-runtime/sitemap static-generation notices.
- Global lint: zero errors and 28 existing warnings. Changed UI files were also linted after the final corrections.
- Browser QA used disposable local API fixtures, not production accounts or payments. Screens checked in light and dark themes, including mobile Profile discovery, invitation success/copy/retry/zero reward, public partner offer, Google-only linking prerequisite, explicit free pricing, and contextual listing sharing. Tablet search retains its width; desktop has a labeled invitation shortcut.
- Independent specification and quality reviews completed. Findings resolved: same-page referral arrival, session-probe retry, repeated trade prompt, missing Telegram linking prerequisite, technical recovery copy, inline pricing feedback, and tablet/layout placement.
- Measurement definitions and backend/operating limits: `../specs/2026-09-06-growth-measurement-handoff.md`.
