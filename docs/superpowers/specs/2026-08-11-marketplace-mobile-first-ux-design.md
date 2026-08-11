# Marketplace Mobile-First UX Design

**Status:** Approved in conversation on 2026-08-11

## Context

The `/marketplace` page is the primary browsing surface for eFBazaar inside
ordinary browsers and Telegram Mini App WebViews. It already supports public
search, detailed account filters, sorting, grid/list views, META-card search,
free-text player search, one saved Dream Team, fuzzy player matching, and URL
deep links.

The current mobile interface exposes too many controls at once. A sticky header
and full-width search are followed by a title/count row that also contains the
META trigger, sort menu, and two view buttons. A second row adds the detailed
filter trigger and horizontal quick filters. On a 320–390px Telegram WebView,
these controls occupy much of the first viewport before the buyer sees a
listing.

The default two-column phone grid also forces price, title, metrics, warnings,
match state, and favorite controls into cards as narrow as roughly 140px. Several
interactive targets are below 44px, card whitespace is not clickable, active
filters are difficult to inspect or remove, and top-bar search currently drops
unrelated filter state. Telegram viewport support exists, but native back,
theme, inset, and overlay behavior are incomplete.

This design turns `/marketplace` into a progressive, adaptive marketplace feed:
listings first, compact controls, readable player-first cards, predictable URL
state, and Telegram-native behavior.

## Goals

- Make marketplace browsing easy with one hand on 320px and wider Telegram
  WebViews.
- Adapt layout automatically to available content width while retaining a user
  view override.
- Keep search, general filters, player matching, sorting, pagination, and view
  state composable and shareable through the URL.
- Prioritize price and matched or valuable players on every listing card.
- Make general filtering fast for common choices and deliberate for detailed
  multi-field changes.
- Preserve the META, player-search, and single Dream Team matching behavior.
- Bring sheet navigation, safe areas, theming, touch targets, and feedback in
  line with Telegram Mini App expectations and WCAG AA.
- Provide useful loading, empty, and recoverable error states without exposing
  backend diagnostics to buyers.

## Non-goals

- Redesigning listing detail, listing creation, profile, chat, tournaments, or
  admin pages beyond shared shell behavior required by `/marketplace`.
- Changing fuzzy-match scoring, the 1–10 strictness contract, canonical player
  identity, META administration, or singleton Dream Team persistence.
- Adding a new backend filter or count endpoint. Result preview uses the existing
  listing browse endpoint with a minimal page size.
- Rebranding eFBazaar or replacing its current blue-and-gold visual identity.
- Adding infinite scrolling. Existing pagination remains, with improved mobile
  controls and state restoration.
- Adding a new analytics or experimentation system.

## Validated Product Decisions

- Responsiveness is the governing principle.
- The default view adapts automatically, and users also receive a view control.
- Quick filters and sorting apply immediately.
- Detailed filters wait for an explicit results CTA.
- Search operates within current filters instead of resetting them.
- The full search field collapses after downward scrolling to preserve viewport
  space.
- Matched or valuable players are the most prominent card information after
  price and media.
- META, player search, and Dream Team remain together behind a separate,
  prominent `O‘yinchilar` action.
- The chosen direction is the progressive adaptive marketplace rather than an
  always-single-column feed or a permanently dense two-column catalogue.

## Experience Principles

The design follows a flat, touch-first app style with restrained elevation,
clear surface boundaries, and immediate press feedback. The existing semantic
blue/gold theme remains the brand source of truth; no unrelated purple/rose
palette is introduced. Color supports hierarchy but never carries meaning by
itself.

Core rules:

- Listings appear as early as possible in the first viewport.
- Every primary touch target is at least 44×44px with at least 8px between
  adjacent independent controls.
- CSS container queries and intrinsic sizing handle layout before JavaScript
  measurement is considered.
- No page-level horizontal scrolling is allowed. Horizontal overflow is limited
  to clearly bounded, optional chip rails.
- Motion explains state changes, stays between 150–300ms, and is removed when
  `prefers-reduced-motion` requests it.
- Mobile copy is direct Uzbek product language, not implementation terminology.

## Responsive Page Structure

### App header and search

The marketplace opens with the existing app identity row and an expanded search
field. Once the user scrolls downward beyond a small threshold, the search field
collapses into a 44px search action and the results move upward. Scrolling upward,
tapping the search action, focusing search through keyboard navigation, or
returning to the top expands it again.

