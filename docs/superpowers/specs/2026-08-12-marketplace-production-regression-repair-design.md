# Marketplace Production Regression Repair Design

**Date:** 2026-08-12  
**Status:** Approved for implementation  
**Scope:** `/marketplace` loading, listing cards, Telegram Mini App authentication, and Telegram-backed listing media

## Problem statement

Production evidence shows four connected regressions:

1. The marketplace route skeleton does not preserve the real shell or listing-card geometry. The header disappears during route loading, the desktop sidebar is represented by one oversized block, and the listing placeholders do not match the final cards.
2. Telegram Mini App authentication can remain idle when `tgWebAppData` is not present during the component's single initial read. Backend failures redirect to `?error=...`, but the login page currently ignores that error, so recovery is unclear.
3. Listing media stored as Telegram `file_id` values is valid through the direct `/bot/photo/{fileId}` proxy, but the Next image optimizer rejects the same source as an invalid image.
4. Listing cards expose too much information. The current price, player summary, META, title, division, team strength, valuable-card count, Android/iOS coins, transfer safety, and date compete for attention.

## Verified root-cause evidence

### Telegram listing media

For a production listing, the direct URL:

`/bot/photo/AgAC...`

returns HTTP 200, `Content-Type: image/jpeg`, and a valid 1397×756 JPEG. The equivalent production request through `/_next/image?url=%2Fbot%2Fphoto%2F...` returns HTTP 400 with `The requested resource isn't a valid image.` The stored value is a Telegram `file_id`, not a message ID; the backend upload flow already persists `fileIds()` correctly.

The failure boundary is therefore the Next optimizer, not Telegram storage, the bot proxy, or listing normalization.

### Telegram Mini App authentication

`TelegramWebAppAutoLogin` sets its one-shot guard before reading launch data. If neither the URL hash nor the SDK's `WebApp.initData` is available at that instant, the effect exits and never checks again. In addition, the `/api/telegram-webapp` route redirects failures to `/auth/login?error=...`, while the login page accepts only `from` and never renders the error.

The existing context-sensitive cookie behavior remains: native top-level WebViews use `SameSite=Lax`; Telegram Web iframe uses production `SameSite=None; Secure`.

### Loading geometry

`app/marketplace/loading.tsx` renders only bare browse placeholders. Because the actual page owns `MarketplaceShell`, the route fallback temporarily loses the real header/search/bottom navigation. The skeleton card also represents the old multi-row content rather than the approved compact card.

## Approved buyer-facing card hierarchy

The feed card contains only:

- listing image;
- price;
- exchange type;
- linked platform brands, conditionally;
- Android and iOS eFootball coin balances;
- the independent favorite action;
- the sold overlay when applicable.

Everything else moves to the detail page:

- player names and player remainder;
- META state;
- listing title/description;
- division;
- team strength;
- valuable-card count;
- match score/breakdown;
- transfer-risk copy;
- listing date.

### Conditional linked-platform rendering

- Render the Google Play brand only when `has_google_play_link` is exactly true.
- Render the Apple brand only when `has_game_center_link` is exactly true.
- Do not render a disabled, muted, crossed-out, or “not linked” brand.
- If neither service is linked, omit the entire linked-services fact block. The coin fact block expands to the available width.

This keeps absence quiet and makes every visible brand a positive, trustworthy signal.

### Coin asset

Use a local, transparent SVG traced from the user-supplied flat eFootball coin mark. The flat mark is selected over the supplied 3D coin because its circular `e` symbol remains legible at 18–20px. Each platform balance includes:

- the same eFootball coin icon;
- an explicit `Android` or `iOS` label;
- a tabular numeric value, including zero.

The asset is bundled locally; no third-party hotlink is used. Google Play and Apple marks are also local SVG assets/components with accessible text labels.

## Responsive card layout

Cards use one semantic vertical structure at every breakpoint. The results container controls only column count:

- small phone: one column;
- large phone/small tablet container: two columns when cards remain readable;
- tablet/desktop result container: up to three columns;
- explicit list view may remain one column, but it uses the same information order rather than a separate semantic branch.

The card body uses:

1. price and exchange type;
2. a compact fact area containing the conditional linked-services block and the coin block.

