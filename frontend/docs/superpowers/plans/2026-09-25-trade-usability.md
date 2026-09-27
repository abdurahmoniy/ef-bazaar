# Trade usability implementation plan

**Goal:** Implement user tasks 2, 4, 6, 7, 8, 10, 12, 13 and 14 across the affected services.

**Design:** Retain the existing trade state machine and role-based credential isolation. Show the viewer's next action prominently before the timeline, with an in-app notification when it becomes their turn. Swap participants independently reveal the incoming account password and confirm or reject. Confirmation does not depend on receiving a login code; requesting another code remains available after receiving one. Swap proposals record seller/buyer/equal commission responsibility and use it consistently for reservations, settlement and refunds. New account titles describe sale/exchange origin rather than copying listing descriptions. Make visual adjustments within the existing design.

**Clarified by user:** Two-sided credentials/decisions apply only to swaps. Fee options are me/partner/equal. Videos open but do not play.

- [x] 2, 12: Shrink listing-like visual treatment and compact chat timestamps; inspect layout and preserve interaction behavior.
- [x] 6, 7, 10: Add failing component tests for action ordering, turn announcements, both swap roles and code retry after delivery; implement the minimal UI fixes.
- [x] 8: Replace code-arrival cooldown with immediate participant confirmation; test permissions and preserve state/role validation in frontend and trade-service.
- [x] 13: Trace proposal/payment contracts, add failing allocation/escrow tests, persist payer choice using a new migration, update API and frontend proposal/acceptance breakdowns.
- [x] 14: Add transfer tests for sale and swap titles and event ordering, update marketplace account handover naming without losing account details.
- [x] 4: Diagnose video proxy/browser failure, add reproduction tests and fix the actual transport/playback issue.
- [ ] Verify final affected scope: Node 22 npm ci, typecheck, lint, full tests, production build; Java 21 clean verify for every changed Java service with Docker; inspect reports and git diff --check. Keep changes local.

## Implementation status

| Task | Result |
| --- | --- |
| 2 | Listing like control reduced from 44px to 32px, icon from 16px to 14px; mobile browser checked at 390px. |
| 4 | Bot supports browser byte ranges (206/416); frontend preserves video and multipart MIME types; failed-player state resets per guide. User supplied the original MOV: 25,946,008 bytes, HEVC/AAC, above Telegram's 20 MB download limit. Prepared a fast-start H.264/AAC MP4 at the original 888×1920 resolution, 12,355,387 bytes (11.78 MiB); decoded-frame readability verified. Admin upload validation now matches the backend's 20 MiB limit, with a regression test confirmed failing before the fix. With explicit user confirmation, created replacement guide `c16b13fc-8e30-4796-9faa-79120c20062f`, repointed the first bot button, then deleted old guide `8dbba42f-ffde-4736-a54c-9ab99398dff5`. Live website playback verified: currentTime advanced from 4.87 to 29.57 seconds, readyState 4, paused false, no media error. After deletion, both bot mappings persisted; wallet guide remains unchanged. |
| 6 | Pinned card shows the viewer’s next action and partner completion; in-app toast announces turn changes. Current actions precede timelines from both pinned and message entry points. Swap email-change notifications target the counterpart. Telegram YOUR_TURN notifications added on 2026-09-27 with fixed next-action instructions and the existing trade button; unchanged turns are suppressed. See 2026-09-27-telegram-trade-turn.md. |
| 7 | Both swap participants’ reveal and decision controls covered; wrong-party reveals cannot consume credentials. Either rejection prevents a successful exchange regardless of decision order. |
| 8 | Completed locally after the 2026-09-27 clarification: Konami may allow account login without emailing a code. After password reveal the UI allows confirmation; backend no longer requires a code or five-minute grace period in the verification stage. Role/participant and state validation remain. Sale and both swap participants are covered. |
| 10 | Retry remains available after a code arrives. Email-change retry is also available to the sale seller and both swap participants, scoped to their own transfer mailbox. Worker watches subsequent login and email-change codes and suppresses repeats/older messages; reset-link polling remains one-shot. The code is requested in Konami, and this button observes the mailbox. |
| 12 | Updated per user clarification on 2026-09-26: Telegram-style metadata at the bottom-right of the final text/caption line, with an invisible inline reservation preventing overlap. Captionless photos use a translucent metadata overlay. Existing sent/read semantics and one accessible timestamp remain intact. Actual rendered-message fixture checked at 320, 390 and 768 px: no text/metadata intersections or metadata outside bubbles. |
| 13 | Me/partner/equal fee choices persist through proposals and trades. Server quotes drive exact wallet funding; amounts freeze at hold, including legacy hold recovery, settlement/refunds, stale-quote rejection, and participant authorization. |
| 14 | New owners receive “Savdodan kelgan akkount” or “Obmendan kelgan akkount” titles; descriptions/media remain intact, including either mailbox-event order. |

