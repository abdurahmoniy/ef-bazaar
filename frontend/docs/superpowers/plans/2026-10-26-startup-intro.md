# eFootball-inspired startup intro

**Goal:** Show a short blue-and-yellow eFBazaar intro once per browser-tab session, as selected by the user. Internal navigation and reloads in the same session do not replay it.

**Design:** Follow the supplied reference’s sequence: flat ribbons build across blue, a yellow wipe reveals an oversized blue e, the assembled mark turns and zooms into a color-inversion cut, then paired yellow arcs rotate around one centre and the crossbar locks in last. Reveal the eFBazaar signature and fade out at 6 seconds. Reuse the shared logo’s proportions without stretching its pieces. Keep the page rendering underneath. Full-screen tapping dismisses after 500ms; repeated taps do not restart the delay. Preserve once-per-session playback, Escape/focus dismissal, audio timing, reduced-motion bypass, and the 6.4-second hydration-independent fallback.

**Scope:** Frontend root layout only; no service, authentication, API, event, or schema changes. Preserve existing unrelated working-tree changes.

## Implementation and verification

- [x] Add colocated DOM tests for first visit, repeat visit, separate session, reduced motion, blocked storage, bounded dismissal without hydration, skip/Escape, keyboard access, and Strict Mode. Run them before implementation and confirm the missing behavior fails.
- [x] Add a small pre-paint script that checks sessionStorage/reduced motion and enables the intro. Storage/script failure leaves the page visible. A bounded timeout hides it even if React never hydrates.
- [x] Add the intro component and CSS module, reuse BrandMark, and connect them to the root layout. Animation completion, skipping, keyboard interaction, reduced-motion changes, and BFCache restoration all dismiss it.
- [x] Run focused regression tests, then Node 22 `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` on final code.
- [x] Inspect desktop/mobile/short-landscape animation states and settled page in a real browser, including reload, skip, reduced-motion, and no-JavaScript behavior. Inspect the scoped diff and run `git diff --check`.

## QA inventory

The intro must cover the viewport without clipping the logo; logo assembly and fade must be visible; underlying page stays mounted; normal navigation/reload must not replay; a fresh session must replay. There must be no skip button. Tapping the background or logo dismisses after 500ms; repeated taps do not extend the delay and do not click through to the page. Escape and page focus dismiss immediately. Reduced-motion users and blocked storage bypass it; an unhydrated page must become usable within 6.4 seconds. Verify desktop, phone, and short landscape; the natural CSS animation must finish at 6 seconds.

## Previous verification results (three-second version)

- Node 22.23.3, dependencies installed with `npm ci --no-audit --no-fund`.
- Regression first: first-entry/session, pre-hydration focus, centered crossbar, three-second duration, button removal, full-screen tapping, and delayed/repeated tapping expectations all failed before their respective implementations. Current coverage: 22 intro tests and 5 rendered-logo tests.
- Final `npm run typecheck`: passed. `npm run lint`: passed with 27 existing warnings, no errors.
- Final `npm test`: 312 files, 2694 tests passed; existing jsdom document-navigation diagnostic remains.
- Standard `npm run build` (Next.js 16.2.9 Turbopack): passed. The sandboxed attempt stalled in compilation and was terminated; the same command passed outside the sandbox without changing bundler or skipping checks. Sitemap dynamic-rendering diagnostic is existing, and sitemap remains dynamic.
- Chromium: desktop 1440×900, mobile 390×844, landscape 667×375; inspected 1300ms, 2800ms, and dismissed states. Verified button absence, real mouse/touch dismissal after 500ms, repeated taps, no click-through, reload suppression, reduced motion, blocked storage, disabled JavaScript, and blocked hydration scripts. Natural animation completion reported exactly 3 seconds; no page errors.
- `git diff --check`: passed. Changes remain local; no push, remote CI, merge, or deployment performed.
- Independent focused review of the initial intro: no remaining material findings after the focus fix. The later full-screen tap/delay revision was checked with regression tests and mouse/touch browser QA above.

## Four-second assembly revision — 2026-10-31

The focal sequence is the logo forming from moving geometry. Supporting ribbons cross the blue field; the actual shared-logo slices rotate/translate from oversized fragments to their exact final identity transforms. The mark settles by 2.9 seconds, the wordmark/caption follow, and the overlay exits at 4 seconds. Only transforms and opacity animate; the three slice masks are static. No added animation dependency.

