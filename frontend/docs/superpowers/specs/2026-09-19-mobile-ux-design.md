# Mobile UX audit implementation

The user approved implementing all recommendations in the production mobile audit.
Preserve the existing visual language, Uzbek copy, backend contracts, and account privacy.

## Outcomes
- Marketplace: visible titles and meaningful facts, accessible controls, nearby sorting, compact referral placement, smaller optimized images, deliberate prefetch, preserved navigation.
- Gallery: inline swipe without interfering with vertical scroll or pinch, discoverable zoom, image loading/failure feedback, reduced motion.
- Chat: investigate proposal 404 semantics, distinguish failures from absence, bound polling, pause hidden/offline work, retry visibly, preserve message drafts and keyboard-aware composer.
- Listing: explicit linked/unlinked answers, transparent image limits/rejections, resilient draft restoration, existing fee preview and submit guard retained.
- Profile: accurate mailbox capacity and occupancy language, contextual verification instructions, useful tasks before promotions, readable linked accounts.
- Wallet: readable amount entry, early insufficient-balance explanation, available/frozen balances, transaction references and valid trade links.
- Shared: allow browser zoom, stable auth loading, destination-specific skeleton, accessible pressed/loading states and support placement.

## Limits and verification
No production deployment, financial action, published listing, or message is needed to implement these changes. CDN rules outside this repository require deployment/operator action. Real simultaneous multitouch and normal iPhone software keyboard cannot be certified through single-pointer Mirroring; explicitly retain these manual checks. Run targeted behavior tests, full suite, typecheck, lint/build and local browser checks where available. Avoid changing backend semantics without evidence.
