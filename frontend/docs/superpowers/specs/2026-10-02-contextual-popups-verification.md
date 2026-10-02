# Contextual popups — verification

This records local verification of `codex/contextual-popups` before publishing the branch. No production campaign or deployment was performed; the original checkout was preserved.

## Required checks

- Node **22.23.3**: `npm ci --no-audit --no-fund` passed (581 packages). Secondary yarn lockfile rewrite from npm installation was restored; dependency manifests are unchanged.
- `npm run typecheck` passed on the final code.
- `npm run lint` passed with **0 errors, 23 existing warnings**; no new popup warnings.
- `npm test` passed: **243 files, 2,015 tests**.
- `npm run build` passed with the configured **Next.js 16.2.9 Turbopack** production builder. `/admin/popups` is included. Temporary fixture route is removed.
- Java **21**: `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests` passed (unchanged shared dependency prerequisite).
- Marketplace: `mvn -B -ntp clean verify -DargLine=-Dapi.version=1.44` passed. Docker 29 required the documented Docker API compatibility option. **665 Surefire tests + 124 Failsafe integration tests; zero failures, errors, or skipped tests.** The 17 popup integration cases exercise real HTTP/security/PostgreSQL and all Flyway migrations.
- `git diff --check` passed. No applied migration changed; V75 only adds campaign/delivery tables and seeds no active campaign.

## Development and review

Meaningful tests were run red before production changes. Independent specification and quality reviews completed; all findings were reproduced and fixed, including query-only navigation, sensitive profile tabs, event expiry during slow claims, global polling rate, publication URL cleanup, same-copy empty search changes, and stale admin list responses. Keyboard focus restoration has a regression test.

## Browser validation

Used the actual frontend components in an isolated localhost fixture API, with no production users or communications. Tested draft creation, preview, explicit publish, automatic delivery after dwell, dismissal, display/dismissal statistics, and pause. Preview left statistics unchanged. Desktop preview and a **390 × 844** phone viewport were inspected; dialog width **366px**, page width **390px**, no horizontal overflow. Keyboard focus returned to the preview button after dismissing. Test API and preview servers were stopped and the temporary route removed.

Browser screenshots are retained in the Codex task artifacts, outside the source tree.

## Limitations

The backend combined suite emitted a Hibernate/Hikari shutdown warning after successful tests: a cached JPA context attempted schema teardown after its Testcontainer stopped. All reports completed, the process exited 0, and Failsafe timeout was false. The isolated existing JPA test passed; this is recorded rather than characterized as definitively pre-existing.

These local results are not remote CI evidence; consult the GitHub status for the published commit. The CI workflow runs for pull requests, while image builds run on main. The live admin/customer flow still requires deploying the frontend and marketplace changes with V75. No separate worker or new deployment environment variable is needed. All campaigns start as drafts.
