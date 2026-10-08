# Chat touch actions implementation plan

**Goal:** Add the selected actions: right swipe to reply, long-press actions, and fullscreen chat image gestures.

**Design:** Use the existing message actions and zoomable image viewer. A right swipe past 56px replies and shows a reply indicator; a stationary 500ms touch opens permitted actions. Scrolling, cancellation and multi-touch cancel reply/long-press. Suppress synthetic clicks after gestures so photos do not open accidentally. Keep desktop and keyboard message actions. Add single-message selection with copy and own-message deletion. Chat images navigate chronologically using existing zoom behavior; downward swipe closes only at normal zoom.

**Scope:** Frontend only; keep socket actions, ownership and server permissions unchanged.

- Add failing integration regressions for gestures, own-message permissions and gallery navigation.
- Add a reusable chat bubble gesture component and wire into ChatView.
- Connect image attachments to a conversation gallery and add opt-in swipe-down dismissal to the shared viewer.
- Check cancellations, scrolling, pinch/pan and synthetic-click isolation with focused tests.
- Run full Node22 typecheck, lint, frontend tests, production build and diff review.
