# Accounts Daily Use Implementation Plan

> Execute the approved design in this workspace. Use subagent-driven-development for the bounded navigation task while the primary agent handles account data and cards.

**Goal:** Make account management easy to reach and useful for repeated daily visits, with wallet balance under profile identity.
**Architecture:** Keep existing profile routes. Reuse authenticated server fetches for balance, listing price and owned mailbox summaries. Pass only display data into account cards. Use local per-user pin preferences and per-user session collection preferences.
**Tech Stack:** Next.js, React, Tailwind, Vitest.

- [x] Navigation: update mobile-bottom-nav and marketplace-shell; add accounts destination and preserve auth redirects, pending sessions, active markers; adjust existing tests. Account create/edit and wallet route selection follow parent destinations.
- [x] Data: load wallet only for Profile, listings and mailboxes only for Accounts. Match current listing IDs and owned mailbox emails, expose price and mailbox href only when verified. Avoid fetching favorites on unrelated tabs.
- [x] Profile: render a balance block beneath identity with Hamyonni ochish; preserve missing balance as unavailable and gate with FEATURES.wallet.
- [x] Cards: add reversible reveal, copy feedback, mailbox access, price and status. Move secondary management actions into accessible disclosure, require removal confirmation, retain delete confirmation. Use 44px action targets.
- [x] Collections: conditional search/status controls at five accounts, persistent per-user pins, session-restored filters after returning from editing, empty search result recovery.
- [x] Validation: update/add focused behavior tests before implementation, run npm test for changed areas; npm run typecheck; eslint changed files; inspect desktop and mobile in browser and review diff.

Validation: 79 focused tests passed; TypeScript and ESLint passed. Browser review at 375px, 768px and desktop verified Accounts navigation, current listing price, removal confirmation/cancellation, and profile balance placement. Focus restoration after asynchronous unpublish is covered by a connected-DOM regression test. No production data was changed.
