# Linked Account Warning Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Google Play and Game Center linked states as separate compact amber warning chips on marketplace feed cards.

**Architecture:** Keep the existing exact-boolean model flags and change only the listing-card presentation. A reusable `LinkedServiceWarning` renders a warning triangle and explicit linked-state label; the parent flex-wrap container prevents overflow when both services are present.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Lucide React, Vitest.

---

### Task 1: Specify warning-chip behavior

**Files:**
- Modify: `src/components/marketplace/listing-card.test.ts`

- [ ] **Step 1: Write the failing rendered-card assertions**

Add assertions that one Google-linked listing contains `data-linked-service-warning="google-play"`, a warning icon, `Google Play ulangan`, amber semantic classes, and no Game Center chip. Add a both-linked case asserting exactly two warning chips and both labels. Retain the existing neither-linked and non-boolean cases.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/marketplace/listing-card.test.ts`

Expected: FAIL because the current neutral service row has no separate warning chips, warning icon, or `ulangan` copy.

### Task 2: Implement separate amber warning chips

**Files:**
- Modify: `src/components/marketplace/listing-card.tsx`
- Test: `src/components/marketplace/listing-card.test.ts`

- [ ] **Step 1: Replace the neutral row with a wrapping warning-chip group**

Use a `flex flex-wrap gap-1.5` container and render one `LinkedServiceWarning` per exact-true model flag.

- [ ] **Step 2: Implement the reusable chip**

Render Lucide `TriangleAlert` and `${label} ulangan` inside an amber warning surface using existing semantic tokens: `border-secondary/45 bg-secondary/10 text-accent-foreground` with a compact `text-[10px]` size. Do not render Google or Apple brand images.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `npm test -- src/components/marketplace/listing-card.test.ts`

Expected: all listing-card tests pass.

### Task 3: Verify the approved behavior

**Files:**
- Verify: `src/components/marketplace/listing-card.tsx`
- Verify: `src/components/marketplace/listing-card.test.ts`

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run typecheck` and require exit code 0.
- [ ] Run `npm run lint` and require zero errors.
- [ ] Run `git diff --check` and inspect the final scoped diff without staging unrelated user changes.