The inner search controls animate with transform and opacity. After that short
transition, the header snaps once to its compact block size so the results
actually reclaim the row; it does not continuously animate height during
scrolling. Scroll-direction hysteresis prevents jitter, and search never
collapses while its input or overlay owns focus. Short landscape viewports start
in the compact header state. The optional account-verification notice
participates in normal document flow rather than consuming permanent sticky
height.

Submitting search changes only `q`, deletes `page`, and preserves quick filters,
detailed attributes, player-match criteria, strictness, sorting, and explicit
view preference.

### Mobile action toolbar

The primary mobile toolbar contains:

- `Filtrlar`, with the active general-filter count;
- `O‘yinchilar`, with the selected-player count;
- sorting;
- view selection.

At wider widths, controls may show icons and labels. At narrow widths,
`Filtrlar` and `O‘yinchilar` retain visible text while sort and view use familiar
icons with explicit accessible names and current-value text nearby. The row must
fit at 320px without shrinking hit targets below 44px.

The results count and current sort label sit directly beneath or alongside the
toolbar according to available width. Applied filter chips follow only when at
least one removable criterion exists.

### Automatic and manual view behavior

The absence of a `view` query parameter means `Auto`. Explicit overrides remain
`view=list` and `view=grid` for backward compatibility and shareability. The view
control exposes `Auto`, `Ro‘yxat`, and `Katak`; it is a compact popover or sheet
on narrow screens and may become a segmented control on desktop.

`Auto` is based on the results container, not a named device:

- when only one readable card fits, render one horizontal card per row;
- render two vertical cards only when both can retain at least 184px of inline
  space with a 12px gap (a results container of at least 380px);
- render three only when every card retains at least 224px (a results container
  of at least 696px), and cap the automatic layout at three columns.

An explicit list override remains one horizontal card per row. An explicit grid
override uses the greatest safe column count but never forces an unreadable
two-column layout. The override is therefore a layout preference, not permission
to violate the minimum card widths. The user's override is represented in the
URL; no hidden local preference may contradict a shared link.

The desktop layout keeps the persistent filter sidebar and adaptive results
area. The mobile bottom navigation remains, with content padding derived from
its actual height and safe-area inset instead of a fixed guess.

## General Filter Design

### Quick filters

Quick filters remain high-intent booleans such as `Savdolashish`, `Toza akkount`,
and `Faqat obmen`. Selecting one updates the URL immediately, resets `page`, and
preserves all unrelated state. Press feedback appears within 100ms, and route
pending feedback prevents the control from feeling unresponsive.

### Applied-filter summary

Every active criterion has a human-readable removable chip above results. The
summary covers price, platform, division, strength, coins, device-transfer
limit, exchange mode, safety links, valuable player, fuzzy player criteria, and
search text where appropriate.

Removing one chip deletes only that criterion and resets `page`. A secondary
`Barchasini tozalash` action removes all search and filter criteria while keeping
the current view preference. A separate `Auto ko‘rinish` action is unnecessary
because view is controlled by the view menu.

### Detailed filter sheet

The hand-built mobile dialog is replaced with the existing Radix dialog
foundation so focus trapping, focus return, Escape handling, modal semantics,
and background inertness are consistent with the player sheet.

Fields are grouped for progressive disclosure:

1. `Asosiy`: platform, price range, negotiable status, division.
2. `Akkount`: team strength, Android/iOS coins, exchange mode, valuable player.
3. `Xavfsizlik`: device-transfer limit, Google Play disconnected, Game Center
   disconnected.

The first group is open initially. The other groups retain visible summaries
and can be expanded without nested scrolling. Every input uses an associated
`label`, appropriate input mode, helper text where the constraint is not
obvious, and inline error placement.

The sheet owns draft values. Editing fields does not navigate. A 300ms debounced,
cancellable request calls the existing browse endpoint with `page=0&size=1` to
read `totalElements`. The sticky primary CTA reads `N ta e‘lonni ko‘rsatish` when
the preview succeeds. While loading it shows compact progress without changing
its size. If preview fails, the CTA becomes `Natijalarni ko‘rsatish`; applying
remains available because a preview failure is not a filter failure.

Draft validation runs before preview or apply. Price and numeric ranges require
minimum less than or equal to maximum, prices cannot be negative, and integer
and boundary rules follow the marketplace attribute definitions. Invalid fields
show inline cause-and-recovery copy, suppress the preview request, and keep the
apply CTA disabled until the draft is valid.

`Tozalash` clears only the sheet's general-filter draft. Applying rewrites the
general-filter parameters, preserves search/player/sort/view state, deletes
`page`, and closes the sheet after navigation begins.

