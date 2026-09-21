# Player Filter Refresh Implementation Plan

**Goal:** Make player selection easier to browse, review, and apply on phones and desktops.

**Architecture:** Keep dialog state and catalogue fetching in the existing component. Add a selected-player presentation component locally; retain the launcher URL contract and saved-team behavior.

**Tech Stack:** Next.js, React, Radix Dialog/Tabs, Tailwind, Vitest.

1. Add interaction tests in `src/components/marketplace/player-filter-dialog.test.ts` for removing selections after a tab change, clearing without navigating, cancellation, and applying an empty draft to remove an active filter. Run the focused test file and confirm the new behaviors fail.
2. Update `src/components/marketplace/player-filter-dialog.tsx`: draft-only clear and remove handlers, selected strip, header/tabs/cards, labelled search with clear control, and compact expandable matching controls using native radios. Enable empty Apply only when an applied player filter exists.
3. Run the focused test file, related marketplace tests, `npm run typecheck`, and scoped ESLint. Inspect the dialog in a browser at desktop and mobile sizes, including dark mode and phone landscape. Review the diff for accidental changes.

## Completed verification

- Added three interaction regressions; confirmed failure before implementation and all 25 dialog tests passed afterward.
- All 424 related tests across 49 files passed; type checking and scoped ESLint passed.
- Browser checks covered 375×812 portrait, 812×375 landscape, 1280×900 desktop, and 375×568 with eleven selections and expanded settings. Checked light/dark themes, cross-tab selection, search clearing, and real catalogue artwork after its temporary request failure recovered.
- Short viewports use a scrolling dialog with a sticky action footer; temporary preview routes were removed.
- Independent read-only review found no introduced logic bugs.

## Compact layout follow-up

Implemented the requested density refinement: 4/6/7-column cards, reduced typography and padding, a one-row selection strip, and a shorter desktop dialog. All 25 dialog tests, type checking, scoped lint and diff checks passed. Verified the compact mobile view using real catalogue cards.

## Infinite pagination follow-up

Added automatic end-of-list loading to the shared catalogue controls and empty-page termination to the catalogue hook. Three interaction tests cover duplicate observer notifications, append/total termination, retrying a failed page without losing cards, and stale-total empty responses. All 28 dialog tests, type checking and scoped lint passed.
