# Compact accounts implementation plan

**Goal:** Make account management compact and minimalist on mobile and desktop.

**Design:** Keep existing theme tokens and typography. Use flat cards, a small account thumbnail, compact account statistics, a status/price row, one email row with labelled icon controls, and adjacent actions. Use one column on phones, two from tablet widths and three on wide screens. Preserve email privacy, owned mailbox access, publishing eligibility, pinning and destructive confirmations.

**Architecture:** Update AccountCard presentation, ProfileAccounts grid/filter styling and the accounts header action. Existing services and data contracts remain in use.

**Tech stack:** Next.js, React, Tailwind, Vitest.

- Add a failing regression for accessible icon email reveal/copy controls and adjacent mailbox/publish actions.
- Update the card, grid and header presentation; rerun focused component tests.
- Verify actual cards at small mobile and desktop widths in both themes, including long email/title content.
- Run Node 22 typecheck, lint, full tests and production build; inspect the scoped diff and whitespace.
