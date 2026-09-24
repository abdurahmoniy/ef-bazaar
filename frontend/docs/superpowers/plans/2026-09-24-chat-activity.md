# Chat activity implementation plan

**Goal:** Show real online/offline, typing and sent/read states in chat, with subtle accessible animation.

**Architecture:** Reuse authenticated marketplace API and existing React Query polling. Redis stores expiring presence/typing timestamps; the database read cursor is authoritative. No new transport or database schema. Activity is visible only to chat participants. Presence means visible app activity within 40 seconds; typing expires after six seconds. A failed status lookup is unknown, not offline.

**Tech stack:** Next.js/React, React Query, CSS, Spring Boot, Redis, PostgreSQL.

## Backend
- [x] Test authenticated participant-only activity lookups and typing updates.
- [x] Implement presence heartbeat, typing expiry, and partner activity endpoints.
- [x] Test and implement monotonic read-through-message cursor; reject messages from another chat.
- [x] Run focused backend suites.

## Frontend
- [x] Test heartbeat visibility, typing throttling/expiry, unknown network state, read visibility and sent/read rendering.
- [x] Heartbeat from the existing authenticated session boundary, pause when hidden/offline.
- [x] Add a small activity hook: poll every three seconds while visible, throttle typing every two seconds, clear on send/blur/hide, expire stale display state.
- [x] Add online/offline status and animated typing dots to the profile-linked header; sent/read checks to outgoing messages.
- [x] Mark received messages read only when visible, focused, and at the latest messages, using the exact message ID.
- [x] Animate only newly arriving messages and status changes, honoring prefers-reduced-motion.
- [x] Run chat tests, typecheck, changed-file lint and review.
