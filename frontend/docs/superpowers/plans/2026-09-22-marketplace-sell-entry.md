# Marketplace selling entry implementation plan

**Goal:** Implement the approved account-first mockup for `/marketplace/new`.

**Architecture:** List saved accounts directly, show sale terms inline after selection, and retain the current new-account wizard. Reuse the existing publishing component with a page presentation so the profile dialog and listing entry share validation and submission.

**Tech stack:** Next.js, React, Tailwind, Vitest.

## Approved design

- Visible mobile/desktop page headings, compact saved-account cards with a thumbnail and platform/team summary, clear `Narx belgilash` action, and secondary `Yangi akkount qo‘shish` action.
- Count only active accounts that are not on the market. Already-listed accounts link to the existing listing; archived accounts are excluded.
- Pricing remains on the page, with account context, minimum-price guidance, sale terms, submit errors, and back navigation. Keep the existing publish endpoint and payload.
- Users with no active accounts enter the existing photos/details/pricing/review form immediately. First-step back returns to account selection when available.
- Keep brand tokens, authentication/Telegram requirements, draft behavior, and unrelated working-tree changes.

## Tasks

- [x] Update source-step behavior tests: account action exists immediately, only eligible count is shown, listed accounts link out, archived accounts are excluded, empty state starts the form.
- [x] Implement account summary and direct-selection layout in `listing-source-step.tsx`.
- [x] Add page-presentation coverage to `publish-account-dialog.test.ts`; preserve existing dialog payload/error tests.
- [x] Add `layout="page"` presentation to the shared publishing component with account context, existing validation, accessible errors, and responsive actions.
- [x] Update `new-listing-entry.tsx` to switch between source, inline pricing, and the existing form. Add entry flow tests with an isolated wizard stand-in.
- [x] Add a first-step return callback to `listing-form.tsx` and retain normal within-wizard back behavior.
- [x] Move the route heading into each entry state and keep a heading for Telegram linking.
- [x] Run focused source/entry/publishing/wizard tests, TypeScript and changed-file lint, inspect the diff, and report verification limits.

Run: `npx vitest run src/components/marketplace/listing-source-step.test.ts src/components/marketplace/new-listing-entry.test.ts src/components/profile/publish-account-dialog.test.ts src/components/marketplace/listing-form-ux.test.ts src/components/marketplace/listing-form-mobile.test.ts`.

Run: `npm run typecheck` and ESLint on the changed TypeScript files. Expect all focused tests and checks to pass; distinguish unrelated existing failures if present.

## Verification

- 59 focused tests passed across entry, source selection, publishing, mobile wizard, draft recovery, account forms, advertising, platform fields, and form data.
- TypeScript passed. Changed-file ESLint has no errors; the three image warnings in the existing wizard predate this change.
- Independently reviewed with no actionable findings.
- Inspected the running page in Chrome at desktop and 390px mobile widths; confirmed already-listed state, new-account form, restored draft message, and return navigation. The live account was already listed, so pricing was verified with component tests rather than publishing a real listing.
