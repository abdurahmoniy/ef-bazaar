# Telegram trade turn implementation plan

**Goal:** Extend the requested “Sizning navbatingiz” notification to Telegram with the next action and existing trade button.

**Architecture:** Use existing trade-action events and auth identity enrichment. Snapshot outstanding participant turns before and after a successful trade mutation. Publish YOUR_TURN with a state identifier when a new action becomes available or a swap counterpart completes the current step. Suppress unchanged turns, waiting participants, terminal states and invalid actions. Bot maps state identifiers to fixed Uzbek copy; no untrusted HTML. Marketplace explicitly ignores this Telegram-only event because the frontend already provides the turn toast.

**Scope:** SMART transfer/verification and HUMAN admin selection/close confirmation. Existing event notifications are retained. No deployment or live messages during tests.

- [x] Add failing trade lifecycle and bot rendering regressions, plus auth forwarding and marketplace compatibility coverage.
- [x] Add turn snapshots/publication inside the locked trade transaction, new event enum and bot copy; use existing post-commit publisher.
- [x] Run focused tests, then Java 21 clean verify for trade, bot, auth and marketplace with Docker.
- [x] Inspect reports/diff, restore only generated test fixture, record results. Keep changes local.

## Focused verification

Before implementation, trade tests had 8 expected failures (no turn event) and bot tests had 7 expected failures (generic message instead of turn instructions). After implementation, trade lifecycle/decision tests, bot copy, auth forwarding and marketplace compatibility tests passed. Added coverage for admin reassignment and missing chat links; both passed in the full unit suite. The turn event contains a fixed state identifier, and bot rendering never interpolates arbitrary details into HTML. Existing post-commit publication is reused.

Full Java 21 `mvn -B -ntp clean verify` passed for all affected services: trade 275 Surefire + 275 Failsafe, marketplace 632 Surefire + 78 Failsafe, bot 108 Surefire, auth 71 Surefire. All 1,439 tests passed with zero failures/errors/skips; each command exited 0 with BUILD SUCCESS. Bot/auth have no Failsafe test reports. Local Docker 29 requires `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`; `caffeinate` prevents machine sleep. Generated crypto vectors were restored. `git diff --check` passed. No frontend, worker or payment code changed in this increment, so their suites were not rerun. Changes remain local; no commit, push, remote CI, deployment or live Telegram message.
