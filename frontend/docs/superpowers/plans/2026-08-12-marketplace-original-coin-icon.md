# Marketplace Original Coin Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the user-provided flat eFootball coin PNG on marketplace cards and omit Android/iOS coin facts whose value is zero or missing.

**Architecture:** Keep API normalization unchanged and derive feed visibility in the listing-card model so rendering and tests share one rule. Replace the recreated SVG with the exact supplied PNG at a stable public asset path.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Next Image.

---

### Task 1: Lock coin visibility and asset behavior

**Files:**
- Modify: `src/components/marketplace/listing-card-model.test.ts`
- Modify: `src/components/marketplace/listing-card.test.ts`

- [ ] Add a model test asserting positive coin values remain and zero values become `undefined`.
- [ ] Add a rendered-card test asserting only positive platform facts appear and the PNG asset path is used.
- [ ] Run `npm test -- src/components/marketplace/listing-card-model.test.ts src/components/marketplace/listing-card.test.ts` and confirm the new assertions fail against the current zero-inclusive model/SVG implementation.

### Task 2: Use the supplied PNG and hide zero values

**Files:**
- Create: `public/icons/efootball-coin.png`
- Modify: `src/components/marketplace/listing-card-model.ts`
- Modify: `src/components/marketplace/listing-card.tsx`
- Delete: `public/icons/efootball-coin.svg`

- [ ] Copy the first user-provided RGBA PNG byte-for-byte to `public/icons/efootball-coin.png`.
- [ ] Normalize card coin facts with a strictly-positive check (`value > 0`), returning `undefined` for zero, negative, absent, or invalid values.
- [ ] Point `CoinFact` at `/icons/efootball-coin.png` while retaining the accessible platform/value group label.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Verify the scoped change

**Files:**
- Verify only the files listed above plus this plan and the already-approved responsive-grid files.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint` and require zero errors.
- [ ] Run `git diff --check` and inspect `git status --short` to ensure unrelated user edits remain untouched.