## Verification evidence

Code changes remain local. No remote CI, push, merge, or code deploy was performed. The video guide content was replaced in production through the admin UI with explicit user confirmation; see task 4 above.

- Frontend, Node 22.23.3: `npm ci --no-audit --no-fund` completed earlier with the same lockfile/runtime. After the email-change retry changes, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` completed successfully again. 225 test files / 1,888 tests passed. Lint has 25 warnings and zero errors. Production build required network access for the configured font.
- Marketplace, Java 21: `mvn -B -ntp clean verify` passed; 631 Surefire + 78 Failsafe tests, zero failures/errors/skips. Maven reported delayed fork shutdown but exited 0 with BUILD SUCCESS.
- Bot, Java 21: `mvn -B -ntp clean verify` passed; 101 tests, zero failures/errors/skips. No Failsafe suite is configured.
- Payment, Java 21: final `mvn -B -ntp clean verify` passed; 81 Surefire + 197 Failsafe tests, zero failures/errors/skips. An earlier timeout failure was traced to a 31-second macOS idle sleep spanning the test; code/assertions were unchanged. `caffeinate` prevents suspend during verification.
- Trade, Java 21: final `mvn -B -ntp clean verify` passed after email-change retry: 263 Surefire + 275 Failsafe tests, zero failures/errors/skips. Docker 29 compatibility used `JAVA_TOOL_OPTIONS=-Dapi.version=1.44` and `caffeinate` prevented idle sleep. The controller integration test now uses the existing payment stub to exercise successful settlement.
- Java Testcontainers required local `JAVA_TOOL_OPTIONS=-Dapi.version=1.44` for Docker 29 compatibility. Generated crypto vectors were restored.
- Worker, Python 3.12.14: dependencies installed from `requirements-dev.txt`; `ruff check smart_admin_worker/ tests/` passed and `pytest -q tests/unit` passed all 118 tests. Required full `pytest -q` ran the unit tests but failed integration setup while pulling `confluentinc/cp-kafka:7.4.0`: Docker reported `lease does not exist`. A direct image pull also failed committing a layer because its content-store source file was missing. Integration verification remains blocked by Docker's image store; tests were not skipped or weakened. The isolated local venv required `setuptools` because pinned Docker 5.0.3 imports `distutils`, which Python 3.12 removed. Existing asynchronous mock warnings remain visible.
- `git diff --check` passed. Temporary browser artifacts and the local preview were cleaned up.

## Highlight refinement — 2026-09-26

Removed the reply/search highlight outline and rounded row frame. The row now uses a 7% accent gradient fading to transparent at both sides. Browser comparison confirmed identical bubble dimensions, radii and shadows before/after; mobile preview checked at 390 px. Full frontend typecheck, lint (25 warnings, no errors), 1,877 tests and production build passed on the final stylesheet. Changes remain local.

## Connection status refinement — 2026-09-26

Moved connection progress from a separate message-area banner into the existing activity line beneath the contact name. A small spinner and “Ulanmoqda…” temporarily replace presence while disconnected; normal activity returns upon reconnection. Existing messages remain visible. A regression test was confirmed failing before implementation, then passed for initial disconnection, reconnection and a subsequent disconnect. Full frontend typecheck, lint (25 warnings, no errors), 1,878 tests and production build passed. Changes remain local.

## Network and update statuses — 2026-09-26

Added the requested header statuses, in priority order: browser offline → “Tarmoq kutilmoqda…”, socket disconnected → “Ulanmoqda…”, message query fetching → “Yangilanmoqda…”, then the existing partner activity. Network status reads the browser snapshot and subscribes to online/offline events with cleanup; server rendering uses a stable fallback. Waiting for a network uses a small static Wi-Fi-off icon, while connecting/updating retain the small reduced-motion-aware spinner. Existing failure messages and retry actions remain available.

Three regression cases failed before implementation, then passed: initial offline state and network transitions, successful message refresh, and failed message refresh. They verify connection-state priority, retained messages, and restoration of partner activity after fetching ends. Full Node 22 frontend verification passed: `npm run typecheck`, `npm run lint` (25 warnings, zero errors), `npm test` (225 files / 1,881 tests), and `npm run build`. Dependencies remain from the earlier `npm ci --no-audit --no-fund` with unchanged runtime/lockfile. `git diff --check` passed. Changes remain local; no deployment or remote CI run.

## Task 8 clarification and completion — 2026-09-27

The user clarified that Konami sometimes admits a buyer without sending a login code. Confirmation therefore must remain available after password reveal even when no email code arrives. The UI already enforces reveal-before-confirm and now explicitly explains that codes are optional. Its regression checks that confirmation is absent before reveal, enabled afterward despite a future legacy unlock time, and submits the confirm action after the inspection confirmation modal.

Removed the backend login-code/grace-period gate and its unused timer configuration. The response retains the legacy `confirmUnlocksAt` field as null for compatibility. Actor authorization and state-machine transitions are unchanged. The sale integration regression covers wrong stage (409), sale seller (403), outsider (404), code-free buyer confirmation (200), SUCCESS and escrow settlement. Both swap participants can likewise confirm without a code. Both success tests reproduced 409 before the fix.

Final frontend checks: Node 22 `npm run typecheck`, `npm run lint` (25 warnings, zero errors), `npm test` (225 files / 1,882 tests), and `npm run build` passed. Same runtime/lockfile dependencies from the earlier `npm ci` were reused. Full Java 21 trade-service `mvn -B -ntp clean verify` passed (533 tests, no failures/errors/skips). Initial test fixture issues were corrected: clean compilation removed stale IDE classes, outsider expectation matches the existing 404 contract, and the existing payment stub supplies settlement for controller tests. Generated crypto vectors were restored; `git diff --check` passed. No remote CI, commit, push or deployment.

## Confirmation warning — 2026-09-27

Expanded the account inspection confirmation dialog: a sale explicitly warns that confirmation completes the trade and transfers payment to the seller, and that confirmation cannot be undone. Swap wording explains that both participants must confirm; surcharge swaps also mention the additional payment. The warning asks users to inspect the receiving account first, uses larger text with an emphasized warning, and retains Cancel and explicit final confirmation buttons. No confirmation request is sent when opening or cancelling the dialog.

Three regression cases (sale, swap, surcharge swap) failed before the copy update and passed afterward. Full frontend `npm run typecheck`, `npm run lint` (25 warnings, zero errors), `npm test` (225 files / 1,885 tests), `npm run build`, and `git diff --check` passed. Same Node 22 runtime and installed lockfile dependencies. Changes remain local, not deployed.


## Email-change code retry — 2026-09-27

Added “Kodni qayta so‘rash” to the SMART trade email-change stage, before and after a code arrives. Sale sellers and both swap participants can re-observe their own transfer mailbox. The button shows pending state, prevents duplicate clicks, refreshes on success and displays request errors. Copy explains that a new email must first be requested in Konami. The backend validates participant, role, mode, stage and mailbox readiness before publishing the existing email-code poll event.

The worker continues observing fresh email-change codes, picks the newest matching email regardless of fetch order, normalizes naive timestamps, and suppresses repeated/older hits. Reset-link polling remains one-shot. Frontend, controller and worker regressions reproduced the missing behavior before implementation and passed afterward. Coverage includes authorization failures, wrong stage, both swap mailboxes, request errors and repeated polling.

Final checks: Node 22 typecheck, lint (25 warnings, no errors), all 1,888 frontend tests and production build passed. Java 21 trade-service `mvn -B -ntp clean verify` passed with 263 Surefire and 275 Failsafe tests, zero failures/errors/skips. Python 3.12 Ruff and all 118 unit tests passed. Full worker pytest failed integration setup due to the Docker image-store error described above; integration verification is still pending. Generated crypto vectors were restored and `git diff --check` passed. Changes remain local; no push, remote CI or deployment.


## Telegram turn notifications — 2026-09-27

Added the user-requested Telegram counterpart of “Sizning navbatingiz”. The server compares participant turns before/after locked trade mutations, so delivery does not depend on an open browser. State changes notify participants with an outstanding action; partial swap progress reminds the remaining side once. Unchanged/repeated actions, terminal states, invalid transitions and trades without a chat link do not emit new turn notifications. HUMAN admin selection and close-confirm entry are covered too. Existing trade-action notifications are retained.

The existing auth enrichment forwards the recipient and state identifier to the bot, which renders fixed Uzbek instructions plus “Savdoni ochish”. Marketplace explicitly ignores this Telegram-only event; existing frontend toasts remain. Full Java 21 clean verify passed for trade (550), marketplace (710), bot (108) and auth (71), totaling 1,439 tests with zero failures/errors/skips. `git diff --check` passed, generated crypto vectors restored. Local changes only; no live Telegram messages or deployment. See [implementation plan](2026-09-27-telegram-trade-turn.md).
