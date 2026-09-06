# Listing advertising implementation plan

> Use subagent-driven-development for independently owned work, followed by independent review. User authorization is already present.

**Goal:** Make channel advertising understandable and easy to reach on phones without accidental purchases.

**Architecture:** Reuse a single protected advertising route, selected ChannelCard objects, current APIs, wallet return links and Telegram shell primitives. Create/edit saves remain separate from ordering.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, Vitest.

- [x] Root: reproduce filtered-selection total bug; redesign ChannelPicker and helper totals with persistent selected objects, price units, removable selection, retry and disabled behavior. Test stale search responses and selection persistence.
- [x] Purchase agent: implement ListingChannelPosts choose/review/receipt states, fresh price+wallet checks, explicit repost, mutation lock, honest accepted/uncertain result and confirmed history. Test no charge on review, shortage/change blocking, duplicate taps and recovery.
- [x] Navigation agent: implement protected advertise route and href/query helper, owner-only active detail/Profile actions, no favorite exposure. Test guest/nonowner/sold gates and query preservation.
- [x] Root: integrate optional create advertising and save-before-advertise editing. Remove channelIds from creation payload and the purchase widget below edit wizard. Verify destination/selection/labels and no auto-order.
- [x] Verify focused tests, entire suite, types, lint and production build sequentially where generated types are involved. Independent reviews must cover payment ambiguity, state ownership and mobile controls.
- [x] Inspect 360/390px, tablet, short-height and desktop previews; verify measured footer clearance, dark readability, channel search, totals, wallet return and final action placement with fake local data only.
- [x] Record verification and backend limits; no deployment or real payment/publication claims.

## Final verification — 2026-09-07

- Full suite: **947 tests across 119 files passed**.
- Production build and standalone TypeScript check: passed, run sequentially to avoid generated-type races.
- Global ESLint: **0 errors, 28 existing warnings**. Changed advertising components/helpers introduce no new warnings; existing listing-form image warnings remain.
- `git diff --check`: passed.
- Independent reviews: no outstanding actionable findings after fixes for price precision, synchronous action/status locking, and mobile placement.
- Local production-build previews: 360×740, 390×844, 390×420, 768×1024, 1280×900; light/dark, long channel names, search persistence, live repricing, shortfall prefill/return, ambiguous response without retries, empty catalogue, owner/nonowner/guest/sold/favorite access, and save-before-advertise editing.
- Final browser check confirms supplied channel IDs open price review directly and leave the sample order count at zero.
- Safe-area/native MainButton/Back integration uses SDK-mock tests and existing Telegram shell primitives. Physical Telegram device testing, actual keyboard behavior, real payments/publication and deployment are not claimed.

See the paired design document for the browser evidence and backend follow-ups: price quote enforcement, request idempotency, explicit order/funding status and resuming pending orders.