The supplied recording's 17.6–21.6-second cue now runs at original speed for four seconds. Audio attempts start on the native CSS animation event, before hydration; browser autoplay permission still applies. Existing once-per-session, 500ms tap delay, keyboard dismissal, and reduced-motion bypass remain.

Regression first: four-second visibility/failsafe, a tap near completion, fourth-second playback, and the audio deadline all failed with the old timings before implementation. Verify full frontend checks and desktop/mobile/short-landscape assembly states on final code.

Final verification for the four-second revision: Node 22.23.3; `npm run typecheck`, `npm run lint` (0 errors, 27 existing warnings), `npm test` (329 files / 2828 tests), `npm run build`, and `git diff --check` passed. Existing lockfile-installed dependencies were reused. Impeccable's detector reported no findings. Desktop 1200×800, phone 390×844, and short landscape 667×375 snapshots show the assembled pieces at identity transforms and the final branding within the viewport. A faint middle-slice antialias seam was removed by clipping only the crossbar, then rechecked in the final render.

Production Chromium with autoplay explicitly permitted reported an audio duration of 4 seconds and a native `animationend.elapsedTime` of exactly 4; tap-to-pause measured 502.6ms. Returning visits and reduced-motion visits made zero startup-audio requests. Browser autoplay restrictions are unchanged. A four-second video preview was rendered from the final application DOM/CSS with the actual audio. Changes remain local; no deployment or remote CI claim.

## Six-second duration revision — 2026-10-31

At the user’s request, the complete assembly timeline is stretched proportionally to six seconds. The supplied cue uses 17.6–23.6 seconds at original speed, with a fade during the final 200ms. Audio cutoff is six seconds; the hydration-independent fallback is 6.4 seconds. The once-per-session policy, logo geometry, and 500ms tap delay remain unchanged. Five updated regression expectations failed against the four-second implementation before changing production code.

Six-second verification: Node 22 `npm run typecheck`, `npm run lint` (27 existing warnings, 0 errors), `npm test` (329 files / 2828 tests), `npm run build`, and `git diff --check` passed. The design detector reported no findings. Chromium with autoplay permitted reported audio duration 6 seconds and native animation completion at exactly 6 seconds; skip delay measured 501.6ms. Session reload and reduced-motion bypass requested no audio. Changes remain local.


## Reference choreography revision — 2026-10-31

Compared the supplied recording frame by frame from 17.5–22.5 seconds. The previous version moved and stretched separate logo slices across the screen; the reference instead builds a ribbon field, reveals a large negative-color e, spins/zooms through a color cut, and turns the two arcs together before inserting the bar. Rebuilt only that visual sequence. The three shared BrandMark slices now share one rotor, preserve circular proportions, and use clip masks for the reveals. The mark remains centred until its final move above the wordmark. No new runtime dependency. The 6-second audio and existing dismissal behavior are unchanged.

Motion budget: one six-second startup sequence, CSS transforms, opacity and simple inset masks; no looping, filters, or frame-by-frame JavaScript. Two deliberate palette cuts carry the transition. The reduced-motion path bypasses the whole decorative intro.

Regression first: `scripts/check-startup-motion.js`, run through Playwright CLI on the live application, failed at the blue-on-yellow reveal against the previous implementation; its captured state also showed the crossbar stretched horizontally. It samples the rendered application DOM/CSS in an isolated document to avoid hydration/network timers, checks color phases, circular proportions, shared arc rotation, settled alignment, six-second duration, and viewport fit at desktop, phone, and short landscape sizes. Run it after opening the current local app: `playwright-cli run-code --filename scripts/check-startup-motion.js`. Existing DOM/audio tests continue to cover the live interaction lifecycle.

Final verification for the choreography revision: Node 22.23.3, existing lockfile-installed dependencies reused. `npm run typecheck`, `npm run lint` (0 errors, 27 existing warnings), `npm test` (329 files / 2828 tests), `npm run build`, and `git diff --check` passed. The focused intro/audio suite passed all 43 tests. The browser motion regression passed all nine sampled states across 1200×800, 390×844 and 667×375. Inspected the rendered sequence and mobile/landscape frames with the actual local font loaded; final branding fits and moving arcs remain circular. Impeccable detector: no findings.

A separate live Chromium run with autoplay explicitly permitted reported six-second audio, native animation completion at exactly 6 seconds, and tap-to-pause at 502.3ms. Returning and reduced-motion visits made zero startup-audio requests. Browser autoplay permissions remain unchanged. Rendered a 180-frame, 30fps, six-second preview using the application markup/CSS and original local cue; preview artifacts stay outside the repository. Changes remain local; no push or deployment.