## Player Filter Design

`O‘yinchilar` remains a separate marketplace-level action because it represents
a core buyer intent rather than another account attribute. Its sheet keeps three
tabs:

- `META` for zero-query discovery;
- `Qidiruv` for a named player;
- `Mening jamoam` for the single saved Dream Team.

META and search use the same multi-select inventory. Selected players retain
their real names, image, card type, rating, and canonical player identity when
the sheet is reopened. Generic `Karta #ID` labels are not shown to users.

The selection limit remains eleven distinct canonical players. Priority remains
available but is described as `Muhim o‘yinchi`; the UI states that it influences
ranking without implying that every priority card is mandatory.

The strictness slider retains the backend's 1–10 value. The primary label uses
plain-language bands:

- 1–2: `Keng qidiruv`;
- 3–4: `Moslashuvchan`;
- 5–6: `Muvozanatli`;
- 7–8: `Aniqroq`;
- 9–10: `Juda qat’iy`.

The exact minimum percentage and alternate-edition credit remain available as
secondary help, not the main instruction. The primary CTA explains the outcome,
for example `8 o‘yinchi bo‘yicha qidirish`.

The Dream Team tab automatically uses the one stored team and keeps its direct
`Jamoani tahrirlash` route. Signed-out users retain META/search access and a
clear login path for saved-team behavior. End-user empty states never expose an
admin route.

Applying or clearing player criteria preserves every unrelated marketplace
parameter and resets pagination.

## Listing Card Design

### Interaction model

The card is an `article` with one primary listing link covering its
non-interactive surface and one separate favorite button above that link. It
must not create nested interactive elements. Tapping media, price, title,
metrics, player names, safety summary, or whitespace opens the listing. The
favorite action is at least 44×44px and does not trigger navigation.

Pressed, focus-visible, disabled, and pending states are distinct without moving
surrounding layout. Hover is an enhancement for pointer devices, not a required
signal.

### Responsive variants

The horizontal narrow-screen card uses a fixed-aspect media area beside a
flexible information column. The vertical card uses a reserved 4:3 media area
above the same semantic content. Both variants share formatting and state
components so information does not diverge by viewport.

The information hierarchy is:

1. price;
2. fuzzy match summary when active, such as `8/11 mos · 82%`;
3. matched or valuable player names, prioritizing matched names;
4. division and team strength;
5. valuable-card count and coin balances;
6. transfer safety summary;
7. date and secondary deal metadata.

At least two matched player names are shown when available, followed by a compact
remainder such as `+4`. Match state includes text and iconography, not color
alone. `META` is reserved for actual META-card data and is not used as a generic
decorative badge.

Multiple transfer risks are condensed to one readable status, for example
`2 ta transfer xavfi`. It expands or routes to the detail view for the full
breakdown. A clean account receives a concise positive label; warnings do not
wrap into long concatenated strings on the card.

Sold, negotiable, and exchange states remain visible but secondary to price and
player fit. Sold cards retain an explicit overlay and semantic status.

### Media and performance

Card media reserves dimensions before loading. The implementation should use
Next image optimization where the same-origin Telegram media proxy permits it,
with explicit `sizes`, lazy loading below the fold, and a stable fallback when
media is unavailable. Only genuinely above-the-fold media may receive eager or
priority loading.

The player-filter catalogue is loaded only after its action is opened. CSS
handles card responsiveness without per-card resize listeners.

## Loading, Empty, Error, and Navigation States

- Add a `/marketplace/loading.tsx` boundary with a layout-neutral automatic
  toolbar/card skeleton that reserves stable space. If explicit list/grid parity
  is required during in-page navigation, use a search-param-keyed local Suspense
  boundary; the route loading file does not receive query parameters.
- Navigation triggered by quick filters, sorting, search, pagination, or view
  selection exposes pending feedback while leaving current results readable.
- A no-results state describes the active cause. Ordinary filters offer
  `Filtrlarni yumshatish` and removable criteria; player matching offers lower
  strictness and player-edit actions; free-text search offers search editing.
- When no user-applied criteria exist, use platform-aware copy such as
  `Hozircha bu platformada e‘lon yo‘q` and offer `Akkount joylash`. Do not claim
  the whole marketplace is empty unless an explicit unfiltered count proves it.
  Filtered zero results must not claim that no listings exist.
- Production browse errors show a buyer-friendly message, `Qayta urinish`, and
  a recovery path. HTTP status, backend path, exception details, and stack-like
  payloads stay in server logs or development-only diagnostics.
