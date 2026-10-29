# Auth login redesign implementation plan

**Goal:** Bring `/auth/login` into the shared wide efBazaar layout with a clearer sign-in hierarchy and responsive light/dark controls.

**Architecture:** Preserve the server page's verified-user redirect and the existing provider components/server actions. The auth layout owns shared-width header, safe areas, footer, and theme control. The login page owns a two-column introduction/sign-in composition; `LoginForm` owns progress, authentication errors, and widget-render recovery. No backend, cookie, redirect allow-list, or provider authorization contract changes.

**Tech stack:** Next.js App Router, React, shared Tailwind tokens/components, Vitest/jsdom, real-browser viewport checks.

## Direction contract

**THESIS:** Make choosing a sign-in method the obvious next action. Replace the isolated small card and large blank margins with a deliberate shared-width layout.

**OWN-WORLD:** Inherit the app's Inter font, efBazaar logo, semantic blue/gold colors, light/dark themes, rounded controls, and 1280px content rail. No new illustration or palette.

**STORY:** The visitor understands that a first sign-in creates a profile, chooses an available provider, and returns to the existing destination. Browsing the marketplace remains available without signing in.

**FIRST VIEWPORT:** A 56px inner header places the official small logo at left and back/theme controls at right. Desktop content pairs a restrained marketplace introduction with a roughly 440px sign-in panel. Below 768px, sign-in leads and the introduction follows. Footer help and marketplace links remain reachable.

**FORM:** Existing-world extension in Operate mode, implemented directly from the user's request and established components; no replacement identity or comp generation.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Tasks

- [x] Add `src/app/auth/login/login-page.test.ts` for one main heading, available-provider copy, shared theme control, and signed-in redirects. Add `login-form.test.ts` for visible initial errors, render failure recovery, forwarded `from`, and accessible pending feedback. Run the focused tests and confirm the missing behaviors fail.
- [x] Update `src/app/auth/layout.tsx` with the shared width, safe areas, logo, theme toggle, skip link, and footer. Update `login/page.tsx` and a scoped CSS module for the desktop/mobile composition. Keep all provider configuration on the server.
- [x] Update `login-form.tsx` to surface the existing Telegram `onRenderIssue` callback, retry by remounting the widget, and announce pending/errors. Simplify the existing Telegram account-switch disclosure after provider actions. Preserve server actions and their error/redirect behavior.
- [x] Rerun focused tests. Verify actual desktop, 13-inch laptop, tablet, and 390px/320px mobile renders in both themes; check keyboard navigation, details, and loading/failure states without authenticating a user.
- [x] Run Node 22 `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` on final code. Inspect the diff and run `git diff --check`; leave changes local and preserve unrelated work.
- [x] Run the design detector once, obtain a fresh independent finish review, record the resulting design and verification evidence, and leave a useful login preview open.

## Known provider constraint

The screenshot's `Bot domain invalid` is rendered inside Telegram's cross-origin iframe. Changing the host's visual layout cannot authorize a new domain. Preserve the real widget; document the external domain setup requirement and do not fake a successful login or inspect cross-origin contents. The existing missing-widget callback can provide recovery when the script/iframe fails to render.

## Verification evidence

- The new regression tests first failed on missing page semantics/theme, provider-aware copy, accessible error/progress feedback, and missing-widget recovery. All eight pass after implementation. A subsequent keyboard-order regression ensured sign-in leads the DOM on phones; progress is outside the busy provider subtree so it can be announced immediately.
- Final checks under Node 22: `npm run typecheck` exit 0; `npm run lint` exit 0 with the same 27 existing warnings; `npm test` exit 0 (324 files / 2,774 tests); `npm run build` exit 0 using the default Next.js production bundler. The test suite retains its existing jsdom navigation diagnostic; build retains existing edge-runtime/dynamic-sitemap diagnostics.
- Browser captures and geometry cover both themes at 1470×820, 1366×768, 1280×720, 1024×768, 768×1024, 640×900, 390×844, and 320×740. No horizontal overflow or clipped controls. Resting laptop panel bottoms are 660px, 634px, and 629px at the first three sizes. This is viewport emulation, not physical-device testing.
- Geometry is measured after a settled viewport capture and before the full-page screenshot; this reconciled a resize-paint timing discrepancy identified by review. The tablet panel bottom is 758px in both themes. The initial inconsistent measurement file was replaced.
- First-Tab skip-link visibility, remembered dark mode across reload, light/dark switching, native account-switch disclosure, and the real allow-listed rate-limit error were checked in the browser. Full-page captures start at the document top. Authentication was not completed with a real account; the preview origin is rejected by Telegram's existing domain configuration. Provider callbacks, destinations, errors, and the already-signed-in redirect are covered by regression tests and the full existing suite.
- Source design detector: no findings. Independent full finish review of all 16 refreshed size/theme captures, expanded error state, source, and behavior evidence: **Ship**, no material findings attributable to this redesign.
- `git diff --check` passed. Dependency inputs/runtime remain unchanged from the prior Node 22 locked installation, so no reinstall was needed. Existing landing and unrelated development-origin changes were preserved. No commit, push, deployment, or remote CI run was requested; changes remain local.
