# eFootball-inspired startup intro

**Goal:** Show a short blue-and-yellow eFBazaar intro once per browser-tab session, as selected by the user. Internal navigation and reloads in the same session do not replay it.

**Design:** Geometric ribbons sweep across a deep blue background, the existing sliced eFBazaar mark assembles, and the wordmark appears before the overlay fades out at 3 seconds. Keep the page rendering underneath. Use local SVG/CSS only, full-screen tap dismissal, Escape dismissal, and reduced-motion opt-out. There is no skip button. A completed tap anywhere starts a 500ms dismissal delay; subsequent taps do not restart it, and normal animation completion can still dismiss sooner. Consume the click while the overlay is present so it cannot activate a link beneath it.

**Scope:** Frontend root layout only; no service, authentication, API, event, or schema changes. Preserve existing unrelated working-tree changes.

## Implementation and verification

- [x] Add colocated DOM tests for first visit, repeat visit, separate session, reduced motion, blocked storage, bounded dismissal without hydration, skip/Escape, keyboard access, and Strict Mode. Run them before implementation and confirm the missing behavior fails.
- [x] Add a small pre-paint script that checks sessionStorage/reduced motion and enables the intro. Storage/script failure leaves the page visible. A bounded timeout hides it even if React never hydrates.
- [x] Add the intro component and CSS module, reuse BrandMark, and connect them to the root layout. Animation completion, skipping, keyboard interaction, reduced-motion changes, and BFCache restoration all dismiss it.
- [x] Run focused regression tests, then Node 22 `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` on final code.
- [x] Inspect desktop/mobile/short-landscape animation states and settled page in a real browser, including reload, skip, reduced-motion, and no-JavaScript behavior. Inspect the scoped diff and run `git diff --check`.

## QA inventory

The intro must cover the viewport without clipping the logo; logo assembly and fade must be visible; underlying page stays mounted; normal navigation/reload must not replay; a fresh session must replay. There must be no skip button. Tapping the background or logo dismisses after 500ms; repeated taps do not extend the delay and do not click through to the page. Escape and page focus dismiss immediately. Reduced-motion users and blocked storage bypass it; an unhydrated page must become usable within 3.4 seconds. Verify desktop, phone, and short landscape; the natural CSS animation must finish at 3 seconds.

## Verification results

- Node 22.23.3, dependencies installed with `npm ci --no-audit --no-fund`.
- Regression first: first-entry/session, pre-hydration focus, centered crossbar, three-second duration, button removal, full-screen tapping, and delayed/repeated tapping expectations all failed before their respective implementations. Current coverage: 22 intro tests and 5 rendered-logo tests.
- Final `npm run typecheck`: passed. `npm run lint`: passed with 27 existing warnings, no errors.
- Final `npm test`: 312 files, 2694 tests passed; existing jsdom document-navigation diagnostic remains.
- Standard `npm run build` (Next.js 16.2.9 Turbopack): passed. The sandboxed attempt stalled in compilation and was terminated; the same command passed outside the sandbox without changing bundler or skipping checks. Sitemap dynamic-rendering diagnostic is existing, and sitemap remains dynamic.
- Chromium: desktop 1440×900, mobile 390×844, landscape 667×375; inspected 1300ms, 2800ms, and dismissed states. Verified button absence, real mouse/touch dismissal after 500ms, repeated taps, no click-through, reload suppression, reduced motion, blocked storage, disabled JavaScript, and blocked hydration scripts. Natural animation completion reported exactly 3 seconds; no page errors.
- `git diff --check`: passed. Changes remain local; no push, remote CI, merge, or deployment performed.
- Independent focused review of the initial intro: no remaining material findings after the focus fix. The later full-screen tap/delay revision was checked with regression tests and mouse/touch browser QA above.
