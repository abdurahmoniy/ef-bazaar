# Plans and profile membership UI

**Goal:** Make Free/Pro understandable and purchasing deliberate and easy, with a prominent honest membership state in the profile.

**Approved direction:** The supplied request chooses efBazaar's existing navy/gold tokens and sans font, original membership card with subtle pitch geometry and the existing brand mark. No old artwork/video/serif styling, ratings or verification symbolism. Work stays local; no commit/push/merge/deploy.

**Architecture:** Keep SSR catalog/payment membership and existing owner remount boundaries. PlansView retains the purchase state machine; all billable actions first open a Radix confirmation. ProfileMembership reads only payment membership, while ProfileAppearance keeps its existing independent capability/deadline checks. A small shared membership card supplies visual identity without access decisions. Entitlement descriptions and comparison derive numeric/boolean grants from the live catalog, with missing/malformed values unavailable.

**Implementation and verification:**

- [x] Add failing purchase regressions for confirmation before choose/extend, navigation intent without charge, expired/unknown and empty catalog. Preserve price change, idempotency, insufficient funds and owner isolation coverage.
- [x] Add membership regressions for Free, active/muddatsiz Pro, STAFF, expired/Grace and unknown; no paid state implies feature readiness or verification.
- [x] Implement semantic-token responsive plans hero, Free/Pro cards, capability comparison, FAQ, recovery UI and reviewed payment summary. Move membership above profile navigation and add compact menu access.
- [x] Run focused tests, then full Node 22 typecheck/lint/test/build. Preserve original untracked assets/PlanArt files.
- [x] Inspect real browser desktop1440/mobile390 and375, light/dark Free/Pro and confirmation, keyboard/reduced motion, no overflow. Use an external API fixture only; no demo routes or production mocks.
- [x] Review final diff and git diff --check; record exact results and screenshot locations. Leave preview reviewable and all code local.

**Failure and accessibility contracts:** Unknown membership disables billing and offers refresh. Empty/failed catalog offers retry and support. Current STAFF/unlimited/active historical MAX cannot buy. Monthly price and unified mailbox limits must be known. No automatic charge on navigation, safe login return with upgrade intent, single in-flight purchase/idempotency, explicit re-confirmation when price changes, wallet-shortfall route, accepted means activation pending. Controls are ≥44px, dialog traps focus with busy dismissal protected, table has headers, reduced-motion disables decorative animation. Existing profile cover upload remains intact.


## Final local verification (2026-10-20)

- Node 22.23.3, npm10.9.9. Fresh `npm ci --no-audit --no-fund` from unchanged package-lock: exit0 (`/private/tmp/ef-ui-npm-ci.log`).
- Final `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`: all exit0. 305 files / 2554 tests PASS. Lint retains 27 existing warnings, 0 errors. Logs: `/private/tmp/ef-ui-build.log`, `/private/tmp/ef-ui-final-typecheck.log`, `/private/tmp/ef-ui-final-lint.log`, `/private/tmp/ef-ui-final-test.log`.
- Meaningful RED→GREEN evidence covers first-click charge prevention, expired labels, invalid expiry/stale confirmation, deadline timers, long-open Free quote date, and MAX/STAFF cover labels: `/private/tmp/ef-ui-behavior-red.log`, `/private/tmp/ef-ui-review-red.log`, `/private/tmp/ef-ui-clock-red.log`, `/private/tmp/ef-ui-final-review-red.log`; corresponding green focused runs plus the final full suite pass. Independent read-only code review: PASS, all actionable findings resolved.
- Final production browser: 16 Free/Pro plans/profile × desktop1440/mobile390 × light/dark states; 8 confirmation desktop1440/mobile375 light/dark states; 8 unknown/STAFF/expired/MAX/Grace/Recovery/empty/catalog-failure states; 375px first viewport and keyboard/reduced-motion checks. All observed overflow0, no page errors in matrices, focus trapped in dialogs, Escape cancels without billing.
- Local synthetic checkout sends one MONTH/3,000,000-tiyin POST even when confirm is clicked twice and shows activation pending. Anonymous login intent `/plans?intent=pro#pro` without a charge is verified by the DOM regression suite. The optional browser login attempt met the synthetic-cookie/proxy redirect assumption and is not counted as a passing external auth flow. No real external authentication, payment, Telegram or Mailcow E2E was run.
- Screenshots and machine-readable browser logs: `/private/tmp/ef-ui-browser/`. Key viewport files: `plans-desktop-final-viewport.png`, `profile-pro-mobile-final-viewport.png`, `profile-pro-mobile-dark-final-viewport.png`, `plans-375-dark-final-viewport.png`. API fixture: `/private/tmp/ef-ui-fixture.cjs`.
- Review preview is restored to Free and remains at `http://127.0.0.1:4350`; `http://127.0.0.1:4450/__control?mode=free` or `mode=pro` sets only the local synthetic cookie/state. Production Next build served locally; no demo route/mock enters application source. Preview emits Next's existing standalone/start advisory; build and all gates pass.
- Scope is frontend only; backend suites were not rerun. Original 11 untracked artwork/assets files remain untouched. `git diff --check` PASS; no generated files, credentials or dependency changes included. At the end of that local review, new UI changes remained uncommitted/local and no push/PR update/merge/deploy had been performed.


## UI-only publication verification (2026-10-21)

PR #394 was merged into `main` at `b856dec46a013b2957b887427d129456211ca721`. The new `codex/membership-ui` branch starts at that commit; this PR contains only the 25 reviewed frontend files. The original 11 untracked artwork/assets files remain byte-identical and excluded.

The exact Git index was exported to `/private/tmp/ef-ui-commit-tree` and verified with Node22.23.3/npm10.9.9, fresh lockfile `npm ci --no-audit --no-fund`, `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test`: all exit0. The committed scope has **304 files / 2548 passing tests**, 0 failures/skips, and 23 existing lint warnings with 0 errors. The difference from the working-tree suite is the original unused/untracked PlanArt component and its six tests; no tests were disabled or assertions weakened.

Logs: `/private/tmp/ef-ui-committed-{ci,build,typecheck,lint,test}.log`; structured results: `/private/tmp/ef-ui-committed-verification.json`. Staged scope/credential/generated-file audit and `git diff --cached --check` pass. Only this documentation paragraph was added after the application checks; application source remains identical to the verified export. Publish is authorized, with remote CI to be checked on the latest pushed SHA; merge and deploy remain out of scope.