At very narrow card widths, fact blocks stack instead of shrinking text or overflowing. All interactive targets remain at least 44×44px. Images retain a fixed 4:3 reserved box to prevent layout shift.

## Skeleton design

The route loading state preserves the marketplace shell instead of showing a disconnected bare grid. Header/search/bottom-navigation geometry stays stable while browse content loads.

The listing skeleton is generated from the same layout contract as the real card:

- 4:3 media block;
- one price/exchange row;
- one compact fact area;
- responsive columns identical to the final results grid.

It does not render fake title, player, or metric lines. Motion is disabled under `prefers-reduced-motion`. The conditional linked-services block cannot be known during route loading, so the skeleton reserves the stable two-fact layout; loaded cards may collapse to one fact block without changing media or outer card width.

## Media delivery design

`ListingCardMedia` continues using `next/image` for sizing, lazy loading, `fill`, `sizes`, alt text, and same-size fallback. For same-origin Telegram proxy URLs beginning with `/bot/photo/`, it sets `unoptimized` so the browser requests the verified image proxy directly. Other image sources remain optimized.

The failure fallback remains the same 4:3 branded surface. A change from one `src` to another resets the failure state. Tests cover both the direct-proxy flag and fallback lifecycle.

## Telegram authentication design

Mini App authentication becomes a bounded state machine:

1. Read `tgWebAppData` from the launch hash immediately.
2. If absent, read `window.Telegram.WebApp.initData`.
3. If still absent but real Telegram launch context is present, wait for a short bounded SDK hydration window and re-check without blocking ordinary browsers.
4. Submit exactly once when valid non-empty init data appears.
5. Clear only Telegram launch parameters after capturing them; preserve unrelated route hashes and the safe post-login target.
6. If launch data never appears, remove the blocking state and show a concise retry/reopen action instead of silently remaining idle.

The top-level form POST remains because it is required for reliable cookie persistence in native Telegram WebViews. The server route continues sanitizing `from`, applying native/iframe cookie policy, and returning a 303.

The login page accepts a safe `error` code and displays user-facing Uzbek recovery copy without exposing backend diagnostics. It preserves `from` across retry. Authentication failures are logged server-side with a bounded code/status only; init data and tokens are never logged.

## Accessibility and semantics

- Price remains the strongest text hierarchy.
- Exchange type is text, not color-only.
- Brand marks include visible service names; they are not icon-only.
- Coin items expose `Android coin: N` and `iOS coin: N` semantics.
- Sold state remains a textual status overlay.
- Favorite remains a separate 44×44 button and never triggers card navigation.
- Skeletons are announced once as a loading region and their decorative children are hidden from assistive technology.
- Reduced motion, focus rings, safe areas, and Telegram Back behavior remain unchanged.

## Testing strategy

### Unit/component regressions

- Telegram media proxy URLs opt out of Next optimization; other URLs do not.
- Image failure state resets when `src` changes.
- Card output contains only approved feed data plus availability/action state.
- Google and Apple brands render only for exact true values.
- Neither-linked state omits the whole linked-services block.
- Android/iOS coin values retain zero and use the eFootball coin asset.
- Skeleton structure mirrors the compact card and responsive grid contract.
- Mini App init data available immediately submits once.
- Delayed SDK init data submits once within the bounded wait.
- Ordinary browser context never polls indefinitely or submits.
- Auth failure code produces safe Uzbek recovery copy and retains `from`.
- Native and framed cookie policies remain covered.

### Integration/manual verification

- Production-like direct `/bot/photo` media renders without a `/_next/image` request.
- Telegram Mini App auto-login is verified with immediate and delayed SDK fixtures.
- Responsive matrix: 320, 360, 390, 430, 768, 1024, and 1440px plus short landscape.
- No horizontal overflow; all interactive targets are at least 44px.
- Skeleton and loaded card preserve the same shell, media aspect ratio, card width, and column layout.
- Light/dark themes, reduced motion, keyboard focus, sold cards, zero coins, one linked service, both linked services, and neither linked service are checked.

## Out of scope

- Changing Telegram bot upload/storage architecture.
- Migrating existing `media_message_ids` database values; current values are already valid `file_id` strings.
- Removing detail-page information.
- Redesigning marketplace filters, Dream Team matching, or detail actions.
- Adding new platform-link fields beyond Google Play and Game Center.

