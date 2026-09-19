# Navigation and Chat Implementation Plan

**Goal:** Smooth bottom-tab and detail navigation, with a Telegram-style inbox and conversation.

**Architecture:** A root motion component observes pathname commits and animates explicitly marked content surfaces without wrapping or remounting them. Shared bottom navigation retains the existing routes and feature flags. Conversation styling and grouping stay local to the messenger.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, Web Animations API, Vitest.

1. Add `RouteMotion` at the root, mark marketplace content and the active messenger pane, and verify forward/back movement, rapid cancellation, initial-load stability and reduced motion in DOM tests.
2. Extract `MobileBottomNav` from `MarketplaceShell`; render it in the inbox using the authenticated user. Preserve measured footer clearance and conversation viewport resizing. Refine inbox rows, search and filters.
3. Add and test message grouping at sender, time, day, unread and proposal boundaries. Restyle conversation header, wallpaper, bubbles and composer without changing messaging/trade callbacks.
4. Run focused navigation/chat tests, the full unit suite, typecheck and lint. Inspect phone/desktop layouts and reduced-motion behavior; fix regressions before delivery.

Implementation is split between independent navigation/inbox and conversation tasks; root coordinates motion and final integration. Changes remain uncommitted for review.

## Verification

- Full unit suite: 174 files, 1,402 tests passed. Follow-up inbox/navigation checks passed after final visual adjustments.
- Type checking passed. Lint completed with no errors and existing repository warnings.
- Production build passed with `npm run build -- --webpack`. The default Turbopack builder could not open its worker port in this environment.
- Browser inspection covered the 375px phone inbox/conversation, light and dark themes, desktop split layout, composer and reply controls, search filtering, and a real listing detail. Sample data was used for chat inspection; no messages were sent. The temporary preview route was removed.
- Independent review caught and verified fixes for streamed page arrivals, fixed action-bar positioning, and keeping bottom navigation outside the animated inbox surface.
