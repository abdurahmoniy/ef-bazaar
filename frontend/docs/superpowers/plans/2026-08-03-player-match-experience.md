# Player Match Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make player matching understandable, accessible, resilient, and continuous across marketplace views, navigation, authentication, and Dream Team editing.

**Architecture:** A single typed URL-state model owns criteria, strictness, sorting, paging, and view mode. An accessible Radix dialog edits a draft and applies it atomically. Listing cards and details consume the backend match explanation instead of reconstructing scores.

**Tech Stack:** Next.js App Router, React, TypeScript, Radix UI, Tailwind CSS, Vitest, React Testing Library.

---

## Task 1: Centralize typed marketplace match URL state

**Files:**
- Create: `frontend/src/lib/player-match-query.ts`
- Modify: `frontend/src/lib/marketplace-types.ts`
- Modify: `frontend/src/lib/marketplace-client-api.ts`
- Test: `frontend/src/lib/player-match-query.test.ts`

- [ ] Add failing tests for parsing/serializing canonical criteria, priority, strictness 1–10 including `1`, stable ordering, unrelated-filter preservation, malformed-value removal, and legacy Dream Team conversion.
- [ ] Run `npm test -- player-match-query.test.ts` and confirm it fails because the typed helper is absent.
- [ ] Implement pure `parsePlayerMatch`, `writePlayerMatch`, and `updateMarketplaceQuery` functions using repeatable `matchCard` parameters.
- [ ] Ensure `0`/empty values are never accidentally replaced through truthiness and page resets only when a result-affecting filter changes.
- [ ] Run the focused test and commit with `feat(marketplace): centralize player match query state`.

## Task 2: Replace the custom sheet with an accessible dialog

**Files:**
- Modify: `frontend/src/components/marketplace/player-filter-dialog.tsx`
- Modify: `frontend/src/components/ui/dialog.tsx`
- Modify: `frontend/src/components/ui/tabs.tsx`
- Test: `frontend/src/components/marketplace/player-filter-dialog.test.tsx`

- [ ] Add failing interaction tests for focus trap, focus restore, Escape, overlay close, labelled title/description, tabs semantics, 44px controls, keyboard card selection, loading/error/retry, and reduced motion.
- [ ] Run the focused test and confirm failures against the custom `role=dialog` implementation.
- [ ] Rebuild with Radix Dialog and Tabs primitives, retaining the mobile bottom-sheet and desktop modal layouts.
- [ ] Give selection buttons `aria-pressed`, tabs keyboard behavior, visible focus, and screen-reader announcements for picked count.
- [ ] Add explicit fetch error state and retry without clearing the draft.
- [ ] Re-run the focused test and commit with `feat(marketplace): make player filter accessible`.

## Task 3: Clarify strictness, priority, and the active search

**Files:**
- Modify: `frontend/src/components/marketplace/player-filter-dialog.tsx`
- Modify: `frontend/src/components/marketplace/dream-team-pitch.tsx`
- Modify: `frontend/src/components/marketplace/player-filter-launcher.tsx`
- Test: `frontend/src/components/marketplace/player-filter-dialog.test.tsx`
- Test: `frontend/src/components/marketplace/dream-team-pitch.test.tsx`

- [ ] Add failing tests for strictness labels from “Any match” through “Exact target”, a live minimum-score preview, a priority toggle labelled “Counts 3×”, duplicate-player rejection, and an active summary outside the dialog.
- [ ] Implement the 1–10 control without exposing percentage arithmetic as the primary label; display the resulting score threshold secondarily.
- [ ] Let any selected slot/card be marked priority and explain that priority changes ranking rather than becoming mandatory.
- [ ] Render a compact active summary with selected count, priority count, strictness, Edit, and Clear.
- [ ] Re-run focused tests and commit with `feat(marketplace): clarify player match controls`.

## Task 4: Preserve match state across every marketplace action

**Files:**
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-sidebar.tsx`
- Modify: `frontend/src/components/marketplace/listing-card.tsx`
- Modify: `frontend/src/app/marketplace/[id]/page.tsx`
- Test: `frontend/src/components/marketplace/marketplace-browser.test.tsx`

- [ ] Add failing tests proving criteria/strictness survive grid/list toggle, quick chips, sidebar filters, sort, pagination, search, listing navigation, and Back.
- [ ] Replace component-local query construction with `updateMarketplaceQuery` and include typed match parameters in listing detail links and server requests.
- [ ] Reset only page on result-affecting changes; keep display-only view changes from discarding search context.
- [ ] Re-run the focused test and commit with `fix(marketplace): preserve player match context`.

## Task 5: Explain results and recovery states

**Files:**
- Modify: `frontend/src/components/marketplace/listing-card.tsx`
- Create: `frontend/src/components/marketplace/match-breakdown.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Modify: `frontend/src/app/marketplace/[id]/page.tsx`
- Test: `frontend/src/components/marketplace/listing-card.test.tsx`
- Test: `frontend/src/components/marketplace/match-breakdown.test.tsx`

- [ ] Add failing tests for grid and list match badges, exact/alternate/missing sections, priority marks, a matched-card preview, and a match-specific empty state with Loosen/Edit/Clear actions.
- [ ] Render `matchDetails` directly and never infer match quality from listing JSON.
- [ ] Distinguish exact card editions from alternate editions of the same player in accessible text and color-independent icons.
- [ ] Add detail-page breakdown and preserve the originating query in Back links.
- [ ] Re-run focused tests and commit with `feat(marketplace): explain account match results`.

## Task 6: Protect Dream Team drafts and signed-out work

**Files:**
- Modify: `frontend/src/components/marketplace/dream-team-editor.tsx`
- Modify: `frontend/src/lib/auth-return.ts`
- Create: `frontend/src/lib/dream-team-draft.ts`
- Test: `frontend/src/components/marketplace/dream-team-editor.test.tsx`
- Test: `frontend/src/lib/dream-team-draft.test.ts`

- [ ] Add failing tests for local signed-out draft persistence, auth return, unsaved-change confirmation, restored formation/priority, and successful-save cleanup.
- [ ] Store a versioned local draft without sensitive account data; restore it after authentication and offer explicit discard.
- [ ] Warn on close/navigation when the current draft differs from the last saved snapshot.
- [ ] Re-run focused tests and commit with `feat(dream-team): preserve drafts across sign-in`.

## Task 7: Verify the release slice

- [ ] Run all touched frontend tests, then `npm test`, `npm run typecheck`, and `npm run lint` if configured.
- [ ] Use keyboard-only smoke tests at mobile and desktop widths; verify focus return and reduced-motion behavior.
- [ ] Record the known baseline homepage-copy test separately if it remains and run `git diff --check`.

