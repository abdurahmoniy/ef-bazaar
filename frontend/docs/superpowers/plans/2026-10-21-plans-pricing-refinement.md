# Plans pricing refinement

**Approved direction:** Compact pricing-first plans page (~960px), a short32–34px intro, quiet Free card and Pro's navy price header/pitch detail, clean benefits body and one gold primary action. Remove the large decorative hero/pass and duplicate hero price/action. Profile stays unchanged. Work remains local; no commit/push/merge/deploy.

- [x] Add meaningful shortfall regressions:5000so‘m wallet/30000so‘m price yields exact25000so‘m inside the Pro footer, accessible announcement/focus, one top-up primary action, safe return intent and explicit retry/confirmation with idempotency retained. Verify RED before production edits.
- [x] Restructure plans intro and card header/body/footer. Remove persistent `:target` ring; retain keyboard focus and safe `#pro` navigation. Retain all existing purchase/error/expiry/legacy guards.
- [x] Run focused tests, then full Node22 typecheck/lint/test/build on final code. Lockfile/runtime unchanged; fresh npmci only if dependencies/environment change.
- [x] Inspect production browser1440/390/375px light/dark, normal/shortfall/#pro, keyboard confirmation and wallet return. Use external synthetic fixture, no production mocks. Save viewport screenshots early for visual review.
- [x] Final scope/diff check, preserve original artwork, report exact evidence and review URL.


## Final local evidence

- Node22.23.3/npm10.9.9; lockfile/dependencies/runtime unchanged, so the existing lockfile installation was reused (no npmci needed).
- Final `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all exit0. 305 files / 2556 tests PASS, 0 failures/skips. Lint retains27 existing warnings,0 errors. Logs: `/private/tmp/ef-pricing-final-{build,typecheck,lint,test}.log`; results: `/private/tmp/ef-pricing-verification.json`; verified application hashes: `/private/tmp/ef-pricing-verified-source.json`.
- Initial full-suite run had two URL-configuration failures because the verification runner inherited preview `INTERNAL_API_BASE_URL` and `NEXT_PUBLIC_BASE_URL`. Removing those overrides for the full test command restored CI/default configuration; all tests then pass with no application/assertion changes. Evidence retained at `/private/tmp/ef-pricing-first-full-failure.log`. Preview environment is used only for local production build/server, with no skipped build phase or alternative bundler.
- Meaningful shortfall RED and compact-copy RED precede their implementations: `/private/tmp/ef-pricing-red.log`, `/private/tmp/ef-pricing-compact-red.log`; focused34 tests then PASS. Known shortfall is typed, never parsed from the server sentence; unavailable wallet lookup keeps the server fallback.
- Production browser1440x900,390x844,375x812, light/dark: normal + fresh `?intent=pro#pro` +5000so‘m balance/25000so‘m shortfall. No page errors or overflow; card has no focusability/extra target outline; desktop anchor88px, mobile16px; recovery footer157.4px, primary48px/retry44px, neither overlaps support bubble. Root independent visual review passed.
- Keyboard control focus and dialog trap/escape passed. Actual wallet route prefilled25000; safe return target preserved. Browser back returns without another purchase or auto-opened dialog; next attempt requires explicit confirmation. Synthetic API only; no real payment or external auth/Telegram/Mailcow E2E.
- Screenshots/results: `/private/tmp/ef-pricing-browser/`; key viewport files `plans-1440-light.png`, `plans-shortfall-1440-light.png`, `plans-pro-375-light.png`, `plans-shortfall-375-dark.png`. Machine logs: `final-matrix-result.log`, `flow-result.log`.
- Review preview: `http://127.0.0.1:4350/plans`, external fixture `/private/tmp/ef-pricing-fixture.cjs` at4450. Preview restored to Free/light. No production mock/demo route or dependency change. Profile and original11 untracked artwork files are byte-identical.
- Only plans view/card/styles/test and this note changed. `git diff --check` PASS. Backend unchanged, no backend suite rerun. All changes remain local; no commit/push/merge/deploy.