- Result-count preview errors stay local to the filter sheet and never replace
  the current marketplace results.

Before opening a listing, the feed replaces its current history entry with an
app-owned same-origin marker containing the normalized query key, clicked
listing ID, and current scroll offset. Restoration runs only after a `popstate`
return to that marked feed entry and after its cards render. It anchors to the
recorded card first, accounting for sticky chrome; the saved pixel offset is a
clamped fallback when that listing no longer exists. Fresh marketplace
navigation starts at the top, and a direct detail deep link falls back to the
query-preserving `/marketplace` URL without inventing scroll state.

## Telegram Mini App Behavior

### Insets, viewport, and theme

The root bootstrap continues mirroring Telegram's stable viewport height. It
also mirrors Telegram safe-area and content-safe-area values into semantic CSS
variables when the SDK provides them. Fixed and sticky surfaces use the greater
of the Telegram value and CSS `env(safe-area-inset-*)`.

Theme resolution has one order: an explicit user preference wins; otherwise the
Telegram color scheme seeds the theme when available, with the browser system
theme as fallback. Telegram header and background colors mirror the resolved
semantic app colors rather than a hard-coded light color. Initial load and every
resolved-theme change update both tokens and native chrome without a light flash
around dark content.

### Back and overlays

One centralized Telegram back stack owns the native BackButton. Its order is:

1. close the topmost marketplace sheet, menu, or search overlay;
2. navigate through browser history only when an app-owned marker proves the
   prior entry is a same-origin eFBazaar route;
3. use the explicit marketplace fallback URL for direct entries.

Components do not independently register competing native BackButton handlers.
The marketplace feed keeps Telegram's vertical swipe behavior. Swipe disabling
is scoped to overlays that would otherwise conflict and is restored when the
overlay closes.

### Feedback and fixed chrome

Haptic selection feedback is used for player selection and meaningful filter
toggles. Success or notification feedback confirms filter application where
supported. Routine scrolling and ordinary navigation do not vibrate.

Bottom navigation height and safe-area padding are exposed through shared CSS
variables. Main content uses those variables so the final card and pagination
cannot sit behind fixed chrome. Short landscape mode collapses search and
nonessential header content.

## Accessibility Requirements

- All interactive controls have a minimum 44×44px target.
- Form fields have programmatic labels; placeholders are examples, not labels.
- Icon-only sort or view controls have explicit accessible names and visible
  current-value context.
- Dialogs trap focus, restore focus to their trigger, close with Escape, and
  announce their title and purpose.
- Dynamic result counts and navigation errors use polite live regions; field
  errors use appropriate alert semantics.
- Focus order matches visual order, and route changes focus the results heading
  without unexpectedly stealing focus during sheet editing.
- Text and interactive-state contrast meet WCAG AA in light and dark themes.
- Match, safety, selection, sold, and disabled states do not rely on color alone.
- Text scaling and long Uzbek labels wrap without clipping at the largest
  practical browser text settings.
- Reduced-motion mode removes sheet, header-collapse, skeleton shimmer, and card
  scale animations that are not essential to understanding state.

## Component Boundaries

The implementation should keep server fetching and URL parsing in the current
route while decomposing large presentation files into focused units:

- `MarketplaceBrowser`: server-rendered coordinator for parsed state, result
  data, and component composition.
- `MarketplaceToolbar`: responsive search/filters/players/sort/view controls and
  pending feedback.
- `AppliedFilterChips`: human-readable criteria and one-criterion URL removal.
- `MarketplaceFilterSheet`: client-owned filter draft, grouped sections, count
  preview, and apply/clear behavior.
- `ListingFilters`: reusable field groups for desktop sidebar and mobile sheet.
- `ResponsiveListingGrid`: auto/list/grid layout contract and list semantics.
- `ListingCard`: shared semantic content with horizontal and vertical layout
  variants.
- `PlayerFilterDialog`: existing three-path player flow with simplified copy,
  preserved card identity, safe-area footer, and centralized overlay back.
- Telegram shell utilities: theme/inset synchronization and one native overlay
  back-stack owner.

Files may be combined when a unit remains small, but `MarketplaceBrowser`, the
general filter form, and the player dialog must not continue accumulating
unrelated layout, URL, fetch, and modal responsibilities in one component.

## Data Flow

1. The server page parses the URL and fetches the current listing page.
2. The toolbar receives normalized state and URL builders; link-like changes
   update only their own parameters and delete `page`.
