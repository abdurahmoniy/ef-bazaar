# Mobile UX changes — verification and rollout

Implemented 19 September 2026 in the frontend and payment-service working trees. Production has not been deployed.

## Implemented

- Responsive optimized listing images and gallery thumbnails; full original only when opening the lightbox. Visible titles, platform, strength, division and notable players. Existing unknown linked-service values never receive an unlinked badge.
- Mobile sorting, 44px filter/chip controls, inline horizontal gallery gestures with vertical/multitouch guards and click suppression. Search text input accepts typing instead of opening filters. Existing marketplace scroll/query restoration retained.
- No speculative prefetch for listing cards and navigation/filter links. Existing private session cache boundaries retained. Browser zoom enabled. Reduced motion across transitions. Listing-specific loading skeleton. Pending authentication keeps neutral profile copy and protected destination URLs.
- Support control remains in normal document flow on mobile to avoid covering actions/content. Referrals and partner panels follow primary tasks.
- Chat 404 proposal lookup correctly means no accessible proposal (confirmed in backend controller). Other failures show retry, keep last-good resources, pause hidden/offline polling, stop automatic permanent-error requests and retry transient errors at 30 seconds. Proposal mutation generations prevent old reads overriding new create/accept results. Text drafts persist per viewer/chat within the tab session, separate from editing, and older successful sends cannot erase newer drafts.
- Listing form requires explicit linked/unlinked answers on Mobile. Migration does not reinterpret ambiguous old false defaults as confirmed answers. Photo formats/8MiB/10-photo limits are visible. Mixed selection retains valid files and names rejected files. Restored drafts retain text/price but restart at photos with explanation. Final validation selects first invalid step; duplicate submission is guarded.
- Mailbox counts use allocated/limit order correctly and distinguish owned mailboxes from active-trade assignment. Profile identity rows wrap and completed connections show completed copy.
- Wallet custom amount field is full width on mobile. Balances below the 10,000-so‘m withdrawal minimum get an explanation before card fields. History exposes transaction reference IDs and links associated escrow entries to their trade chat through an authenticated participant-only resolver. The payment-service response adds a nullable tradeId derived from existing canonical ledger keys, without database changes or exposing internal keys. Timing/guarantee copy describes actual process.

## Verified

- Full suite: 184 files, 1,467 tests passed.
- Payment service: 18 DTO unit tests and 3 PostgreSQL-backed wallet integration tests passed, including query projection and caller isolation. Tested an identical temporary service copy with JDK 21 and Docker API 1.44 (the test library default API was too old for local Docker).
- TypeScript: passed.
- ESLint: zero errors, 25 existing warnings (primarily native image usage and pre-existing hook/import warnings).
- Production compilation: `npm run build -- --webpack` passed. Default Turbopack build could not bind an internal worker port in the execution environment, including on the escalated attempt. No production build configuration was changed to hide that limitation.
- Independent spec and code reviews: no outstanding material findings after fixes and regression tests.
- Local Chrome at 390px: readable card titles/facts, optimized image URLs, sorting works; wallet amount layout and zero-balance withdrawal explanation; profile tasks before promotions and completed connections.
- Local Chrome at 320px: no horizontal document overflow; sort menu stays inside viewport (208px menu within 310px content viewport, x86–294).
- Local six-image listing: main image and thumbnail sources all use `/_next/image`; next control advances selection.
- Production optimizer diagnostic: same public listing image returned HTTP200, 384×177, 10,715 bytes versus previously measured original 289,671 bytes. This verifies optimizer availability, not post-deployment page performance.

## Deployment and remaining external checks

1. Deploy through the project's normal release process. Repeat cold/warm mobile loading measurements after deployment. Original audit: one Slow4G/cache-disabled run had DOM ready1.68s, load event25.72s, 4.61MB/75 requests by ~22s. These are not LCP/INP measurements and should not be compared to local development timings.
2. Image optimizer already supplies public seven-day caching, ETag, and Next's image cache. Cloudflare still returned DYNAMIC during the production probe. No CDN account/control is available here. If adding a CDN rule, restrict it to confirmed public image responses; preserve width/quality/source query parameters and negotiated image format in the cache key. Do not cache authenticated HTML, API, chat, wallet or profile responses publicly. Validate JPEG/WebP/AVIF negotiation and repeat-hit headers before rollout.
3. Deploy the payment-service contract extension with the frontend to enable trade links. The frontend tolerates older responses without tradeId and still shows reference IDs; no database migration is required. The resolver rechecks authentication, trade identity and buyer/seller membership before opening a chat.
4. Physical iPhone: two-finger pinch/pan-to-swipe transition and real software-keyboard occlusion still require direct device testing. Mirroring controls cannot supply simultaneous touches and use the Mac keyboard. JS interaction regressions cover inline single-touch swipe, vertical-scroll and multitouch guards; they do not certify physical gestures.
5. No messages, listings, withdrawals or deposits were submitted. No deployment/CDN settings were changed. The original production test listing draft remains unpublished with sample values.
