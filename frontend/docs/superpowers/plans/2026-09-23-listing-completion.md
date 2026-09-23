# Listing completion implementation plan

**Goal:** Implement approved completion, owner management and accessibility changes while preserving private account names and card layout.
**Architecture:** Existing routes carry completion query parameters. Owner-gated notices and a shared active-owner action component provide feedback. ProfileAccounts reveals the returned resource through its existing collection view.
**Tech stack:** Next.js, React, Tailwind, Radix Dialog, Vitest.

- [x] Add failing behavioral tests for saved-account visibility, preserved private names, owner/buyer presentation, preview safety, completion redirects and sold confirmation.
- [x] Add completion notice and route markers to listing/account create and publish flows; include advertising destination.
- [x] Reveal/focus the saved account and add its confirmation/next action without editing AccountCard.
- [x] Reorder owner detail, subordinate advertising and add safe buyer preview; scrub completion/preview parameters from back links.
- [x] Share edit/share/management controls between mobile and desktop, using Radix confirmation and accessible error feedback.
- [x] Run focused Vitest coverage, typecheck and scoped lint; inspect mobile/desktop browser layouts and review diff.

Validation: 354 tests across 49 focused suites passed; TypeScript passed; scoped ESLint had zero errors (three existing image warnings in ListingForm). Browser inspection covered 320px, 375px, 820px and 1440px layouts, confirmation query cleanup, saved-account focus, buyer preview, sharing, and opening/cancelling sold confirmation. Independent code review findings resolved. Existing backend/chat work was left untouched.