3. The detailed filter sheet creates a draft from normalized state when opened.
4. Draft changes debounce a count-only browse request. Apply writes the draft to
   the URL and closes the sheet; cancel discards it.
5. The player sheet lazily loads META/search/team data and writes typed repeated
   `matchCard` plus `matchStrictness` parameters.
6. The server renders updated results. `ResponsiveListingGrid` selects layout
   from available width and explicit `view` override.
7. Listing links carry the complete browse query and save a scroll anchor before
   navigation.

The existing typed query contract remains authoritative:

- repeated `matchCard=<efhubId>:<playerId>:<importance>` values;
- `matchStrictness=1..10` only when player criteria exist;
- `attr.*` for marketplace attributes;
- `view=list|grid` only for an explicit override;
- no `view` for automatic behavior.

## Error Handling

- Invalid URL values continue normalizing to safe defaults.
- A failed result-count request is non-blocking and retryable through the next
  draft change.
- A failed marketplace navigation leaves the prior results visible where Next
  routing permits and presents a retry action.
- Player catalogue failures keep the current selection and provide retry.
- Image failures use a stable branded fallback without changing card size.
- Telegram SDK absence falls back to browser history, CSS safe areas, ordinary
  buttons, and the current responsive web experience.

## Testing Strategy

### Unit and component tests

- URL mutation preserves unrelated search, filters, sort, player criteria, and
  view while resetting pagination.
- Absent `view` selects auto; explicit list/grid overrides serialize and restore.
- Applied chips map every supported criterion to correct copy and remove only
  that parameter.
- Filter drafts initialize, cancel, clear, apply, debounce preview requests, and
  remain applicable after preview failure.
- Numeric filter drafts reject reversed ranges, negative prices, fractional
  integer-only fields, and out-of-bound values without previewing or applying.
- Search preserves active filters.
- Player selection retains real card metadata and strictness band labels.
- Card variants render the same semantic priority, whole-card link, independent
  favorite action, match summary, and condensed safety state.
- Empty and error states select the correct recovery action.
- Telegram overlay back closes the topmost overlay before route navigation.
- Telegram native back never follows unrelated history after a direct Mini App
  entry.
- Theme resolution applies user preference before Telegram and system defaults
  and mirrors the resolved colors into native chrome.
- Scroll restoration covers back, forward, a removed recorded listing, and
  direct detail entry without a feed marker.

### Responsive and interaction verification

Verify at 320, 360, 390, 430, 768, 1024, and 1440px, plus short landscape:

- no horizontal page overflow;
- no target below 44px;
- one readable auto column when two cannot fit;
- safe transition to two and three columns;
- manual view overrides;
- search collapse/restore behavior;
- sheet height, keyboard avoidance, and sticky CTA clearance;
- last-card and pagination clearance above bottom navigation.

Verify light/dark Telegram chrome, safe-area fallbacks, keyboard navigation,
screen-reader labels/live regions, large text, reduced motion, slow network,
image failure, empty results, and production-style API failure.

Run the existing frontend unit suite, ESLint, TypeScript check, and production
build. Backend matching tests remain unchanged because this design does not
alter matching semantics.

## Acceptance Criteria

- A buyer can reach the first listing without navigating through stacked mobile
  control rows.
- Every marketplace control remains usable at 320px and in short landscape.
- Auto view never produces an unreadably narrow card; explicit list/grid
  overrides remain available and shareable.
- Search and every filter action preserve unrelated URL state.
- Quick filters are immediate; detailed filter edits apply together from one
  sticky CTA with a non-blocking result preview.
- Active filters are visible and individually removable.
- Player filtering remains a distinct, discoverable action with META, search,
  and the single Dream Team.
- Listing cards make price and player fit fastest to scan, and the full
  non-interactive card surface opens the listing.
- Returning from detail restores marketplace query and scroll context.
- Telegram theme, insets, native back, and overlay behavior have one consistent
  owner and graceful browser fallbacks.
- Loading, empty, and error states are stable, actionable, and buyer-facing.
- Accessibility and responsive verification pass at the specified sizes and
  modes.

## Rollout

Implement in four reviewable slices within one marketplace UX plan:

1. URL/view helpers, responsive shell behavior, and Telegram inset/back
   foundation.
2. Responsive toolbar, applied chips, and detailed filter sheet.
3. Player-filter polish, responsive listing cards, loading/empty/error states,
   and scroll restoration.
4. Automated tests, responsive browser verification, accessibility pass, and
   production build verification.

Each slice must keep existing public browsing, fuzzy player matching, and the
singleton Dream Team behavior functional.
