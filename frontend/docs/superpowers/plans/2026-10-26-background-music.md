# Background music implementation plan

**Goal:** Play an admin-managed YouTube playlist across site navigation. The user explicitly selected YouTube links without a visible video player after being informed of YouTube's visible-player requirement, then requested random playback with no visitor controls.

**Architecture:** Marketplace owns track metadata and admin permissions. YouTube IFrame API performs playback without extracting, downloading, or proxying audio. A single root-layout player survives navigation. No bot/storage changes, new events or consumers. Hidden playback is not a supported YouTube integration under its published developer policies and may be blocked by the provider or browser.

**Contract:** `GET /api/v1/music` returns enabled tracks ordered by `sortOrder`, `createdAt`, `id`. `GET/POST /api/v1/admin/music`, `PUT/DELETE /api/v1/admin/music/{id}` require ADMIN. JSON write body: `{title,artist,youtubeUrl,sortOrder,enabled}`. Response: `{id,title,artist,youtubeVideoId,sortOrder,enabled}`. Titles max 120, artist max 120, order 0..10000. Accept https/http YouTube watch, youtu.be, shorts, embed, live URLs with exact permitted hosts and 11-character video IDs; never fetch user-supplied URLs server-side. Disabled tracks remain available to admins. Empty playlist is silent.

**Visitor behavior:** No visible player or pause/volume controls. Fixed low volume (20%), try autoplay and retry on pointer/keyboard interaction when blocked. Shuffle enabled tracks without adjacent repeats; reshuffle after each cycle. Skip unavailable videos with a bounded attempt count, pause on hidden tab and admin/chat/support routes. Resume on return. Refresh playlist every minute while visible and on focus. Preserve current track through metadata refreshes. Empty initial playlist; admin adds the initial links. No visitor preference persistence.

## Work and verification

- [x] Backend tests first: anonymous playlist, non-admin mutation rejection, CRUD/persistence/filter/order, invalid title/order/YouTube URL. Observe failures before adding music package, V85 migration and public security matcher. Use Java 21.
- [x] Frontend client/admin tests first: JSON creation, metadata save, deletion and errors. Add `src/lib/music.ts`, `src/components/admin/admin-music.tsx`, `/admin/music`, and sidebar entry.
- [x] Player tests first: no controls, blocked autoplay retry, low volume, navigation continuity, shuffle/no repeat, failed media, hidden tab/routes, empty/updated playlist; YouTube script loading errors. Add `src/components/music/`; do not add media proxy routes.
- [x] Update frontend and marketplace READMEs. Preserve all pre-existing local changes; no commit or push.
- [x] Review feature diff, `git diff --check`; Node 22 `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Java 21 shared outbox install followed by marketplace `mvn -B -ntp clean verify` with Docker; inspect Surefire/Failsafe reports. Review final integration in browser.

## Final verification — 2026-10-26

- Node 22.23.3: `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all exit 0. Full Vitest: 318 files, 2,746 tests. ESLint: 0 errors, 27 pre-existing warnings, none in the feature files. The sandboxed build stalled and was terminated; the identical standard build passed with sandbox/network access restored. No alternate bundler or skipped build phase.
- Java 21.0.10: shared outbox `mvn -B -ntp -f ../libs/outbox/pom.xml install -DskipTests`, then marketplace `mvn -B -ntp -Dapi.version=1.44 clean verify` exit 0. Docker 29 requires that local API compatibility property. Surefire: 716 tests; Failsafe: 255 tests; zero failures/errors/skips. MusicIT: 36 cases.
- Review found and tests reproduced two issues before fixes: removed modal video could leave music paused; a failed YouTube video could cause the last audible track to repeat. Both regressions now pass; independent final review approved.
- Playwright on the final production build, with a browser-only fixture playlist and Google's public YouTube API example: hidden host, zero controls, actual YouTube state PLAYING and volume 20. Client navigation `/` → `/help` retained iframe `widget2` and advanced playback from 47.86s to 48.28s. No real catalog data was written. The local HTTP preview logged an unrelated HTTPS login-prefetch error and Telegram desktop SDK warnings; no music CSP error.
- `git diff --check` passed. Changes remain local; no commit, push, deployment, or remote CI run.
