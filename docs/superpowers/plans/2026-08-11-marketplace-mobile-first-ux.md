# Marketplace Mobile-First UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/marketplace` into a responsive, Telegram-native listing feed whose search, account filters, player matching, cards, and back/forward state remain easy to use from 320px phones through desktop.

**Architecture:** Keep the route server-rendered and make the raw public query string the lossless source of navigation state; keep `buildListingSearchParams()` restricted to backend requests. Add small pure modules for query mutation, filter drafts, card presentation, Telegram resolution, and scroll markers, then compose focused client islands for pending navigation, search collapse, dialogs, media fallback, and native BackButton ownership. CSS container queries select card layout from available result width, while Telegram SDK values feed semantic theme, viewport, and safe-area variables.

**Tech Stack:** Next.js 16 App Router, React 19 server/client components, TypeScript 5.6, Tailwind CSS 3.4 plus CSS container queries, Radix Dialog/Tabs, Lucide, Vitest 4 in Node, Telegram Mini Apps JavaScript SDK.

---

## Scope and source of truth

- Work from repository root `/private/tmp/ef-bazaar-player-filter-single-team`.
- Run frontend commands from `/private/tmp/ef-bazaar-player-filter-single-team/frontend`.
- Approved behavior lives in `docs/superpowers/specs/2026-08-11-marketplace-mobile-first-ux-design.md`.
- Telegram API names in Tasks 4–5 are the Bot API 8.0+ contracts documented at `https://core.telegram.org/bots/webapps`: `colorScheme`, `themeParams`, `safeAreaInset`, `contentSafeAreaInset`, `themeChanged`, `safeAreaChanged`, `contentSafeAreaChanged`, `enableVerticalSwipes`, `disableVerticalSwipes`, and `BackButton`.
- This is a frontend-only change. Do not change fuzzy matching, the repeated `matchCard=<efhubId>:<playerId>:N|P` contract, strictness values 1–10, the singleton Dream Team backend, or marketplace schemas.
- Keep every Vitest filename as `.test.ts`; `vitest.config.ts` excludes `.test.tsx`.

## File map

### Public query and filter state

- Create `frontend/src/lib/marketplace-query.ts` — lossless public URL parsing/mutation and Auto/List/Grid state.
- Create `frontend/src/lib/marketplace-query.test.ts` — repeated-parameter preservation and mutation coverage.
- Create `frontend/src/lib/marketplace-applied-filters.ts` — human-readable chips, grouped removal, and general/player counts.
- Create `frontend/src/lib/marketplace-applied-filters.test.ts` — every supported chip and clear behavior.
- Create `frontend/src/lib/marketplace-filter-draft.ts` — controlled detailed-filter draft, validation, clear, and apply serialization.
- Create `frontend/src/lib/marketplace-filter-draft.test.ts` — numeric/boundary and unrelated-state coverage.
- Create `frontend/src/lib/marketplace-preview.ts` — cancellable count request through the existing listing browse endpoint.
- Create `frontend/src/lib/marketplace-preview.test.ts` — API/public-query translation and abort behavior.

### Telegram and persistent navigation foundation

- Create `frontend/src/lib/telegram-shell.ts` — pure theme, inset, history-safety, and haptic helpers.
- Create `frontend/src/lib/telegram-shell.test.ts` — resolution order and safety decisions.
- Create `frontend/src/components/telegram/telegram-back-provider.tsx` — the sole native BackButton and vertical-swipe owner.
- Create `frontend/src/components/telegram/telegram-back-provider.test.ts` — source contract for one listener and LIFO layers.
- Modify `frontend/src/lib/types.ts` — exact Telegram SDK fields/events used by the foundation.
- Modify `frontend/src/components/telegram/telegram-viewport-bootstrap.tsx` — dynamic viewport/inset/theme listeners; no global swipe disable.
- Modify `frontend/src/components/theme/theme-script.tsx` — no-flash user → Telegram → system resolution.
- Modify `frontend/src/components/theme/use-theme.ts` — explicit preference writes and runtime theme event.
- Modify `frontend/src/app/layout.tsx` — mount the one back provider.
- Modify `frontend/src/app/globals.css` — semantic safe-area, bottom-bar, and reduced-motion variables.
- Modify `frontend/src/hooks/use-telegram-back-button.ts` — compatibility adapter to the provider, with no SDK listener.
- Modify `frontend/src/components/navigation/top-back-button.tsx` and `frontend/src/components/navigation/back-link.tsx` — provider-backed route behavior and 44px targets.

### Marketplace chrome, navigation, and filters

- Create `frontend/src/lib/marketplace-search-collapse.ts` — deterministic header collapse hysteresis.
- Create `frontend/src/lib/marketplace-search-collapse.test.ts` — scroll/focus/landscape transitions.
- Create `frontend/src/components/marketplace/marketplace-navigation.tsx` — persistent pending navigation context and accessible pending link.
- Create `frontend/src/components/marketplace/marketplace-search.tsx` — state-preserving search plus mobile compact action.
- Create `frontend/src/components/marketplace/marketplace-toolbar.tsx` — responsive result count, filters, players, sort, and view actions.
- Create `frontend/src/components/marketplace/marketplace-view-menu.tsx` — Auto/Ro‘yxat/Katak control.
- Create `frontend/src/components/marketplace/applied-filter-chips.tsx` — removable criteria and clear-all.
- Create `frontend/src/components/marketplace/listing-filter-fields.tsx` — controlled `Asosiy`, `Akkount`, and `Xavfsizlik` groups.
- Create `frontend/src/components/marketplace/marketplace-filter-sheet.tsx` — Radix sheet, draft, validation, preview, and apply.
- Modify `frontend/src/components/marketplace/listing-filters.tsx` — desktop controller using the shared fields.
- Modify `frontend/src/components/marketplace/card-picker-field.tsx` — controlled valuable-card selection.
- Modify `frontend/src/components/marketplace/sort-menu.tsx` — pending links, visible current value, and 44px trigger.
- Delete `frontend/src/components/marketplace/mobile-filter-sheet.tsx` after the Radix replacement is wired.

### Player filtering

- Create `frontend/src/lib/player-filter-cache.ts` — session-scoped real card metadata snapshots.
- Create `frontend/src/lib/player-filter-cache.test.ts` — safe parse, canonical merge, and missing-cache fallback.
- Modify `frontend/src/lib/player-match-query.ts` and `frontend/src/lib/player-match-query.test.ts` — approved five strictness bands.
- Modify `frontend/src/components/marketplace/player-filter-launcher.tsx` — lazy team fetch, cached metadata hydration, URL preservation, and success feedback.
- Modify `frontend/src/components/marketplace/player-filter-dialog.tsx` and `frontend/src/components/marketplace/player-filter-dialog.test.ts` — friendly copy, safe footer, overlay back, haptics, and no admin copy.

### Listings, result states, and restoration

- Create `frontend/src/components/marketplace/listing-card-model.ts` — one derived semantic model for all card layouts.
- Create `frontend/src/components/marketplace/listing-card-model.test.ts` — match names/summary, hierarchy, and safety condensation.
- Create `frontend/src/components/marketplace/listing-card-media.tsx` — stable Next Image box with failure fallback.
- Create `frontend/src/components/marketplace/responsive-listing-grid.tsx` — container-query contract and shared skeleton geometry.
- Create `frontend/src/components/marketplace/responsive-listing-grid.test.ts` — Auto/List/Grid structure contract.
- Create `frontend/src/components/marketplace/marketplace-result-state.tsx` — buyer-facing empty/error recovery.
- Create `frontend/src/components/marketplace/marketplace-result-state.test.ts` — state precedence and diagnostic redaction.
- Create `frontend/src/components/marketplace/listings-pagination.test.ts` — mobile summary and target sizes.
- Create `frontend/src/lib/marketplace-scroll-state.ts` — versioned feed marker and restoration decision helpers.
- Create `frontend/src/lib/marketplace-scroll-state.test.ts` — query normalization, popstate, anchor, and fallback coverage.
- Create `frontend/src/components/marketplace/marketplace-history-provider.tsx` — persistent popstate observer.
- Create `frontend/src/components/marketplace/marketplace-listing-link.tsx` — same-tab feed marker writer.
- Create `frontend/src/components/marketplace/marketplace-scroll-restorer.tsx` — post-render anchor/pixel restoration.
- Create `frontend/src/app/marketplace/layout.tsx` — persistent navigation/history providers.
- Create `frontend/src/app/marketplace/loading.tsx` — neutral Auto skeleton.
- Create `frontend/src/app/marketplace/error.tsx` — unexpected buyer-safe retry boundary.
- Modify `frontend/src/app/marketplace/page.tsx` — raw query, Auto view, and coordinator props.
- Modify `frontend/src/components/marketplace/marketplace-browser.tsx` — focused server coordinator only.
- Modify `frontend/src/components/marketplace/listing-card.tsx` and `frontend/src/components/marketplace/listing-card.test.ts` — one semantic card and whole-card link.
- Modify `frontend/src/components/marketplace/listing-like-button.tsx` — independent 44px favorite action.
- Modify `frontend/src/components/marketplace/listings-pagination.tsx` — mobile-first 44px controls.
- Modify `frontend/src/components/marketplace/marketplace-shell.tsx` — collapsible search, measured chrome clearance, and visible Sell label.
- Modify `frontend/src/components/marketplace/marketplace-listing-detail.tsx` — remove its duplicate `BackLink` registration.
- Modify `frontend/src/app/marketplace/[id]/page.tsx` — smart back fallback and consumer-safe error mode.

## Task 1: Establish lossless public marketplace query state

**Files:**

- Create: `frontend/src/lib/marketplace-query.ts`
- Create: `frontend/src/lib/marketplace-query.test.ts`
- Modify: `frontend/src/app/marketplace/page.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`

- [ ] **Step 1: Write failing URL-state tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  clearMarketplaceCriteria,
  getMarketplaceView,
  marketplaceHref,
  setMarketplacePage,
  setMarketplaceQuickFilter,
  setMarketplaceSearch,
  setMarketplaceSort,
  setMarketplaceView,
} from './marketplace-query';

const cardA = '101:11111111-1111-4111-8111-111111111111:N';
const cardB = '202:22222222-2222-4222-8222-222222222222:P';

describe('marketplace public query', () => {
  it('treats an absent or invalid view as Auto and serializes explicit overrides', () => {
    expect(getMarketplaceView(new URLSearchParams())).toBe('auto');
    expect(getMarketplaceView(new URLSearchParams('view=wide'))).toBe('auto');
    expect(setMarketplaceView(new URLSearchParams('page=3'), 'list').toString()).toBe('view=list');
    expect(setMarketplaceView(new URLSearchParams('page=3'), 'grid').toString()).toBe('view=grid');
    expect(setMarketplaceView(new URLSearchParams('view=list&page=3'), 'auto').toString()).toBe('');
  });

  it('changes search without losing filters, sort, view, or repeated cards', () => {
    const current = new URLSearchParams();
    current.set('filter', 'clean');
    current.set('attr.team_strength.min', '3000');
    current.set('sort', 'price,asc');
    current.set('view', 'grid');
    current.set('page', '4');
    current.append('matchCard', cardA);
    current.append('matchCard', cardB);

    const next = setMarketplaceSearch(current, '  Messi  ');
    expect(next.get('q')).toBe('Messi');
    expect(next.has('search')).toBe(false);
    expect(next.has('page')).toBe(false);
    expect(next.get('filter')).toBe('clean');
    expect(next.get('attr.team_strength.min')).toBe('3000');
    expect(next.get('sort')).toBe('price,asc');
    expect(next.get('view')).toBe('grid');
    expect(next.getAll('matchCard')).toEqual([cardA, cardB]);
  });

  it('resets page for sort and quick-filter changes but pagination changes only page', () => {
    const current = new URLSearchParams('q=Messi&page=5&attr.exchange_mode=BOTH');
    expect(setMarketplaceSort(current, 'price,desc').get('page')).toBeNull();
    expect(setMarketplaceQuickFilter(current, 'negotiable').get('page')).toBeNull();
    expect(setMarketplacePage(current, 2).toString())
      .toBe('q=Messi&page=2&attr.exchange_mode=BOTH');
  });

  it('clears buyer criteria while preserving view, sort, and tracking data', () => {
    const current = new URLSearchParams(
      `q=Messi&filter=clean&matchCard=${encodeURIComponent(cardA)}&matchStrictness=7&view=list&sort=price%2Casc&utm_source=tg&page=3`,
    );
    expect(clearMarketplaceCriteria(current).toString())
      .toBe('view=list&sort=price%2Casc&utm_source=tg');
  });

  it('builds a clean marketplace path', () => {
    expect(marketplaceHref(new URLSearchParams())).toBe('/marketplace');
    expect(marketplaceHref(new URLSearchParams('view=grid'))).toBe('/marketplace?view=grid');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/lib/marketplace-query.test.ts`

Expected: FAIL because `./marketplace-query` does not exist.

- [ ] **Step 3: Implement the public-query module**

```ts
import type { MarketplaceFilterId } from './marketplace-format';

export type MarketplaceView = 'auto' | 'list' | 'grid';

const CRITERIA_KEYS = new Set([
  'q', 'search', 'filter', 'minPrice', 'maxPrice', 'priceNegotiable',
  'matchCard', 'matchStrictness', 'page', 'size',
]);

const QUICK_FILTER_CONTROLLED_KEYS: Record<MarketplaceFilterId, readonly string[]> = {
  all: [],
  negotiable: ['priceNegotiable'],
  clean: ['attr.has_google_play_link', 'attr.has_game_center_link'],
  exchange: ['attr.exchange_mode'],
};

function copy(current: URLSearchParams) {
  return new URLSearchParams(current);
}

function resetPage(params: URLSearchParams) {
  params.delete('page');
  return params;
}

export function getMarketplaceView(params: URLSearchParams): MarketplaceView {
  const value = params.get('view');
  return value === 'list' || value === 'grid' ? value : 'auto';
}

export function marketplaceHref(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/marketplace?${query}` : '/marketplace';
}

export function setMarketplaceSearch(current: URLSearchParams, value: string) {
  const next = resetPage(copy(current));
  next.delete('q');
  next.delete('search');
  const query = value.trim();
  if (query) next.set('q', query);
  return next;
}

export function setMarketplaceView(current: URLSearchParams, view: MarketplaceView) {
  const next = resetPage(copy(current));
  if (view === 'auto') next.delete('view');
  else next.set('view', view);
  return next;
}

export function setMarketplaceSort(current: URLSearchParams, sort: string) {
  const next = resetPage(copy(current));
  if (sort.trim()) next.set('sort', sort.trim());
  else next.delete('sort');
  return next;
}

export function setMarketplaceQuickFilter(
  current: URLSearchParams,
  filter: MarketplaceFilterId,
) {
  const next = resetPage(copy(current));
  next.delete('filter');
  for (const key of QUICK_FILTER_CONTROLLED_KEYS[filter]) next.delete(key);
  if (filter !== 'all') next.set('filter', filter);
  return next;
}

export function setMarketplacePage(current: URLSearchParams, page: number) {
  const next = copy(current);
  next.set('page', String(Math.max(0, Math.trunc(page))));
  return next;
}

export function removeMarketplaceParams(current: URLSearchParams, keys: readonly string[]) {
  const next = resetPage(copy(current));
  for (const key of keys) next.delete(key);
  return next;
}

export function clearMarketplaceCriteria(current: URLSearchParams) {
  const next = copy(current);
  for (const key of Array.from(next.keys())) {
    if (CRITERIA_KEYS.has(key) || key.startsWith('attr.')) next.delete(key);
  }
  return next;
}

export function searchParamsToInput(params: URLSearchParams) {
  const input: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    input[key] = values.length === 1 ? values[0] : values;
  }
  return input;
}
```

- [ ] **Step 4: Make the route use raw query state**

In `frontend/src/app/marketplace/page.tsx`, build the raw query once and pass it through without reconstructing it from `ListingBrowseParams`:

```ts
const rawParams = searchParamInputToSearchParams(resolvedSearchParams);
const filters = parseListingSearchParams(resolvedSearchParams);
if (filters.size === undefined) filters.size = PAGE_SIZE;

const activeFilter = getSelectedMarketplaceFilter(resolvedSearchParams);
const query = filters.search;
const view = getMarketplaceView(rawParams);
const rawQuery = rawParams.toString();
```

Pass `rawQuery={rawQuery}` and `view={view}` to `MarketplaceBrowser`. Change its `view` prop to `MarketplaceView`, remove the local `browseHref()` and `viewHref()` helpers, and do not call `buildListingSearchParams()` to create browser links. Backend fetching continues to use `filters` unchanged.

- [ ] **Step 5: Run tests, typecheck, and confirm GREEN**

Run: `npm test -- src/lib/marketplace-query.test.ts src/lib/marketplace-format.test.ts && npm run typecheck`

Expected: both test files PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the URL-state foundation**

```bash
git add frontend/src/lib/marketplace-query.ts frontend/src/lib/marketplace-query.test.ts frontend/src/app/marketplace/page.tsx frontend/src/components/marketplace/marketplace-browser.tsx
git commit -m "refactor(marketplace): separate public query state"
```

## Task 2: Describe and remove every applied criterion

**Files:**

- Create: `frontend/src/lib/marketplace-applied-filters.ts`
- Create: `frontend/src/lib/marketplace-applied-filters.test.ts`
- Create: `frontend/src/components/marketplace/applied-filter-chips.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`

- [ ] **Step 1: Write failing descriptor tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  buildAppliedMarketplaceFilters,
  generalAppliedFilterCount,
  playerAppliedFilterCount,
} from './marketplace-applied-filters';

describe('applied marketplace filters', () => {
  it('describes all supported public criteria without counting implicit Mobile', () => {
    const params = new URLSearchParams();
    params.set('q', 'Messi');
    params.set('minPrice', '100000');
    params.set('maxPrice', '500000');
    params.set('priceNegotiable', 'true');
    params.set('attr.highest_division_level', '2');
    params.set('attr.team_strength.min', '3000');
    params.set('attr.android_coins.min', '-100');
    params.set('attr.device_transfer_limit.min', '4');
    params.set('attr.exchange_mode', 'BOTH');
    params.set('attr.has_google_play_link', 'false');
    params.set('attr.valuable_players_id', '101');
    params.set('attr.valuable_players_name', 'Lionel Messi');
    params.append('matchCard', '101:11111111-1111-4111-8111-111111111111:N');
    params.set('matchStrictness', '6');

    const descriptors = buildAppliedMarketplaceFilters(params);
    expect(descriptors.map((item) => item.label)).toEqual([
      'Qidiruv: Messi',
      "Narx: 100 000–500 000 so'm",
      'Savdolashish mumkin',
      'Division 2',
      'Team Strength: 3 000 dan',
      'Android coin: -100 dan',
      'Transfer limiti: 4 dan',
      'Obmen yoki doplata',
      'Google Play ulanmagan',
      'Yulduz: Lionel Messi',
      '1 o‘yinchi · Muvozanatli',
    ]);
    expect(generalAppliedFilterCount(descriptors)).toBe(9);
    expect(playerAppliedFilterCount(params)).toBe(1);
  });

  it('groups shortcut criteria and removes only the selected descriptor keys', () => {
    const params = new URLSearchParams('filter=clean&view=grid&page=4&q=Messi');
    const [search, clean] = buildAppliedMarketplaceFilters(params);
    expect(clean.label).toBe('Toza akkount');
    expect(clean.href).toBe('/marketplace?view=grid&q=Messi');
    expect(search.href).toBe('/marketplace?filter=clean&view=grid');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/lib/marketplace-applied-filters.test.ts`

Expected: FAIL because the descriptor module does not exist.

- [ ] **Step 3: Implement typed descriptors and grouped removal**

Use this public contract in `marketplace-applied-filters.ts`:

```ts
import { formatCompactNumber, formatPriceUZS, MARKETPLACE_FILTERS } from './marketplace-format';
import { marketplaceHref, removeMarketplaceParams } from './marketplace-query';
import { parsePlayerMatchValues, strictnessLabel } from './player-match-query';

export type AppliedMarketplaceFilterKind = 'search' | 'general' | 'player';

export interface AppliedMarketplaceFilter {
  id: string;
  kind: AppliedMarketplaceFilterKind;
  label: string;
  keys: string[];
  href: string;
}

function descriptor(
  params: URLSearchParams,
  id: string,
  kind: AppliedMarketplaceFilterKind,
  label: string,
  keys: string[],
): AppliedMarketplaceFilter {
  return { id, kind, label, keys, href: marketplaceHref(removeMarketplaceParams(params, keys)) };
}

function rangeLabel(minimum: string | null, maximum: string | null, suffix: string) {
  const min = minimum === null ? null : formatCompactNumber(minimum);
  const max = maximum === null ? null : formatCompactNumber(maximum);
  if (min && max) return `${min}–${max} ${suffix}`.trim();
  if (min) return `${min} dan ${suffix}`.trim();
  return `${max} gacha ${suffix}`.trim();
}

export function buildAppliedMarketplaceFilters(params: URLSearchParams) {
  const items: AppliedMarketplaceFilter[] = [];
  const query = (params.get('q') ?? params.get('search'))?.trim();
  if (query) items.push(descriptor(params, 'search', 'search', `Qidiruv: ${query}`, ['q', 'search']));

  const shortcut = params.get('filter');
  const shortcutItem = MARKETPLACE_FILTERS.find((item) => item.id === shortcut && item.id !== 'all');
  if (shortcutItem) {
    items.push(descriptor(params, `filter:${shortcutItem.id}`, 'general', shortcutItem.label, ['filter']));
  }

  const minPrice = params.get('minPrice');
  const maxPrice = params.get('maxPrice');
  if (minPrice !== null || maxPrice !== null) {
    const price = minPrice && maxPrice
      ? `${formatPriceUZS(minPrice).replace(" so'm", '')}–${formatPriceUZS(maxPrice)}`
      : minPrice ? `${formatPriceUZS(minPrice)} dan` : `${formatPriceUZS(maxPrice ?? 0)} gacha`;
    items.push(descriptor(params, 'price', 'general', `Narx: ${price}`, ['minPrice', 'maxPrice']));
  }

  const explicitPlatform = params.get('attr.platform');
  if (explicitPlatform && explicitPlatform !== 'MOBILE') {
    items.push(descriptor(params, 'platform', 'general', `Platforma: ${explicitPlatform}`, ['attr.platform']));
  }
  if (!shortcutItem || shortcutItem.id !== 'negotiable') {
    if (params.get('priceNegotiable') === 'true') {
      items.push(descriptor(params, 'negotiable', 'general', 'Savdolashish mumkin', ['priceNegotiable']));
    }
  }

  const division = params.get('attr.highest_division_level');
  if (division) {
    items.push(descriptor(params, 'division', 'general', division === '4' ? 'Division 4+' : `Division ${division}`, ['attr.highest_division_level']));
  }

  const ranges: Array<[string, string, string, string]> = [
    ['strength', 'Team Strength:', 'attr.team_strength.min', 'attr.team_strength.max'],
    ['android-coins', 'Android coin:', 'attr.android_coins.min', 'attr.android_coins.max'],
    ['ios-coins', 'iOS coin:', 'attr.ios_coins.min', 'attr.ios_coins.max'],
    ['transfer', 'Transfer limiti:', 'attr.device_transfer_limit.min', 'attr.device_transfer_limit.max'],
  ];
  for (const [id, prefix, minKey, maxKey] of ranges) {
    const minimum = params.get(minKey);
    const maximum = params.get(maxKey);
    if (minimum !== null || maximum !== null) {
      items.push(descriptor(params, id, 'general', `${prefix} ${rangeLabel(minimum, maximum, '')}`.trim(), [minKey, maxKey]));
    }
  }

  const exchangeLabels: Record<string, string> = {
    NONE: "Obmen yo'q",
    EXCHANGE_ONLY: 'Faqat obmen',
    EXCHANGE_WITH_SURCHARGE: 'Obmen + doplata',
    BOTH: 'Obmen yoki doplata',
  };
  const exchange = params.get('attr.exchange_mode');
  if (exchange && (!shortcutItem || shortcutItem.id !== 'exchange')) {
    items.push(descriptor(params, 'exchange', 'general', exchangeLabels[exchange] ?? exchange, ['attr.exchange_mode']));
  }

  for (const [key, label] of [
    ['attr.has_google_play_link', 'Google Play ulanmagan'],
    ['attr.has_game_center_link', 'Game Center ulanmagan'],
  ] as const) {
    if (params.get(key) === 'false' && (!shortcutItem || shortcutItem.id !== 'clean')) {
      items.push(descriptor(params, key, 'general', label, [key]));
    }
  }

  const valuableName = params.get('attr.valuable_players_name');
  if (params.get('attr.valuable_players_id') || valuableName) {
    items.push(descriptor(params, 'valuable-player', 'general', `Yulduz: ${valuableName ?? 'Tanlangan o‘yinchi'}`, ['attr.valuable_players_id', 'attr.valuable_players_name']));
  }

  const match = parsePlayerMatchValues(params.getAll('matchCard'), params.get('matchStrictness') ?? undefined);
  if (match.criteria.length) {
    items.push(descriptor(params, 'player-match', 'player', `${match.criteria.length} o‘yinchi · ${strictnessLabel(match.strictness)}`, ['matchCard', 'matchStrictness']));
  }
  return items;
}

export function generalAppliedFilterCount(items: AppliedMarketplaceFilter[]) {
  return items.filter((item) => item.kind === 'general').length;
}

export function playerAppliedFilterCount(params: URLSearchParams) {
  return parsePlayerMatchValues(params.getAll('matchCard'), params.get('matchStrictness') ?? undefined).criteria.length;
}
```

- [ ] **Step 4: Render removable chips**

Implement `AppliedFilterChips` as server-safe links so every chip remains copyable and works without JavaScript:

```tsx
import Link from 'next/link';
import { X } from 'lucide-react';

import type { AppliedMarketplaceFilter } from '@/lib/marketplace-applied-filters';
import { clearMarketplaceCriteria, marketplaceHref } from '@/lib/marketplace-query';

export function AppliedFilterChips({
  items,
  rawQuery,
}: {
  items: AppliedMarketplaceFilter[];
  rawQuery: string;
}) {
  if (!items.length) return null;
  const clearHref = marketplaceHref(clearMarketplaceCriteria(new URLSearchParams(rawQuery)));
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Qo‘llangan filtrlar">
      {items.map((item) => (
        <Link key={item.id} href={item.href} className="tap-press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-bold">
          {item.label}<X className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">filtrini olib tashlash</span>
        </Link>
      ))}
      <Link href={clearHref} className="tap-press inline-flex min-h-11 items-center px-2 text-xs font-bold text-primary">
        Barchasini tozalash
      </Link>
    </div>
  );
}
```

Build descriptors once in `MarketplaceBrowser`, pass their counts to the two toolbar actions, and render chips immediately before results. Do not count the player-match descriptor in `Filtrlar`.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npm test -- src/lib/marketplace-applied-filters.test.ts src/lib/marketplace-query.test.ts && npm run typecheck`

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit applied-filter summaries**

```bash
git add frontend/src/lib/marketplace-applied-filters.ts frontend/src/lib/marketplace-applied-filters.test.ts frontend/src/components/marketplace/applied-filter-chips.tsx frontend/src/components/marketplace/marketplace-browser.tsx
git commit -m "feat(marketplace): add removable applied filters"
```

## Task 3: Add a validated detailed-filter draft and count preview

**Files:**

- Create: `frontend/src/lib/marketplace-filter-draft.ts`
- Create: `frontend/src/lib/marketplace-filter-draft.test.ts`
- Create: `frontend/src/lib/marketplace-preview.ts`
- Create: `frontend/src/lib/marketplace-preview.test.ts`

- [ ] **Step 1: Write failing draft validation and apply tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  applyMarketplaceFilterDraft,
  clearMarketplaceFilterDraft,
  filterDraftFromBrowseParams,
  validateMarketplaceFilterDraft,
} from './marketplace-filter-draft';

describe('marketplace detailed-filter draft', () => {
  it('hydrates normalized quick-filter values and clears to the Mobile baseline', () => {
    const draft = filterDraftFromBrowseParams({
      minPrice: 100000,
      priceNegotiable: true,
      attributes: {
        platform: 'STEAM',
        'team_strength.min': '3000',
        has_google_play_link: 'false',
        valuable_players_id: '101',
        valuable_players_name: 'Messi',
      },
    });
    expect(draft.platform).toBe('STEAM');
    expect(draft.minPrice).toBe('100000');
    expect(draft.priceNegotiable).toBe(true);
    expect(draft.googlePlayDisconnected).toBe(true);
    expect(draft.valuablePlayer).toEqual({ efhubId: 101, name: 'Messi' });
    expect(clearMarketplaceFilterDraft()).toMatchObject({
      platform: 'MOBILE',
      minPrice: '',
      priceNegotiable: false,
      valuablePlayer: null,
    });
  });

  it('rejects invalid ranges, fractions, and definition bounds', () => {
    const errors = validateMarketplaceFilterDraft({
      ...clearMarketplaceFilterDraft(),
      minPrice: '-1',
      maxPrice: '100',
      teamStrengthMin: '4100',
      teamStrengthMax: '3000',
      androidCoinsMin: '1.5',
      transferLimitMin: '11',
      division: '8',
    });
    expect(errors).toEqual({
      minPrice: "Narx 0 dan kam bo‘lishi mumkin emas.",
      teamStrength: 'Eng kam kuch eng yuqori kuchdan oshmasligi kerak.',
      androidCoinsMin: 'Butun son kiriting.',
      transferLimitMin: '0 dan 10 gacha son kiriting.',
      division: 'Division 1–4 oralig‘ida bo‘lishi kerak.',
    });
  });

  it('allows negative integer coin balances and applies only general fields', () => {
    const current = new URLSearchParams();
    current.set('filter', 'clean');
    current.set('q', 'Messi');
    current.set('sort', 'price,asc');
    current.set('view', 'grid');
    current.set('page', '3');
    current.append('matchCard', '101:11111111-1111-4111-8111-111111111111:N');
    const draft = {
      ...clearMarketplaceFilterDraft(),
      androidCoinsMin: '-500',
      teamStrengthMin: '3000',
      googlePlayDisconnected: true,
    };
    expect(validateMarketplaceFilterDraft(draft)).toEqual({});
    const next = applyMarketplaceFilterDraft(current, draft);
    expect(next.has('filter')).toBe(false);
    expect(next.has('page')).toBe(false);
    expect(next.get('attr.android_coins.min')).toBe('-500');
    expect(next.get('attr.team_strength.min')).toBe('3000');
    expect(next.get('attr.has_google_play_link')).toBe('false');
    expect(next.get('q')).toBe('Messi');
    expect(next.get('sort')).toBe('price,asc');
    expect(next.get('view')).toBe('grid');
    expect(next.getAll('matchCard')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the draft test and confirm RED**

Run: `npm test -- src/lib/marketplace-filter-draft.test.ts`

Expected: FAIL because `./marketplace-filter-draft` does not exist.

- [ ] **Step 3: Implement the complete draft contract**

```ts
import type { ListingBrowseParams } from './marketplace-types';

export type MarketplacePlatform = 'MOBILE' | 'STEAM' | 'PLAYSTATION';

export interface MarketplaceFilterDraft {
  platform: MarketplacePlatform;
  minPrice: string;
  maxPrice: string;
  priceNegotiable: boolean;
  division: string;
  teamStrengthMin: string;
  teamStrengthMax: string;
  androidCoinsMin: string;
  iosCoinsMin: string;
  transferLimitMin: string;
  exchangeMode: string;
  googlePlayDisconnected: boolean;
  gameCenterDisconnected: boolean;
  valuablePlayer: { efhubId: number; name: string } | null;
}

export type MarketplaceFilterErrors = Partial<Record<
  | 'platform' | 'minPrice' | 'maxPrice' | 'price' | 'division'
  | 'teamStrengthMin' | 'teamStrengthMax' | 'teamStrength'
  | 'androidCoinsMin' | 'iosCoinsMin' | 'transferLimitMin',
  string
>>;

const GENERAL_KEYS = [
  'filter', 'minPrice', 'maxPrice', 'priceNegotiable', 'attr.platform',
  'attr.highest_division_level', 'attr.team_strength.min', 'attr.team_strength.max',
  'attr.android_coins.min', 'attr.ios_coins.min', 'attr.device_transfer_limit.min',
  'attr.exchange_mode', 'attr.has_google_play_link', 'attr.has_game_center_link',
  'attr.valuable_players_id', 'attr.valuable_players_name',
] as const;

export function clearMarketplaceFilterDraft(): MarketplaceFilterDraft {
  return {
    platform: 'MOBILE', minPrice: '', maxPrice: '', priceNegotiable: false,
    division: '', teamStrengthMin: '', teamStrengthMax: '', androidCoinsMin: '',
    iosCoinsMin: '', transferLimitMin: '', exchangeMode: '',
    googlePlayDisconnected: false, gameCenterDisconnected: false, valuablePlayer: null,
  };
}

export function filterDraftFromBrowseParams(filters: ListingBrowseParams): MarketplaceFilterDraft {
  const attr = filters.attributes ?? {};
  const valuableId = Number(attr.valuable_players_id);
  const valuableName = attr.valuable_players_name;
  return {
    platform: attr.platform === 'STEAM' || attr.platform === 'PLAYSTATION' ? attr.platform : 'MOBILE',
    minPrice: filters.minPrice === undefined ? '' : String(filters.minPrice),
    maxPrice: filters.maxPrice === undefined ? '' : String(filters.maxPrice),
    priceNegotiable: filters.priceNegotiable === true,
    division: attr.highest_division_level ?? '',
    teamStrengthMin: attr['team_strength.min'] ?? '',
    teamStrengthMax: attr['team_strength.max'] ?? '',
    androidCoinsMin: attr['android_coins.min'] ?? '',
    iosCoinsMin: attr['ios_coins.min'] ?? '',
    transferLimitMin: attr['device_transfer_limit.min'] ?? '',
    exchangeMode: attr.exchange_mode ?? '',
    googlePlayDisconnected: attr.has_google_play_link === 'false',
    gameCenterDisconnected: attr.has_game_center_link === 'false',
    valuablePlayer: Number.isSafeInteger(valuableId) && valuableId > 0 && valuableName
      ? { efhubId: valuableId, name: valuableName }
      : null,
  };
}

function integerError(value: string, minimum?: number, maximum?: number) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 'Butun son kiriting.';
  if (minimum !== undefined && parsed < minimum) return `${minimum} dan kam bo‘lmasligi kerak.`;
  if (maximum !== undefined && parsed > maximum) return `${maximum} dan oshmasligi kerak.`;
  return undefined;
}

export function validateMarketplaceFilterDraft(draft: MarketplaceFilterDraft) {
  const errors: MarketplaceFilterErrors = {};
  if (!['MOBILE', 'STEAM', 'PLAYSTATION'].includes(draft.platform)) errors.platform = 'Platformani tanlang.';
  for (const key of ['minPrice', 'maxPrice'] as const) {
    const error = integerError(draft[key], 0);
    if (error) errors[key] = error === '0 dan kam bo‘lmasligi kerak.'
      ? "Narx 0 dan kam bo‘lishi mumkin emas."
      : error;
  }
  if (draft.minPrice && draft.maxPrice && Number(draft.minPrice) > Number(draft.maxPrice)) {
    errors.price = 'Eng kam narx eng yuqori narxdan oshmasligi kerak.';
  }
  if (draft.division && !['1', '2', '3', '4'].includes(draft.division)) {
    errors.division = 'Division 1–4 oralig‘ida bo‘lishi kerak.';
  }
  for (const key of ['teamStrengthMin', 'teamStrengthMax'] as const) {
    const error = integerError(draft[key], 1000, 5000);
    if (error) errors[key] = error;
  }
  if (draft.teamStrengthMin && draft.teamStrengthMax
    && Number(draft.teamStrengthMin) > Number(draft.teamStrengthMax)) {
    errors.teamStrength = 'Eng kam kuch eng yuqori kuchdan oshmasligi kerak.';
    delete errors.teamStrengthMin;
    delete errors.teamStrengthMax;
  }
  for (const key of ['androidCoinsMin', 'iosCoinsMin'] as const) {
    const error = integerError(draft[key]);
    if (error) errors[key] = error;
  }
  const transferError = integerError(draft.transferLimitMin, 0, 10);
  if (transferError) errors.transferLimitMin = '0 dan 10 gacha son kiriting.';
  return errors;
}

function setValue(params: URLSearchParams, key: string, value: string | boolean) {
  if (value === '' || value === false) return;
  params.set(key, String(value));
}

export function applyMarketplaceFilterDraft(
  current: URLSearchParams,
  draft: MarketplaceFilterDraft,
) {
  const next = new URLSearchParams(current);
  for (const key of GENERAL_KEYS) next.delete(key);
  next.delete('page');
  if (draft.platform !== 'MOBILE') next.set('attr.platform', draft.platform);
  setValue(next, 'minPrice', draft.minPrice);
  setValue(next, 'maxPrice', draft.maxPrice);
  setValue(next, 'priceNegotiable', draft.priceNegotiable);
  setValue(next, 'attr.highest_division_level', draft.division);
  setValue(next, 'attr.team_strength.min', draft.teamStrengthMin);
  setValue(next, 'attr.team_strength.max', draft.teamStrengthMax);
  setValue(next, 'attr.android_coins.min', draft.androidCoinsMin);
  setValue(next, 'attr.ios_coins.min', draft.iosCoinsMin);
  setValue(next, 'attr.device_transfer_limit.min', draft.transferLimitMin);
  setValue(next, 'attr.exchange_mode', draft.exchangeMode);
  if (draft.googlePlayDisconnected) next.set('attr.has_google_play_link', 'false');
  if (draft.gameCenterDisconnected) next.set('attr.has_game_center_link', 'false');
  if (draft.valuablePlayer) {
    next.set('attr.valuable_players_id', String(draft.valuablePlayer.efhubId));
    next.set('attr.valuable_players_name', draft.valuablePlayer.name);
  }
  return next;
}
```

- [ ] **Step 4: Write failing preview-request tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearMarketplaceFilterDraft } from './marketplace-filter-draft';
import { fetchMarketplaceResultCount } from './marketplace-preview';

afterEach(() => vi.unstubAllGlobals());

describe('marketplace result-count preview', () => {
  it('translates public query state into a minimal backend browse request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [], page: 0, size: 1, totalElements: 37, totalPages: 37 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    const current = new URLSearchParams();
    current.set('q', 'Messi');
    current.append('matchCard', '101:11111111-1111-4111-8111-111111111111:N');

    await expect(fetchMarketplaceResultCount(current, {
      ...clearMarketplaceFilterDraft(),
      teamStrengthMin: '3000',
    }, signal)).resolves.toBe(37);

    const [url, options] = fetchMock.mock.calls[0];
    const parsed = new URL(url, 'https://efbazaar.uz');
    expect(parsed.pathname).toBe('/api/marketplace/v1/listings');
    expect(parsed.searchParams.get('page')).toBe('0');
    expect(parsed.searchParams.get('size')).toBe('1');
    expect(parsed.searchParams.get('search')).toBe('Messi');
    expect(parsed.searchParams.has('q')).toBe(false);
    expect(parsed.searchParams.getAll('matchCard')).toHaveLength(1);
    expect(parsed.searchParams.get('attr.team_strength.min')).toBe('3000');
    expect(options.signal).toBe(signal);
  });

  it('rejects non-success and malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchMarketplaceResultCount(new URLSearchParams(), clearMarketplaceFilterDraft(), new AbortController().signal))
      .rejects.toThrow('marketplace_preview_503');
  });
});
```

- [ ] **Step 5: Run the preview test and confirm RED**

Run: `npm test -- src/lib/marketplace-preview.test.ts`

Expected: FAIL because `./marketplace-preview` does not exist.

- [ ] **Step 6: Implement the existing-endpoint preview client**

```ts
import { applyMarketplaceFilterDraft, type MarketplaceFilterDraft } from './marketplace-filter-draft';
import { buildMarketplaceApiPath } from './marketplace-client-api';
import { buildListingSearchParams, parseListingSearchParams } from './marketplace-format';
import { searchParamsToInput } from './marketplace-query';

export async function fetchMarketplaceResultCount(
  current: URLSearchParams,
  draft: MarketplaceFilterDraft,
  signal: AbortSignal,
) {
  const publicParams = applyMarketplaceFilterDraft(current, draft);
  const browse = parseListingSearchParams(searchParamsToInput(publicParams));
  browse.page = 0;
  browse.size = 1;
  const apiParams = buildListingSearchParams(browse);
  const response = await fetch(buildMarketplaceApiPath('v1/listings', apiParams), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });
  if (!response.ok) throw new Error(`marketplace_preview_${response.status}`);
  const payload = await response.json() as { totalElements?: unknown };
  if (typeof payload.totalElements !== 'number') throw new Error('marketplace_preview_invalid');
  return payload.totalElements;
}
```

- [ ] **Step 7: Run all focused tests and commit**

Run: `npm test -- src/lib/marketplace-filter-draft.test.ts src/lib/marketplace-preview.test.ts src/lib/marketplace-query.test.ts && npm run typecheck`

Expected: all tests PASS and TypeScript exits 0.

```bash
git add frontend/src/lib/marketplace-filter-draft.ts frontend/src/lib/marketplace-filter-draft.test.ts frontend/src/lib/marketplace-preview.ts frontend/src/lib/marketplace-preview.test.ts
git commit -m "feat(marketplace): add validated filter drafts"
```

## Task 4: Synchronize Telegram theme, viewport, and safe areas

**Files:**

- Create: `frontend/src/lib/telegram-shell.ts`
- Create: `frontend/src/lib/telegram-shell.test.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/telegram.ts`
- Modify: `frontend/src/components/theme/theme-script.tsx`
- Modify: `frontend/src/components/theme/use-theme.ts`
- Modify: `frontend/src/components/telegram/telegram-viewport-bootstrap.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write failing pure Telegram resolution tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  APP_CHROME_COLORS,
  resolveAppTheme,
  telegramCssVariables,
  type TelegramInsets,
} from './telegram-shell';

describe('Telegram shell state', () => {
  it('resolves explicit user preference before Telegram and system', () => {
    expect(resolveAppTheme('light', 'dark', true)).toBe('light');
    expect(resolveAppTheme('dark', 'light', false)).toBe('dark');
    expect(resolveAppTheme(null, 'dark', false)).toBe('dark');
    expect(resolveAppTheme(null, undefined, true)).toBe('dark');
    expect(resolveAppTheme('invalid', 'light', true)).toBe('light');
  });

  it('maps both inset families and stable viewport to semantic CSS variables', () => {
    const safe: TelegramInsets = { top: 24, right: 0, bottom: 12, left: 0 };
    const content: TelegramInsets = { top: 44, right: 8, bottom: 20, left: 8 };
    expect(telegramCssVariables(700, safe, content)).toEqual({
      '--tg-viewport-height': '700px',
      '--tg-safe-area-inset-top': '24px',
      '--tg-safe-area-inset-right': '0px',
      '--tg-safe-area-inset-bottom': '12px',
      '--tg-safe-area-inset-left': '0px',
      '--tg-content-safe-area-inset-top': '44px',
      '--tg-content-safe-area-inset-right': '8px',
      '--tg-content-safe-area-inset-bottom': '20px',
      '--tg-content-safe-area-inset-left': '8px',
    });
    expect(APP_CHROME_COLORS.dark.background).toBe('#090910');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/lib/telegram-shell.test.ts`

Expected: FAIL because `./telegram-shell` does not exist.

- [ ] **Step 3: Implement pure theme/inset/chrome helpers**

```ts
export type AppTheme = 'light' | 'dark';
export interface TelegramInsets { top: number; right: number; bottom: number; left: number }

export const APP_CHROME_COLORS = {
  light: { header: '#ffffff', background: '#ffffff', bottomBar: '#ffffff' },
  dark: { header: '#090910', background: '#090910', bottomBar: '#121225' },
} as const satisfies Record<AppTheme, { header: string; background: string; bottomBar: string }>;

export function resolveAppTheme(
  preference: string | null,
  telegram: string | undefined,
  systemDark: boolean,
): AppTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  if (telegram === 'light' || telegram === 'dark') return telegram;
  return systemDark ? 'dark' : 'light';
}

export function telegramCssVariables(
  viewportHeight?: number,
  safe?: TelegramInsets,
  content?: TelegramInsets,
) {
  const output: Record<string, string> = {};
  if (viewportHeight && viewportHeight > 0) output['--tg-viewport-height'] = `${viewportHeight}px`;
  for (const [prefix, value] of [['--tg-safe-area-inset', safe], ['--tg-content-safe-area-inset', content]] as const) {
    if (!value) continue;
    output[`${prefix}-top`] = `${value.top}px`;
    output[`${prefix}-right`] = `${value.right}px`;
    output[`${prefix}-bottom`] = `${value.bottom}px`;
    output[`${prefix}-left`] = `${value.left}px`;
  }
  return output;
}
```

- [ ] **Step 4: Extend the exact SDK types**

Add to `frontend/src/lib/types.ts`:

```ts
export type TelegramColorScheme = 'light' | 'dark';
export interface TelegramWebAppInset { top: number; right: number; bottom: number; left: number }
export interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
}
export type TelegramWebAppEvent =
  | 'themeChanged' | 'viewportChanged' | 'safeAreaChanged'
  | 'contentSafeAreaChanged' | 'backButtonClicked';
```

Extend `TelegramWebApp` with `colorScheme`, `themeParams`, `safeAreaInset`, `contentSafeAreaInset`, `isVerticalSwipesEnabled`, `enableVerticalSwipes`, and `setBottomBarColor`. Change event callbacks to `(payload?: { isStateStable?: boolean }) => void`. Extend `TelegramWebAppHapticFeedback` with `selectionChanged(): void`.

- [ ] **Step 5: Load the official SDK before first-paint resolution**

In `frontend/src/app/layout.tsx`, add this before the body bootstrap and remove effect-time script injection from `TelegramViewportBootstrap`:

```tsx
<Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive" />
```

Update the inline theme script to resolve in this exact order without persisting an automatic choice:

```js
var stored=localStorage.getItem('efbazaar-theme');
var telegram=window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.colorScheme;
var systemDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
var theme=stored==='light'||stored==='dark'?stored:(telegram==='light'||telegram==='dark'?telegram:(systemDark?'dark':'light'));
document.documentElement.classList.toggle('dark',theme==='dark');
document.documentElement.dataset.resolvedTheme=theme;
```

`useTheme.toggle()` imports `AppTheme`, re-exports it as its existing `Theme` type, continues writing an explicit `light` or `dark` preference, and dispatches `window.dispatchEvent(new CustomEvent('efbazaar:theme-change', { detail: next }))` so Telegram chrome updates immediately. Delete `TELEGRAM_CHROME_COLOR` from `lib/telegram.ts`; all native chrome colors come from `APP_CHROME_COLORS`.

- [ ] **Step 6: Replace the bootstrap with synchronized listeners**

The bootstrap's setup effect must call `ready()` and `expand()`, write all variables returned by `telegramCssVariables()`, resolve/apply theme only when no explicit preference exists, sync `setHeaderColor`, `setBackgroundColor`, and `setBottomBarColor` from `APP_CHROME_COLORS`, and subscribe to:

```ts
const listeners = [
  ['viewportChanged', syncViewport],
  ['safeAreaChanged', syncInsets],
  ['contentSafeAreaChanged', syncInsets],
  ['themeChanged', syncTheme],
] as const;
for (const [event, handler] of listeners) webApp.onEvent?.(event, handler);
const systemScheme = window.matchMedia('(prefers-color-scheme: dark)');
systemScheme.addEventListener('change', syncTheme);
window.addEventListener('efbazaar:theme-change', syncTheme);
return () => {
  for (const [event, handler] of listeners) webApp.offEvent?.(event, handler);
  systemScheme.removeEventListener('change', syncTheme);
  window.removeEventListener('efbazaar:theme-change', syncTheme);
};
```

Delete the global `disableVerticalSwipes()` call. Wrap SDK method calls in `try/catch` so an older or partial client falls back to browser behavior.

- [ ] **Step 7: Define semantic safe-area and chrome CSS**

Add these root variables and use them instead of direct `env(...)` values:

```css
:root {
  --app-safe-top: max(env(safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px));
  --app-safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--tg-safe-area-inset-bottom, 0px));
  --app-content-safe-top: max(var(--app-safe-top), var(--tg-content-safe-area-inset-top, 0px));
  --app-content-safe-bottom: max(var(--app-safe-bottom), var(--tg-content-safe-area-inset-bottom, 0px));
  --marketplace-bottom-bar-height: calc(3.5rem + var(--app-content-safe-bottom));
  --app-header-color: #ffffff;
  --app-background-color: #ffffff;
  --app-bottom-bar-color: #ffffff;
}
.dark {
  --app-header-color: #090910;
  --app-background-color: #090910;
  --app-bottom-bar-color: #121225;
}
@media (prefers-reduced-motion: reduce) {
  .tap-press { transition: none; }
  .skeleton::after { animation: none; }
}
```

Remove `overscroll-behavior-y: none` from global `html`; modal scroll locking belongs to Radix/provider overlays.

- [ ] **Step 8: Run tests and commit Telegram environment sync**

Run: `npm test -- src/lib/telegram-shell.test.ts && npm run typecheck && npm run lint`

Expected: test PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/lib/telegram-shell.ts frontend/src/lib/telegram-shell.test.ts frontend/src/lib/types.ts frontend/src/lib/telegram.ts frontend/src/components/theme/theme-script.tsx frontend/src/components/theme/use-theme.ts frontend/src/components/telegram/telegram-viewport-bootstrap.tsx frontend/src/app/layout.tsx frontend/src/app/globals.css
git commit -m "feat(telegram): sync theme viewport and safe areas"
```

## Task 5: Centralize native BackButton, overlay order, swipes, and haptics

**Files:**

- Create: `frontend/src/components/telegram/telegram-back-provider.tsx`
- Create: `frontend/src/components/telegram/telegram-back-provider.test.ts`
- Create: `frontend/src/components/telegram/telegram-mini-app.integration.test.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/hooks/use-telegram-back-button.ts`
- Modify: `frontend/src/components/navigation/top-back-button.tsx`
- Modify: `frontend/src/components/navigation/back-link.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-listing-detail.tsx`
- Modify: `frontend/src/lib/telegram-shell.ts`
- Modify: `frontend/src/lib/telegram-shell.test.ts`

- [ ] **Step 1: Write failing LIFO/back-owner source tests**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const provider = readFileSync(new URL('./telegram-back-provider.tsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../../hooks/use-telegram-back-button.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../marketplace/marketplace-listing-detail.tsx', import.meta.url), 'utf8');

describe('Telegram native back ownership', () => {
  it('attaches the SDK listener only in the root provider', () => {
    expect(provider).toContain('backButton.onClick');
    expect(provider).toContain('backButton.offClick');
    expect(hook).not.toContain('.onClick(');
    expect(hook).not.toContain('.offClick(');
  });

  it('prioritizes overlays and reference-counts swipe locks', () => {
    expect(provider).toContain("kind === 'overlay'");
    expect(provider).toContain('lockVerticalSwipes');
    expect(provider).toContain('disableVerticalSwipes');
    expect(provider).toContain('enableVerticalSwipes');
  });

  it('removes the duplicate detail-page BackLink', () => {
    expect(detail).not.toContain('<BackLink');
  });
});
```

- [ ] **Step 2: Run the source test and confirm RED**

Run: `npm test -- src/components/telegram/telegram-back-provider.test.ts`

Expected: FAIL because the provider file does not exist.

- [ ] **Step 3: Implement one provider with overlay-first semantics**

Use this context contract:

```tsx
'use client';

import * as React from 'react';

import { getTelegramWebApp } from '@/lib/telegram';

type BackLayer = {
  id: string;
  kind: 'overlay' | 'route';
  onBack: () => void;
  lockVerticalSwipes: boolean;
};

type TelegramBackContextValue = {
  isMiniApp: boolean;
  register(layer: BackLayer): () => void;
};

const TelegramBackContext = React.createContext<TelegramBackContextValue>({
  isMiniApp: false,
  register: () => () => undefined,
});

export function TelegramBackProvider({ children }: { children: React.ReactNode }) {
  const layersRef = React.useRef(new Map<string, BackLayer>());
  const [revision, setRevision] = React.useState(0);
  const [isMiniApp, setMiniApp] = React.useState(false);

  const register = React.useCallback((layer: BackLayer) => {
    layersRef.current.set(layer.id, layer);
    setRevision((value) => value + 1);
    return () => {
      if (layersRef.current.delete(layer.id)) setRevision((value) => value + 1);
    };
  }, []);

  React.useEffect(() => {
    const webApp = getTelegramWebApp();
    const backButton = webApp?.BackButton;
    if (!webApp || !backButton) return;
    setMiniApp(true);
    const handleBack = () => {
      const layers = Array.from(layersRef.current.values());
      const overlays = layers.filter((layer) => layer.kind === 'overlay');
      const target = overlays.at(-1) ?? layers.filter((layer) => layer.kind === 'route').at(-1);
      target?.onBack();
    };
    backButton.onClick(handleBack);
    return () => {
      backButton.offClick(handleBack);
      backButton.hide();
    };
  }, []);

  React.useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp?.BackButton) return;
    const layers = Array.from(layersRef.current.values());
    if (layers.length) webApp.BackButton.show();
    else webApp.BackButton.hide();
    const lockVerticalSwipes = layers.some((layer) => layer.kind === 'overlay' && layer.lockVerticalSwipes);
    if (lockVerticalSwipes) webApp.disableVerticalSwipes?.();
    else webApp.enableVerticalSwipes?.();
  }, [revision]);

  const value = React.useMemo(() => ({ isMiniApp, register }), [isMiniApp, register]);
  return <TelegramBackContext.Provider value={value}>{children}</TelegramBackContext.Provider>;
}

export function useTelegramBackLayer(layer: BackLayer, active = true) {
  const context = React.useContext(TelegramBackContext);
  const callbackRef = React.useRef(layer.onBack);
  callbackRef.current = layer.onBack;
  React.useEffect(() => {
    if (!active) return;
    return context.register({ ...layer, onBack: () => callbackRef.current() });
  }, [active, context, layer.id, layer.kind, layer.lockVerticalSwipes]);
  return context.isMiniApp;
}
```

Mount `TelegramBackProvider` once around `<StoreProvider>{children}</StoreProvider>` in the root layout.

- [ ] **Step 4: Convert the legacy hook into a provider adapter**

```ts
'use client';

import { useId } from 'react';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';

export function useTelegramBackButton(onBack: () => void): boolean {
  const id = useId();
  return useTelegramBackLayer({ id, kind: 'route', onBack, lockVerticalSwipes: false });
}
```

Keep `TopBackButton` and `BackLink` API-compatible, but use `router.replace(href)` for the native direct-entry fallback until Task 12 adds marker-proven `history.back()`. Increase visible browser back targets to `min-h-11 min-w-11`.

- [ ] **Step 5: Remove the duplicate listing-detail registration**

Delete the `<BackLink href={backHref} label="Bozor" />` from `MarketplaceListingDetail`; `MarketplaceShell backHref={backHref}` remains the one route layer. Keep the share button aligned to the end in its own row or move it into the listing title card without adding another native handler.

- [ ] **Step 6: Add guarded meaningful haptic helpers**

Add to `telegram-shell.ts`:

```ts
import type { TelegramWebApp } from './types';

export function telegramHaptic(
  webApp: TelegramWebApp | undefined,
  kind: 'selection' | 'success' | 'warning' | 'error',
  reducedMotion: boolean,
) {
  if (!webApp || reducedMotion) return;
  try {
    if (kind === 'selection') webApp.HapticFeedback?.selectionChanged?.();
    else webApp.HapticFeedback?.notificationOccurred(kind);
  } catch {
    return;
  }
}
```

Extend the pure test with a fake HapticFeedback object and assert selection/success fire once, absent SDK is a no-op, and `reducedMotion=true` suppresses feedback.

- [ ] **Step 7: Add a lifecycle-level fake Mini App harness**

Install a DOM environment without widening the test filename glob:

```bash
npm install --save-dev jsdom
```

Create `telegram-mini-app.integration.test.ts` with `// @vitest-environment jsdom`. Use `createRoot`, `act`, and `React.createElement` so the file stays `.test.ts`. The fake must expose actual handler sets rather than only spies:

```ts
function createFakeWebApp() {
  const backHandlers = new Set<() => void>();
  const eventHandlers = new Map<string, Set<() => void>>();
  const onEvent = vi.fn((event: string, handler: () => void) => {
    const handlers = eventHandlers.get(event) ?? new Set();
    handlers.add(handler);
    eventHandlers.set(event, handlers);
  });
  const offEvent = vi.fn((event: string, handler: () => void) => {
    eventHandlers.get(event)?.delete(handler);
  });
  return {
    webApp: {
      initData: 'fixture', colorScheme: 'light' as const, viewportStableHeight: 700,
      safeAreaInset: { top: 20, right: 0, bottom: 10, left: 0 },
      contentSafeAreaInset: { top: 36, right: 0, bottom: 18, left: 0 },
      ready: vi.fn(), expand: vi.fn(), onEvent, offEvent,
      setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(), setBottomBarColor: vi.fn(),
      disableVerticalSwipes: vi.fn(), enableVerticalSwipes: vi.fn(),
      BackButton: {
        show: vi.fn(), hide: vi.fn(),
        onClick: vi.fn((handler: () => void) => backHandlers.add(handler)),
        offClick: vi.fn((handler: () => void) => backHandlers.delete(handler)),
      },
    },
    pressBack: () => backHandlers.forEach((handler) => handler()),
    emit: (event: string) => eventHandlers.get(event)?.forEach((handler) => handler()),
    backHandlers,
    eventHandlers,
  };
}
```

Mount `TelegramViewportBootstrap` and `TelegramBackProvider` around two small `Layer` components that call `useTelegramBackLayer` with stable literal IDs. The integration test must prove all of these observable contracts:

```ts
expect(fake.webApp.BackButton.onClick).toHaveBeenCalledTimes(1);
fake.pressBack();
expect(secondOverlayBack).toHaveBeenCalledTimes(1); // strict LIFO
expect(firstOverlayBack).not.toHaveBeenCalled();

const enablesBeforeClosing = fake.webApp.enableVerticalSwipes.mock.calls.length;
// Rerender with only the first locking overlay: swipes stay locked.
expect(fake.webApp.enableVerticalSwipes).toHaveBeenCalledTimes(enablesBeforeClosing);
// Rerender with no locking overlay: only now may swipes be restored.
expect(fake.webApp.enableVerticalSwipes.mock.calls.length).toBeGreaterThan(enablesBeforeClosing);

(fake.webApp as TelegramWebApp).colorScheme = 'dark';
fake.emit('themeChanged');
expect(document.documentElement.classList.contains('dark')).toBe(true);

root.unmount();
expect(fake.backHandlers.size).toBe(0);
expect([...fake.eventHandlers.values()].every((handlers) => handlers.size === 0)).toBe(true);
expect(fake.webApp.BackButton.offClick).toHaveBeenCalledTimes(1);
```

Import `TelegramWebApp` for the assignment cast, and wrap every mount, rerender, emitted event, and unmount in `await act(async () => { ... })`. Reset `localStorage`, the root class, and `window.Telegram` after each test. This is the concrete fake SDK harness referenced by Task 13.

- [ ] **Step 8: Run tests and commit the native interaction owner**

Run: `npm test -- src/components/telegram/telegram-back-provider.test.ts src/components/telegram/telegram-mini-app.integration.test.ts src/lib/telegram-shell.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/telegram/telegram-back-provider.tsx frontend/src/components/telegram/telegram-back-provider.test.ts frontend/src/components/telegram/telegram-mini-app.integration.test.ts frontend/src/app/layout.tsx frontend/src/hooks/use-telegram-back-button.ts frontend/src/components/navigation/top-back-button.tsx frontend/src/components/navigation/back-link.tsx frontend/src/components/marketplace/marketplace-listing-detail.tsx frontend/src/lib/telegram-shell.ts frontend/src/lib/telegram-shell.test.ts
git commit -m "feat(telegram): centralize native back behavior"
```

## Task 6: Add pending navigation and collapsible state-preserving search

**Files:**

- Create: `frontend/src/lib/marketplace-search-collapse.ts`
- Create: `frontend/src/lib/marketplace-search-collapse.test.ts`
- Create: `frontend/src/components/marketplace/marketplace-navigation.tsx`
- Create: `frontend/src/components/marketplace/marketplace-search.tsx`
- Create: `frontend/src/app/marketplace/layout.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-shell.tsx`
- Modify: `frontend/src/app/marketplace/page.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write failing search-collapse reducer tests**

```ts
import { describe, expect, it } from 'vitest';

import { initialSearchChromeState, reduceSearchChrome } from './marketplace-search-collapse';

describe('marketplace search chrome', () => {
  it('collapses only after threshold plus downward hysteresis', () => {
    let state = initialSearchChromeState(false);
    state = reduceSearchChrome(state, { type: 'scroll', y: 60 });
    expect(state.phase).toBe('expanded');
    state = reduceSearchChrome(state, { type: 'scroll', y: 73 });
    state = reduceSearchChrome(state, { type: 'scroll', y: 98 });
    expect(state.phase).toBe('collapsing');
    expect(reduceSearchChrome(state, { type: 'transitionEnd' }).phase).toBe('compact');
  });

  it('ignores jitter, expands after an upward 24px move, and clamps iOS bounce', () => {
    let state = { ...initialSearchChromeState(false), phase: 'compact' as const, lastY: 120, direction: 'none' as const, directionAnchorY: 120 };
    state = reduceSearchChrome(state, { type: 'scroll', y: 112 });
    expect(state.phase).toBe('compact');
    state = reduceSearchChrome(state, { type: 'scroll', y: 94 });
    expect(state.phase).toBe('expanded');
    expect(reduceSearchChrome(state, { type: 'scroll', y: -30 }).lastY).toBe(0);
  });

  it('pins expanded while focused and starts short landscape compact', () => {
    let state = initialSearchChromeState(true);
    expect(state.phase).toBe('compact');
    state = reduceSearchChrome(state, { type: 'focus' });
    state = reduceSearchChrome(state, { type: 'scroll', y: 300 });
    expect(state.phase).toBe('expanded');
    expect(state.focused).toBe(true);
  });

  it('opens and closes a compact search session explicitly', () => {
    let state = { ...initialSearchChromeState(false), phase: 'compact' as const };
    state = reduceSearchChrome(state, { type: 'open' });
    expect(state).toMatchObject({ phase: 'expanded', sessionOpen: true });
    expect(reduceSearchChrome(state, { type: 'close' })).toMatchObject({
      phase: 'compact', sessionOpen: false,
    });
  });
});
```

- [ ] **Step 2: Run the reducer test and confirm RED**

Run: `npm test -- src/lib/marketplace-search-collapse.test.ts`

Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Implement deterministic hysteresis**

```ts
export type SearchChromePhase = 'expanded' | 'collapsing' | 'compact';
export type ScrollDirection = 'up' | 'down' | 'none';
export interface SearchChromeState {
  phase: SearchChromePhase;
  lastY: number;
  direction: ScrollDirection;
  directionAnchorY: number;
  focused: boolean;
  sessionOpen: boolean;
  shortLandscape: boolean;
}
export type SearchChromeAction =
  | { type: 'scroll'; y: number }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'transitionEnd' }
  | { type: 'landscape'; short: boolean };

const COLLAPSE_AFTER_Y = 72;
const HYSTERESIS = 24;

export function initialSearchChromeState(shortLandscape: boolean): SearchChromeState {
  return {
    phase: shortLandscape ? 'compact' : 'expanded', lastY: 0,
    direction: 'none', directionAnchorY: 0, focused: false,
    sessionOpen: false, shortLandscape,
  };
}

export function reduceSearchChrome(state: SearchChromeState, action: SearchChromeAction): SearchChromeState {
  if (action.type === 'focus') return { ...state, focused: true, phase: 'expanded' };
  if (action.type === 'blur') return { ...state, focused: false };
  if (action.type === 'open') return { ...state, sessionOpen: true, phase: 'expanded' };
  if (action.type === 'close') return { ...state, sessionOpen: false, focused: false, phase: 'compact' };
  if (action.type === 'transitionEnd') return { ...state, phase: state.phase === 'collapsing' ? 'compact' : state.phase };
  if (action.type === 'landscape') {
    return { ...state, shortLandscape: action.short, phase: action.short && !state.focused ? 'compact' : state.phase };
  }

  const y = Math.max(0, action.y);
  if (state.focused || state.sessionOpen || y <= 8) {
    return { ...state, phase: 'expanded', lastY: y, direction: 'none', directionAnchorY: y };
  }
  const direction: ScrollDirection = y > state.lastY ? 'down' : y < state.lastY ? 'up' : state.direction;
  const anchor = direction !== state.direction ? state.lastY : state.directionAnchorY;
  let phase = state.phase;
  if (direction === 'down' && y >= COLLAPSE_AFTER_Y && y - anchor >= HYSTERESIS) phase = 'collapsing';
  if (direction === 'up' && anchor - y >= HYSTERESIS) phase = 'expanded';
  return { ...state, phase, lastY: y, direction, directionAnchorY: anchor };
}
```

- [ ] **Step 4: Add a persistent pending-navigation context**

Implement a client provider in `marketplace-navigation.tsx` whose `navigate(href)` wraps `router.push(href)` in `startTransition`. Its `MarketplacePendingLink` renders a real Next `Link`, intercepts only an unmodified primary-button click, and leaves new-tab, download, external, and modifier-key behavior untouched. Expose `{ pending, navigate }` through `useMarketplaceNavigation()` and set `aria-busy={pending}` on the result section. When pending changes from true to false, focus `#marketplace-results-heading` with `preventScroll: true` unless an element inside `[role="dialog"]` owns focus. Make the heading `tabIndex={-1}`. Make the context default `undefined`; `MarketplaceSearch` uses `useRouter().push` when no marketplace provider exists, so the shared shell search still works on tournaments, profiles, and other non-marketplace routes.

Use this click guard exactly:

```ts
const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
if (event.defaultPrevented || modified || event.button !== 0 || target === '_blank') return;
event.preventDefault();
navigate(href);
```

Create `frontend/src/app/marketplace/layout.tsx`:

```tsx
import { MarketplaceNavigationProvider } from '@/components/marketplace/marketplace-navigation';

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <MarketplaceNavigationProvider>{children}</MarketplaceNavigationProvider>;
}
```

- [ ] **Step 5: Implement the client search island**

`MarketplaceSearch` receives `rawQuery`, `initialQuery`, and `collapsible`. It uses `setMarketplaceSearch()` and `marketplaceHref()` on submit, the reducer above, a passive requestAnimationFrame-throttled scroll listener, and a media query for `(orientation: landscape) and (max-height: 480px)`. Register `sessionOpen` as an overlay back layer with `lockVerticalSwipes: false`. Use a stable React ID and the complete provider contract:

```tsx
const searchLayerId = React.useId();
useTelegramBackLayer({
  id: searchLayerId,
  kind: 'overlay',
  onBack: () => dispatch({ type: 'close' }),
  lockVerticalSwipes: false,
}, state.sessionOpen);
```

Its compact button is 44×44px and carries `aria-label="Qidiruvni ochish"`. On mount or `hashchange`, if `window.location.hash === '#marketplace-search'`, open the session and focus the input. Observe the containing `<header>` with `ResizeObserver` and write its height to `--marketplace-sticky-height` on the nearest `[data-marketplace-shell]`; clean up the observer and inline variable on unmount.

The submit handler must be:

```ts
function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  navigate(marketplaceHref(setMarketplaceSearch(new URLSearchParams(rawQuery), value)));
  inputRef.current?.blur();
}
```

The expanded form uses `onFocusCapture={() => dispatch({ type: 'focus' })}` and `onBlurCapture` only collapses after focus leaves the form. Animate the form's inner `transform` and `opacity` for 180ms, then dispatch `transitionEnd`; with reduced motion, dispatch it immediately.

- [ ] **Step 6: Replace both lossy shell forms**

Add `marketplaceQuery?: string` and `collapsibleSearch?: boolean` to `MarketplaceShell`. Render one `MarketplaceSearch` instance in the responsive header instead of separate desktop/mobile GET forms. On `/marketplace`, pass the raw query and `collapsibleSearch`; on other shell pages, use a non-collapsible search with an empty marketplace query. Move the unverified-account notice outside the sticky `<header>` into normal document flow so it never becomes permanent marketplace chrome.

Update CSS so compact/expanded content never causes horizontal overflow and the header block snaps only after the inner 180ms transition:

```css
.marketplace-search-inner { transition: transform 180ms ease, opacity 180ms ease; }
.marketplace-search[data-phase='collapsing'] .marketplace-search-inner { transform: translateY(-0.25rem); opacity: 0; }
@media (prefers-reduced-motion: reduce) { .marketplace-search-inner { transition: none; } }
```

- [ ] **Step 7: Run focused verification and commit**

Run: `npm test -- src/lib/marketplace-search-collapse.test.ts src/lib/marketplace-query.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/lib/marketplace-search-collapse.ts frontend/src/lib/marketplace-search-collapse.test.ts frontend/src/components/marketplace/marketplace-navigation.tsx frontend/src/components/marketplace/marketplace-search.tsx frontend/src/app/marketplace/layout.tsx frontend/src/components/marketplace/marketplace-shell.tsx frontend/src/app/marketplace/page.tsx frontend/src/app/globals.css
git commit -m "feat(marketplace): preserve search and collapse mobile chrome"
```

## Task 7: Build the 320px-safe toolbar and Auto/List/Grid control

**Files:**

- Create: `frontend/src/components/marketplace/marketplace-toolbar.tsx`
- Create: `frontend/src/components/marketplace/marketplace-view-menu.tsx`
- Create: `frontend/src/components/marketplace/marketplace-toolbar.test.ts`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Modify: `frontend/src/components/marketplace/listing-filters.tsx`
- Modify: `frontend/src/components/marketplace/sort-menu.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write a failing toolbar/view source contract**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const toolbar = readFileSync(new URL('./marketplace-toolbar.tsx', import.meta.url), 'utf8');
const view = readFileSync(new URL('./marketplace-view-menu.tsx', import.meta.url), 'utf8');
const sort = readFileSync(new URL('./sort-menu.tsx', import.meta.url), 'utf8');

describe('marketplace mobile toolbar contract', () => {
  it('keeps the two buyer actions visible and all four targets touch-sized', () => {
    expect(toolbar).toContain('filterTrigger');
    expect(toolbar).toContain('playerTrigger');
    expect(toolbar).toContain('marketplace-toolbar-actions');
    expect(toolbar).toContain('min-h-11');
    expect(view).toContain('min-h-11');
    expect(sort).toContain('min-h-11');
  });

  it('exposes Auto, list, and grid as explicit accessible choices', () => {
    expect(view).toContain('Auto');
    expect(view).toContain('Ro‘yxat');
    expect(view).toContain('Katak');
    expect(view).toContain('aria-current');
    expect(view).toContain('useTelegramBackLayer');
  });
});
```

- [ ] **Step 2: Run the toolbar test and confirm RED**

Run: `npm test -- src/components/marketplace/marketplace-toolbar.test.ts`

Expected: FAIL because the toolbar and view-menu files do not exist.

- [ ] **Step 3: Implement the view menu with lossless links**

Use this fixed option contract:

```ts
const VIEW_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'list', label: 'Ro‘yxat' },
  { value: 'grid', label: 'Katak' },
] as const;
```

Every option href is `marketplaceHref(setMarketplaceView(new URLSearchParams(rawQuery), option.value))`. The trigger is `min-h-11 min-w-11`, displays the current icon, and has an explicit `aria-label`. Register the open menu with `const viewLayerId = React.useId()` and `useTelegramBackLayer({ id: viewLayerId, kind: 'overlay', onBack: () => setOpen(false), lockVerticalSwipes: false }, open)`. Close it on Escape, outside click, option navigation, and native Back.

- [ ] **Step 4: Make sorting immediate, accessible, and touch-sized**

Keep `SortMenuOption.href`, replace its 36px trigger with `min-h-11 min-w-11`, show the current label next to the compact icon in the toolbar's result-summary row, and use `MarketplacePendingLink` for menu options. Register it with `const sortLayerId = React.useId()` and `useTelegramBackLayer({ id: sortLayerId, kind: 'overlay', onBack: () => setOpen(false), lockVerticalSwipes: false }, open)`. Preserve the active option text in `aria-label`, for example `Saralash: Eng yangi`.

- [ ] **Step 5: Compose the responsive toolbar**

`MarketplaceToolbar` receives the result count, two trigger nodes, sort options/current label, raw query, current view, and quick-chip node. Render this stable order:

```tsx
<div className="space-y-2">
  <div className="marketplace-toolbar-actions">
    <div className="min-w-0 [&>*]:min-h-11">{filterTrigger}</div>
    <div className="min-w-0 [&>*]:min-h-11">{playerTrigger}</div>
    <SortMenu options={sortOptions} activeId={activeSortId} compact />
    <MarketplaceViewMenu rawQuery={rawQuery} view={view} />
  </div>
  <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
    <p className="font-semibold text-muted-foreground" aria-live="polite">
      {formatCompactNumber(totalElements)} ta e‘lon
    </p>
    <p className="truncate font-semibold text-muted-foreground">{activeSortLabel}</p>
  </div>
  {quickChips}
</div>
```

The `Filtrlar` and `O‘yinchilar` trigger contents retain visible labels and separate numeric badges. Use separate counts from Task 2. Render `<h1 id="marketplace-results-heading">` as visually compact on phones and visible in the desktop result summary; set the result region `aria-labelledby="marketplace-results-heading"`. The heading text is the current search title or `eFootball akkountlar` and remains in the accessibility tree at every width.

- [ ] **Step 6: Add the 320px intrinsic toolbar CSS**

```css
.marketplace-toolbar-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
  gap: 8px;
  align-items: center;
}
.marketplace-toolbar-actions > * { min-width: 0; }
.marketplace-toolbar-actions > :nth-child(3) { justify-self: end; }
.marketplace-toolbar-actions > :nth-child(4) { justify-self: start; }
@media (min-width: 360px) {
  .marketplace-toolbar-actions {
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr) 44px 44px;
  }
  .marketplace-toolbar-actions > :nth-child(3),
  .marketplace-toolbar-actions > :nth-child(4) { justify-self: stretch; }
}
@media (min-width: 640px) {
  .marketplace-toolbar-actions {
    display: flex;
    gap: 0.5rem;
  }
}
```

The 320px fallback deliberately places sort and view on a compact second row so independent controls keep an 8px gap and 44px targets. At 360px and above all four actions share one row. Ensure labels use 12px text at the narrow breakpoint and truncate only badges/current values, never the words `Filtrlar` or `O‘yinchilar`.

- [ ] **Step 7: Replace `BrowseHeader` and local view links**

In `MarketplaceBrowser`, remove `BrowseHeader`, local `browseHref`, local `viewHref`, and the player-match banner. Compose the new toolbar, then `AppliedFilterChips`, then the result region. Build quick, sort, and pagination links exclusively from the raw public query helpers. Convert quick chips to `MarketplacePendingLink`; on an actual unmodified same-tab selection, emit one selection haptic before pending navigation.

- [ ] **Step 8: Run focused verification and commit**

Run: `npm test -- src/components/marketplace/marketplace-toolbar.test.ts src/lib/marketplace-query.test.ts src/lib/marketplace-applied-filters.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/components/marketplace/marketplace-toolbar.tsx frontend/src/components/marketplace/marketplace-view-menu.tsx frontend/src/components/marketplace/marketplace-toolbar.test.ts frontend/src/components/marketplace/marketplace-browser.tsx frontend/src/components/marketplace/listing-filters.tsx frontend/src/components/marketplace/sort-menu.tsx frontend/src/app/globals.css
git commit -m "feat(marketplace): add responsive browse toolbar"
```

## Task 8: Replace the mobile filter modal with a validated Radix sheet

**Files:**

- Create: `frontend/src/components/marketplace/listing-filter-fields.tsx`
- Create: `frontend/src/components/marketplace/marketplace-filter-sheet.tsx`
- Create: `frontend/src/components/marketplace/marketplace-filter-sheet.test.ts`
- Modify: `frontend/src/components/marketplace/listing-filters.tsx`
- Modify: `frontend/src/components/marketplace/card-picker-field.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Delete: `frontend/src/components/marketplace/mobile-filter-sheet.tsx`

- [ ] **Step 1: Write a failing accessible-sheet source contract**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync(new URL('./marketplace-filter-sheet.tsx', import.meta.url), 'utf8');
const fields = readFileSync(new URL('./listing-filter-fields.tsx', import.meta.url), 'utf8');

describe('marketplace detailed filter sheet contract', () => {
  it('uses Radix, draft validation, cancellable 300ms preview, and overlay back', () => {
    expect(sheet).toContain("@radix-ui/react-dialog");
    expect(sheet).toContain('<Dialog.Title');
    expect(sheet).toContain('<Dialog.Description');
    expect(sheet).toContain('300');
    expect(sheet).toContain('AbortController');
    expect(sheet).toContain('controller.abort()');
    expect(sheet).toContain('validateMarketplaceFilterDraft');
    expect(sheet).toContain('useTelegramBackLayer');
  });

  it('renders all three labeled progressive groups and buyer-facing CTA states', () => {
    expect(fields).toContain('Asosiy');
    expect(fields).toContain('Akkount');
    expect(fields).toContain('Xavfsizlik');
    expect(fields).toContain('<Label');
    expect(sheet).toContain("ta e‘lonni ko‘rsatish");
    expect(sheet).toContain('Natijalarni ko‘rsatish');
  });
});
```

- [ ] **Step 2: Run the sheet test and confirm RED**

Run: `npm test -- src/components/marketplace/marketplace-filter-sheet.test.ts`

Expected: FAIL because the two files do not exist.

- [ ] **Step 3: Make valuable-card selection controlled**

Change `CardPickerField` to this controlled API and remove its one-time `useState(default...)`:

```ts
interface CardPickerFieldProps {
  value: PlayerCard | null;
  onChange(value: PlayerCard | null): void;
  placeholder?: string;
  id?: string;
}
```

Pass `value ? [value] : []` to `CardPicker` and map `onChange={(cards) => onChange(cards[0] ?? null)}`. The filter draft owns the selected card, so route changes and clear actions cannot leave stale internal state.

- [ ] **Step 4: Implement the shared controlled field groups**

`ListingFilterFields` accepts:

```ts
interface ListingFilterFieldsProps {
  draft: MarketplaceFilterDraft;
  errors: MarketplaceFilterErrors;
  onChange(next: MarketplaceFilterDraft): void;
  collapsible: boolean;
}
```

Render these exact group contents, keeping each `Label htmlFor` paired with its control ID:

- `Asosiy`: platform; min/max price; negotiable; division.
- `Akkount`: min/max team strength; Android/iOS minimum coins; exchange; controlled valuable player.
- `Xavfsizlik`: minimum device-transfer limit; Google Play disconnected; Game Center disconnected.

Use `inputMode="numeric"` for nonnegative integer values, ordinary number input for coin fields so a minus sign is available, `aria-invalid` when a field/group error exists, and `<p role="alert">` immediately after invalid controls. Mobile groups use `<details defaultOpen={groupId === 'main'}>`; desktop renders all fieldsets expanded.

- [ ] **Step 5: Implement sheet draft, debounce, abort, and apply**

The sheet owns `draft`, `preview`, and `open`. On every open, reset draft from `filterDraftFromBrowseParams(filters)`. Define `const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')` using the existing hook. Use this effect exactly:

```ts
const errors = validateMarketplaceFilterDraft(draft);
const valid = Object.keys(errors).length === 0;

useEffect(() => {
  if (!open || !valid) {
    setPreview({ status: 'idle' });
    return;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    setPreview({ status: 'loading' });
    fetchMarketplaceResultCount(new URLSearchParams(rawQuery), draft, controller.signal)
      .then((count) => setPreview({ status: 'success', count }))
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') setPreview({ status: 'error' });
      });
  }, 300);
  return () => {
    window.clearTimeout(timer);
    controller.abort();
  };
}, [open, valid, rawQuery, draft]);
```

Apply only when valid:

```ts
function apply() {
  if (!valid) return;
  const next = applyMarketplaceFilterDraft(new URLSearchParams(rawQuery), draft);
  telegramHaptic(getTelegramWebApp(), 'success', reducedMotion);
  navigate(marketplaceHref(next));
  setOpen(false);
}
```

The fixed-height primary CTA label is `N ta e‘lonni ko‘rsatish` on success, a same-size spinner plus `Hisoblanmoqda` while loading, and `Natijalarni ko‘rsatish` for idle/error. Put the count/status text in `aria-live="polite"` without replacing the focused button node. Preview error never disables apply; invalid draft does. `Tozalash` only calls `setDraft(clearMarketplaceFilterDraft())` and does not navigate.

- [ ] **Step 6: Apply mobile dialog ergonomics**

Use Radix Overlay/Content and register the controlled sheet with the full provider contract:

```tsx
const filterLayerId = React.useId();
useTelegramBackLayer({
  id: filterLayerId,
  kind: 'overlay',
  onBack: () => setOpen(false),
  lockVerticalSwipes: true,
}, open);
```

Use `max-height: min(92dvh, var(--tg-viewport-height, 92dvh))` and footer padding `calc(0.75rem + var(--app-content-safe-bottom))`. The footer remains visible with the keyboard; content alone scrolls with `overscroll-contain`. Close/cancel discards draft and returns focus to `Filtrlar`.

- [ ] **Step 7: Reuse the same fields in the desktop sidebar**

Make `ListingFilters` a small client controller with local draft and the same validation/apply mutation, but no dialog and no count preview. Its Apply and Clear targets are 44px. Applying preserves q/player/sort/view; clearing clears only the draft until Apply. This keeps desktop and mobile field semantics identical.

- [ ] **Step 8: Wire the sheet, remove the old modal, and verify**

Replace `MobileFilterSheet` in `MarketplaceBrowser` with `MarketplaceFilterSheet`, then delete `mobile-filter-sheet.tsx`.

Run: `npm test -- src/components/marketplace/marketplace-filter-sheet.test.ts src/lib/marketplace-filter-draft.test.ts src/lib/marketplace-preview.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/components/marketplace/listing-filter-fields.tsx frontend/src/components/marketplace/marketplace-filter-sheet.tsx frontend/src/components/marketplace/marketplace-filter-sheet.test.ts frontend/src/components/marketplace/listing-filters.tsx frontend/src/components/marketplace/card-picker-field.tsx frontend/src/components/marketplace/marketplace-browser.tsx frontend/src/components/marketplace/mobile-filter-sheet.tsx
git commit -m "feat(marketplace): add deliberate mobile filter sheet"
```

## Task 9: Polish player filtering and preserve real card identity

**Files:**

- Create: `frontend/src/lib/player-filter-cache.ts`
- Create: `frontend/src/lib/player-filter-cache.test.ts`
- Modify: `frontend/src/lib/player-match-query.ts`
- Modify: `frontend/src/lib/player-match-query.test.ts`
- Modify: `frontend/src/components/marketplace/player-filter-launcher.tsx`
- Modify: `frontend/src/components/marketplace/player-filter-dialog.tsx`
- Modify: `frontend/src/components/marketplace/player-filter-dialog.test.ts`
- Modify: `frontend/src/app/marketplace/page.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`

- [ ] **Step 1: Write failing strictness-band and metadata-cache tests**

```ts
import { describe, expect, it } from 'vitest';

import { mergeCachedPlayerSelections, parsePlayerFilterCache, serializePlayerFilterCache } from './player-filter-cache';
import { strictnessLabel } from './player-match-query';

const playerId = '11111111-1111-4111-8111-111111111111';

describe('player filter presentation state', () => {
  it('uses the approved plain-language strictness bands', () => {
    expect([1, 2].map(strictnessLabel)).toEqual(['Keng qidiruv', 'Keng qidiruv']);
    expect([3, 4].map(strictnessLabel)).toEqual(['Moslashuvchan', 'Moslashuvchan']);
    expect([5, 6].map(strictnessLabel)).toEqual(['Muvozanatli', 'Muvozanatli']);
    expect([7, 8].map(strictnessLabel)).toEqual(['Aniqroq', 'Aniqroq']);
    expect([9, 10].map(strictnessLabel)).toEqual(['Juda qat’iy', 'Juda qat’iy']);
  });

  it('prefers the exact edition and limits canonical fallback to the player name', () => {
    const cached = [
      {
        efhubId: 101, playerId, name: 'Lionel Messi', priority: true,
        maxOverallRating: 106, cardType: 'EPIC', imageUrl: '/messi-epic.png',
      },
      {
        efhubId: 202, playerId, name: 'Lionel Messi', priority: false,
        maxOverallRating: 99, cardType: 'STANDARD', imageUrl: '/messi-standard.png',
      },
    ];
    expect(parsePlayerFilterCache(serializePlayerFilterCache(cached))).toEqual(cached);
    expect(mergeCachedPlayerSelections([{ efhubId: 202, playerId, importance: 'P' }], cached)[0])
      .toMatchObject({
        efhubId: 202, playerId, name: 'Lionel Messi', priority: true,
        maxOverallRating: 99, cardType: 'STANDARD', imageUrl: '/messi-standard.png',
      });
    expect(mergeCachedPlayerSelections([{ efhubId: 303, playerId, importance: 'N' }], cached)[0])
      .toEqual({ efhubId: 303, playerId, name: 'Lionel Messi', priority: false });
  });

  it('uses neutral copy for a direct shared link with no session snapshot', () => {
    expect(mergeCachedPlayerSelections([{ efhubId: 101, playerId, importance: 'N' }], [])[0].name)
      .toBe('Tanlangan karta');
    expect(parsePlayerFilterCache('{bad json')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm test -- src/lib/player-filter-cache.test.ts src/lib/player-match-query.test.ts`

Expected: cache test FAIL because the module is missing; strictness expectations FAIL against old labels.

- [ ] **Step 3: Implement session-safe snapshot helpers**

```ts
import type { PlayerMatchCriterion } from './player-match-query';
import type { PlayerMatchSelection } from './player-filter-selection';

export const PLAYER_FILTER_CACHE_KEY = 'efbazaar:player-filter-cards:v1';

export function serializePlayerFilterCache(cards: PlayerMatchSelection[]) {
  return JSON.stringify(cards.slice(0, 11));
}

export function parsePlayerFilterCache(raw: string | null): PlayerMatchSelection[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((card) => {
      if (!card || typeof card !== 'object') return [];
      const item = card as Record<string, unknown>;
      if (typeof item.efhubId !== 'number' || !Number.isSafeInteger(item.efhubId)
        || typeof item.playerId !== 'string' || typeof item.name !== 'string') return [];
      return [item as unknown as PlayerMatchSelection];
    }).slice(0, 11);
  } catch {
    return [];
  }
}

export function mergeCachedPlayerSelections(
  criteria: PlayerMatchCriterion[],
  cached: PlayerMatchSelection[],
) {
  return criteria.map((criterion) => {
    const exact = cached.find((card) => card.efhubId === criterion.efhubId);
    const canonical = exact
      ? undefined
      : cached.find((card) => card.playerId === criterion.playerId);
    const snapshot = exact
      ? exact
      : canonical
        ? { name: canonical.name }
        : undefined;
    return {
      ...snapshot,
      efhubId: criterion.efhubId,
      playerId: criterion.playerId,
      name: snapshot?.name ?? 'Tanlangan karta',
      priority: criterion.importance === 'P',
    };
  });
}
```

Replace `strictnessLabel()` with the exact 1–2, 3–4, 5–6, 7–8, 9–10 bands asserted above. Keep `strictnessMinimumPercent()` unchanged because backend scoring does not change.

- [ ] **Step 4: Hydrate and write metadata in the launcher**

Read the cache in a mount effect, map active criteria through `mergeCachedPlayerSelections`, and write the selected snapshots to sessionStorage immediately before applying. Never render `Karta #ID`. A storage exception is a no-op.

Make Dream Team loading lazy: add `onOpenChange(open)` to `PlayerFilterDialog`; on the first `true`, fetch `/v1/dream-teams`, keep `teams[0]`, and abort on launcher unmount. Pass `authenticated={user !== null}` from `MarketplacePage` through `MarketplaceBrowser` and the launcher so a signed-out Team tab links to `/auth/login?from=/dream-team`, while an authenticated user with no team links to `/dream-team`. A 401/403 never affects META/search. Give the trigger `id="marketplace-player-filter"`; on mount or `hashchange`, open the dialog when that hash is present so empty-state edit links are one action.

Keep META/search catalogue hooks inside the open Radix content and do not prefetch cards from the launcher. Closing the dialog aborts in-flight catalogue requests; opening it is the first point at which the catalogue may load.

- [ ] **Step 5: Apply the approved dialog interaction copy**

- Trigger text is always visible as `O‘yinchilar` and retains the selected count.
- Priority action is labeled `Muhim o‘yinchi`; help says it affects ranking and is not mandatory.
- Slider's primary label is the five-band `strictnessLabel`; secondary help contains the exact percentage and 75% alternate-edition credit without the English word `weighted`.
- Apply CTA is `N o‘yinchi bo‘yicha qidirish`.
- META empty copy says `META kartalar hozircha yo‘q`; remove `/admin/players` from all buyer UI.
- Team tab shows only the singleton team and `Jamoani tahrirlash`; signed-out/missing team offers `/auth/login?from=/dream-team` when authentication is required and `/dream-team` otherwise.

- [ ] **Step 6: Integrate overlay back, safe area, and selection haptics**

Register the controlled player sheet with a stable ID and complete layer:

```tsx
const playerLayerId = React.useId();
useTelegramBackLayer({
  id: playerLayerId,
  kind: 'overlay',
  onBack: () => onOpenChange(false),
  lockVerticalSwipes: true,
}, open);
```

Set its available height from `var(--tg-viewport-height)` and footer bottom padding from `var(--app-content-safe-bottom)`. Call selection haptic only when a card was actually added/removed or priority changed; rejected twelfth-player taps do not vibrate. Call success haptic after Apply begins. Keep reduced-motion classes on overlay, sheet, spinner, and catalogue skeleton.

- [ ] **Step 7: Extend the existing source contract and verify**

Add assertions that the source contains `O‘yinchilar`, `Muhim o‘yinchi`, semantic safe-bottom CSS, `useTelegramBackLayer`, and `telegramHaptic`; assert it does not contain `Karta #`, `/admin/players`, or `weighted`.

Run: `npm test -- src/lib/player-filter-cache.test.ts src/lib/player-match-query.test.ts src/lib/player-filter-selection.test.ts src/components/marketplace/player-filter-dialog.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/lib/player-filter-cache.ts frontend/src/lib/player-filter-cache.test.ts frontend/src/lib/player-match-query.ts frontend/src/lib/player-match-query.test.ts frontend/src/components/marketplace/player-filter-launcher.tsx frontend/src/components/marketplace/player-filter-dialog.tsx frontend/src/components/marketplace/player-filter-dialog.test.ts frontend/src/app/marketplace/page.tsx frontend/src/components/marketplace/marketplace-browser.tsx
git commit -m "feat(marketplace): simplify player matching UX"
```

## Task 10: Rebuild listing cards and the responsive container grid

**Files:**

- Create: `frontend/src/components/marketplace/listing-card-model.ts`
- Create: `frontend/src/components/marketplace/listing-card-model.test.ts`
- Create: `frontend/src/components/marketplace/listing-card-media.tsx`
- Create: `frontend/src/components/marketplace/marketplace-listing-link.tsx`
- Create: `frontend/src/components/marketplace/responsive-listing-grid.tsx`
- Create: `frontend/src/components/marketplace/responsive-listing-grid.test.ts`
- Modify: `frontend/src/components/marketplace/listing-card.tsx`
- Modify: `frontend/src/components/marketplace/listing-card.test.ts`
- Modify: `frontend/src/components/marketplace/listing-like-button.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write failing card-model tests**

```ts
import { describe, expect, it } from 'vitest';

import { buildListingCardModel } from './listing-card-model';
import type { ListingResponse } from '@/lib/marketplace-types';

const messiId = '11111111-1111-4111-8111-111111111111';
const neymarId = '22222222-2222-4222-8222-222222222222';

function listing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1', sellerId: 'seller-1', description: 'Rare account', price: 500000,
    priceNegotiable: true, mediaMessageIds: [], status: 'ACTIVE', forwardCount: 0,
    likeCount: 2, likedByMe: false, createdAt: '2026-08-11T00:00:00Z',
    updatedAt: '2026-08-11T00:00:00Z', attributes: {}, ...overrides,
  };
}

describe('listing card model', () => {
  it('derives exact and alternate names through efhub and canonical player identity', () => {
    const model = buildListingCardModel(listing({
      matchPercent: 58,
      matchDetails: {
        percent: 58, exactCount: 1, alternateCount: 1, missingCount: 1,
        selectedCount: 3, strictness: 5, exactEfhubIds: [101], alternateEfhubIds: [202],
        missingEfhubIds: [303], priorityEfhubIds: [], earnedWeight: 1.75, possibleWeight: 3,
      },
      attributes: { valuable_players: [
        { efhub_id: 101, player_id: messiId, name: 'Lionel Messi' },
        { efhub_id: 999, player_id: neymarId, name: 'Neymar Jr' },
        { efhub_id: 404, player_id: '44444444-4444-4444-8444-444444444444', name: 'Mbappé' },
      ] },
    }), [
      { efhubId: 101, playerId: messiId, importance: 'N' },
      { efhubId: 202, playerId: neymarId, importance: 'N' },
      { efhubId: 303, playerId: '33333333-3333-4333-8333-333333333333', importance: 'N' },
    ]);
    expect(model.matchLabel).toBe('2/3 mos · 58%');
    expect(model.playerNames).toEqual(['Lionel Messi', 'Neymar Jr']);
    expect(model.playerRemainder).toBe(1);
  });

  it('falls back to valuable names and condenses transfer risks', () => {
    const model = buildListingCardModel(listing({ attributes: {
      valuable_players: [{ efhub_id: 101, name: 'Messi' }, { efhub_id: 202, name: 'Neymar' }, { efhub_id: 303, name: 'Mbappé' }],
      has_google_play_link: true, has_game_center_link: true, device_transfer_limit: 2,
    } }), []);
    expect(model.playerNames).toEqual(['Messi', 'Neymar']);
    expect(model.playerRemainder).toBe(1);
    expect(model.safety).toEqual({ tone: 'warning', label: '3 ta transfer xavfi' });
  });

  it('shows positive safety only when every relevant value is explicitly safe', () => {
    expect(buildListingCardModel(listing(), []).safety).toBeNull();
    expect(buildListingCardModel(listing({ attributes: {
      has_google_play_link: false, has_game_center_link: false, device_transfer_limit: 7,
    } }), []).safety).toEqual({ tone: 'safe', label: 'Transfer xavfsiz' });
  });
});
```

- [ ] **Step 2: Run the model test and confirm RED**

Run: `npm test -- src/components/marketplace/listing-card-model.test.ts`

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Implement the shared semantic card model**

```ts
import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import {
  attributeCardList,
  attributeNumber,
  listingAcceptsExchange,
  type ListingResponse,
} from '@/lib/marketplace-types';
import type { PlayerMatchCriterion } from '@/lib/player-match-query';

export function buildListingCardModel(
  listing: ListingResponse,
  criteria: PlayerMatchCriterion[],
) {
  const valuable = attributeCardList(listing, 'valuable_players');
  const details = listing.matchDetails;
  const exactIds = new Set(details?.exactEfhubIds ?? []);
  const alternatePlayerIds = new Set(
    criteria
      .filter((criterion) => details?.alternateEfhubIds.includes(criterion.efhubId))
      .map((criterion) => criterion.playerId),
  );
  const matched = valuable.filter((card) =>
    exactIds.has(card.efhubId) || Boolean(card.playerId && alternatePlayerIds.has(card.playerId)));
  const matchedIds = new Set(matched.map((card) => card.efhubId));
  const orderedPlayers = details
    ? [...matched, ...valuable.filter((card) => !matchedIds.has(card.efhubId))]
    : valuable;
  const names = orderedPlayers.map((card) => card.name).filter(Boolean);

  const hasGoogle = listing.attributes.has_google_play_link === true
    || listing.attributes.has_google_play_link === 'true';
  const hasGameCenter = listing.attributes.has_game_center_link === true
    || listing.attributes.has_game_center_link === 'true';
  const transferLimit = attributeNumber(listing, 'device_transfer_limit');
  const risks = Number(hasGoogle) + Number(hasGameCenter) + Number(transferLimit !== undefined && transferLimit <= 3);
  const allSafetyKnown = Object.hasOwn(listing.attributes, 'has_google_play_link')
    && Object.hasOwn(listing.attributes, 'has_game_center_link')
    && Object.hasOwn(listing.attributes, 'device_transfer_limit');

  return {
    title: listing.description.split('\n')[0]?.trim() || 'eFootball akkount',
    price: formatPriceUZS(listing.price),
    date: formatListingDate(listing.createdAt),
    sold: listing.status === 'SOLD',
    negotiable: listing.priceNegotiable,
    exchange: listingAcceptsExchange(listing),
    division: attributeNumber(listing, 'highest_division_level'),
    teamStrength: attributeNumber(listing, 'team_strength'),
    androidCoins: attributeNumber(listing, 'android_coins'),
    iosCoins: attributeNumber(listing, 'ios_coins'),
    valuableCount: valuable.length,
    matchLabel: details
      ? `${details.exactCount + details.alternateCount}/${details.selectedCount} mos · ${details.percent}%`
      : typeof listing.matchPercent === 'number' ? `${listing.matchPercent}% mos` : null,
    playerNames: names.slice(0, 2),
    playerRemainder: Math.max(0, names.length - 2),
    safety: risks > 0
      ? { tone: 'warning' as const, label: `${risks} ta transfer xavfi` }
      : allSafetyKnown && !hasGoogle && !hasGameCenter && (transferLimit ?? 0) > 3
        ? { tone: 'safe' as const, label: 'Transfer xavfsiz' }
        : null,
  };
}
```

- [ ] **Step 4: Write failing semantic-card and responsive-grid tests**

Extend `listing-card.test.ts` and create `responsive-listing-grid.test.ts` to assert:

```ts
expect((markup.match(/href="\/marketplace\/listing-1/g) ?? [])).toHaveLength(1);
expect(markup).toContain('aria-label="Sevimlilarga qo&#x27;shish"');
expect(markup).toContain('min-h-11 min-w-11');
expect(markup.indexOf("500 000 so&#x27;m")).toBeLessThan(markup.indexOf('2/3 mos · 58%'));
expect(markup.indexOf('2/3 mos · 58%')).toBeLessThan(markup.indexOf('Lionel Messi'));
expect(markup).toContain('data-marketplace-listing-id="listing-1"');
```

For `ResponsiveListingGrid`, assert `data-view="auto"` for Auto, `data-layout="horizontal"` for list, `data-layout="vertical"` for grid, and query-bearing links/listing IDs in every mode. Render `ResponsiveListingGridSkeleton` and assert it uses the same outer container, `data-view="auto"`, stable media/content geometry, the requested item count, and no listing links.

- [ ] **Step 5: Implement stable media and the initial tracked-link boundary**

`ListingCardMedia` is a client component with a `relative aspect-[4/3] overflow-hidden` box, `Image fill`, `sizes="(max-width: 379px) 34vw, (max-width: 695px) 50vw, (max-width: 1199px) 33vw, 224px"`, `priority` only for the first result, and `onError` that swaps to the same-size branded fallback. Use the existing same-origin `/bot/photo/{encodedFileId}` URL. Verify the optimized request in Task 13; if the local proxy returns a non-2xx through `/_next/image`, set `unoptimized` on this component while retaining Next Image sizing and lazy loading.

Create `MarketplaceListingLink` as a thin Next Link wrapper accepting `listingId`, `href`, `rawQuery`, `className`, and `children`. In this task it renders the real link; Task 12 adds its `onNavigate` marker without changing callers.

- [ ] **Step 6: Replace duplicated card branches with one article**

`ListingCard` receives `layout: 'auto' | 'horizontal' | 'vertical'`, `matchCriteria`, `detailQuery`, and `priority`. Render one content tree in this order: media, price/deal state, match summary, player names, title, division/strength, card count/coins, safety, date. Put one absolute full-card `MarketplaceListingLink` at `z-10`, noninteractive content below it, and `ListingLikeButton` at `z-20`. The favorite is a sibling of the link, never nested. The article receives:

```tsx
id={`marketplace-listing-${listing.id}`}
data-marketplace-listing-id={listing.id}
data-layout={layout}
className="listing-card group relative overflow-hidden rounded-xl border border-border bg-card shadow-card transition focus-within:ring-2 focus-within:ring-ring/40 hover:border-primary/40 hover:shadow-card-hover"
```

Sold cards show text/status overlay and omit the favorite. Match/safety include icons plus text. `META` appears only when actual displayed card data has `metaTier === 'META'`; do not add decorative META badges.

- [ ] **Step 7: Make the favorite independently touch-sized**

Change its base class to:

```ts
'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-black/60 px-2 text-[11px] font-semibold text-white backdrop-blur transition'
```

Keep `preventDefault()` and `stopPropagation()`, distinct pending/pressed/focus-visible states, and the optimistic rollback.

- [ ] **Step 8: Implement the container-query grid**

`ResponsiveListingGrid` wraps an outer `.marketplace-results-container` and inner list with `data-view`. Map list → horizontal, grid → vertical, Auto → auto. Pass parsed player criteria and `priority={index === 0}`. Use this component boundary:

```tsx
export function ResponsiveListingGrid({
  listings,
  view,
  rawQuery,
  matchCriteria,
}: {
  listings: ListingResponse[];
  view: MarketplaceView;
  rawQuery: string;
  matchCriteria: PlayerMatchCriterion[];
}) {
  const layout = view === 'list' ? 'horizontal' : view === 'grid' ? 'vertical' : 'auto';
  return (
    <div className="marketplace-results-container">
      <ul className="marketplace-listings" data-view={view}>
        {listings.map((listing, index) => (
          <li key={listing.id}>
            <ListingCard
              listing={listing}
              layout={layout}
              matchCriteria={matchCriteria}
              detailQuery={rawQuery}
              priority={index === 0}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResponsiveListingGridSkeleton({
  count = 6,
  label = 'E‘lonlar yuklanmoqda',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="marketplace-results-container" role="status" aria-label={label}>
      <ul className="marketplace-listings" data-view="auto" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="listing-card" data-layout="auto">
            <div className="aspect-[4/3] animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="space-y-2 p-3">
              <div className="h-5 w-2/3 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Add exact CSS thresholds:

```css
.marketplace-results-container { container-type: inline-size; }
.marketplace-listings { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.listing-card[data-layout='horizontal'],
.listing-card[data-layout='auto'] { display: grid; grid-template-columns: minmax(104px, 34%) minmax(0, 1fr); }
.listing-card[data-layout='vertical'] { display: flex; flex-direction: column; }

@container (min-width: 380px) {
  .marketplace-listings:not([data-view='list']) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .listing-card[data-layout='auto'] { display: flex; flex-direction: column; }
}
@container (min-width: 696px) {
  .marketplace-listings:not([data-view='list']) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container (min-width: 932px) {
  .marketplace-listings[data-view='grid'] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
```

Auto remains capped at three. Explicit grid may use four only when four 224px cards plus gaps fit. Explicit grid below 380px remains one vertical card; list remains one horizontal card.

- [ ] **Step 9: Run focused verification and commit**

Run: `npm test -- src/components/marketplace/listing-card-model.test.ts src/components/marketplace/listing-card.test.ts src/components/marketplace/responsive-listing-grid.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/components/marketplace/listing-card-model.ts frontend/src/components/marketplace/listing-card-model.test.ts frontend/src/components/marketplace/listing-card-media.tsx frontend/src/components/marketplace/marketplace-listing-link.tsx frontend/src/components/marketplace/responsive-listing-grid.tsx frontend/src/components/marketplace/responsive-listing-grid.test.ts frontend/src/components/marketplace/listing-card.tsx frontend/src/components/marketplace/listing-card.test.ts frontend/src/components/marketplace/listing-like-button.tsx frontend/src/components/marketplace/marketplace-browser.tsx frontend/src/app/globals.css
git commit -m "feat(marketplace): add responsive player-first listing cards"
```

## Task 11: Add buyer-facing loading, empty, error, and pagination states

**Files:**

- Create: `frontend/src/components/marketplace/marketplace-result-state.tsx`
- Create: `frontend/src/components/marketplace/marketplace-result-state.test.ts`
- Create: `frontend/src/components/marketplace/listings-pagination.test.ts`
- Create: `frontend/src/app/marketplace/loading.tsx`
- Create: `frontend/src/app/marketplace/error.tsx`
- Modify: `frontend/src/components/marketplace/listings-pagination.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Modify: `frontend/src/app/marketplace/[id]/page.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write failing result-state tests**

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarketplaceErrorState, getMarketplaceEmptyState } from './marketplace-result-state';

describe('marketplace result states', () => {
  it('prioritizes player match, then search, then general criteria', () => {
    const player = getMarketplaceEmptyState(new URLSearchParams('q=Messi&matchCard=101%3A11111111-1111-4111-8111-111111111111%3AN&matchStrictness=7&view=grid'));
    expect(player.title).toBe('Bu tarkibga mos akkount topilmadi');
    expect(player.primaryHref).toContain('matchStrictness=6');
    expect(player.primaryHref).toContain('q=Messi');

    const search = getMarketplaceEmptyState(new URLSearchParams('q=Messi&view=list'));
    expect(search.title).toBe('“Messi” bo‘yicha natija yo‘q');
    expect(search.primaryHref).toBe('/marketplace?view=list#marketplace-search');

    const filtered = getMarketplaceEmptyState(new URLSearchParams('minPrice=100000&view=grid'));
    expect(filtered.primaryLabel).toBe('Filtrlarni yumshatish');
    expect(filtered.primaryHref).toBe('/marketplace?view=grid');
  });

  it('uses platform-aware base copy without claiming the whole market is empty', () => {
    expect(getMarketplaceEmptyState(new URLSearchParams()).title)
      .toBe('Hozircha Mobile platformasida e‘lon yo‘q');
    expect(getMarketplaceEmptyState(new URLSearchParams('attr.platform=STEAM')).title)
      .toBe('Hozircha Steam platformasida e‘lon yo‘q');
  });

  it('redacts consumer-facing diagnostics and keeps a retry URL', () => {
    const markup = renderToStaticMarkup(createElement(MarketplaceErrorState, {
      retryHref: '/marketplace?q=Messi',
    }));
    expect(markup).toContain('Qayta urinish');
    expect(markup).toContain('/marketplace?q=Messi');
    expect(markup).not.toMatch(/503|backend|path|stack|network_error/i);
  });
});
```

- [ ] **Step 2: Run result-state tests and confirm RED**

Run: `npm test -- src/components/marketplace/marketplace-result-state.test.ts`

Expected: FAIL because the result-state module does not exist.

- [ ] **Step 3: Implement deterministic empty-state precedence**

`getMarketplaceEmptyState(params)` checks `matchCard` first, q/search second, then any `filter`, price, negotiable, or non-platform `attr.*` criterion. Player state lowers `matchStrictness` by one when above 1 without removing any other parameter. Search state removes only q/search/page and appends `#marketplace-search`. General state calls `clearMarketplaceCriteria()` and therefore preserves view, sort, and tracking. Base state derives `Mobile`, `Steam`, or `PlayStation` from explicit/default platform and links to `/marketplace/new` with `Akkount joylash`.

```ts
export interface MarketplaceEmptyStateModel {
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
}

export function getMarketplaceEmptyState(params: URLSearchParams): MarketplaceEmptyStateModel {
  if (params.getAll('matchCard').length) {
    const next = new URLSearchParams(params);
    const strictness = Math.max(1, Math.min(10, Number.parseInt(next.get('matchStrictness') ?? '4', 10) || 4));
    next.delete('page');
    if (strictness > 1) next.set('matchStrictness', String(strictness - 1));
    return {
      title: 'Bu tarkibga mos akkount topilmadi',
      body: 'Qat’iylikni pasaytiring yoki O‘yinchilar tanlovini o‘zgartiring.',
      primaryLabel: strictness > 1 ? 'Qat’iylikni pasaytirish' : 'O‘yinchilarni o‘zgartirish',
      primaryHref: strictness > 1
        ? marketplaceHref(next)
        : `${marketplaceHref(next)}#marketplace-player-filter`,
    };
  }

  const query = (params.get('q') ?? params.get('search'))?.trim();
  if (query) {
    const next = removeMarketplaceParams(params, ['q', 'search']);
    return {
      title: `“${query}” bo‘yicha natija yo‘q`,
      body: 'Boshqa nom yoki yozuvni sinab ko‘ring.',
      primaryLabel: 'Qidiruvni tahrirlash',
      primaryHref: `${marketplaceHref(next)}#marketplace-search`,
    };
  }

  const hasGeneralCriteria = Array.from(params.keys()).some((key) =>
    key === 'filter' || key === 'minPrice' || key === 'maxPrice'
    || key === 'priceNegotiable' || (key.startsWith('attr.') && key !== 'attr.platform'));
  if (hasGeneralCriteria) {
    return {
      title: 'Bu filtrlarga mos e‘lon topilmadi',
      body: 'Bir yoki bir nechta shartni yumshatib ko‘ring.',
      primaryLabel: 'Filtrlarni yumshatish',
      primaryHref: marketplaceHref(clearMarketplaceCriteria(params)),
    };
  }

  const platform = params.get('attr.platform') === 'STEAM'
    ? 'Steam'
    : params.get('attr.platform') === 'PLAYSTATION' ? 'PlayStation' : 'Mobile';
  return {
    title: `Hozircha ${platform} platformasida e‘lon yo‘q`,
    body: 'Birinchi bo‘lib akkountingizni joylang.',
    primaryLabel: 'Akkount joylash',
    primaryHref: '/marketplace/new',
  };
}
```

`MarketplaceErrorState` accepts only `retryHref`; its text is:

```tsx
<h2>E‘lonlarni yuklay olmadik</h2>
<p>Aloqani tekshirib, qayta urinib ko‘ring.</p>
<Link href={retryHref}>Qayta urinish</Link>
```

Do not accept a `FetchError` prop, so status, code, path, message, details, and exception-shaped data cannot leak into the buyer component. `marketplace-server.ts` already logs full diagnostics server-side.

- [ ] **Step 4: Write failing pagination markup tests**

Render `ListingsPagination` and assert one-page output is empty; previous/next and active links use `min-h-11 min-w-11`; current link has `aria-current="page"`; a mobile `2 / 12` summary exists; desktop numeric pages use `hidden sm:flex`; every supplied href points to the requested page.

Run: `npm test -- src/components/marketplace/listings-pagination.test.ts`

Expected: FAIL against the current 36px controls and missing summary.

- [ ] **Step 5: Implement compact mobile pagination**

Render Previous, `page + 1 / totalPages`, and Next in the mobile row; render the existing bounded numeric window from `sm` upward. Every interactive target is at least 44×44px. Disabled edges remain semantic spans with `aria-disabled`; the current numeric page uses `aria-current="page"`.

```tsx
<nav aria-label="Sahifalash" className="pt-2">
  <div className="flex items-center justify-center gap-2 sm:hidden">
    <PageLink href={buildHref(page - 1)} disabled={page === 0} label="Oldingi"><ChevronLeft /></PageLink>
    <span className="min-w-16 text-center text-sm font-bold">{page + 1} / {totalPages}</span>
    <PageLink href={buildHref(page + 1)} disabled={page >= totalPages - 1} label="Keyingi"><ChevronRight /></PageLink>
  </div>
  <div className="hidden items-center justify-center gap-1 sm:flex">{desktopPageLinks}</div>
</nav>
```

- [ ] **Step 6: Add stable loading and unexpected-error boundaries**

`loading.tsx` imports and renders the `ResponsiveListingGridSkeleton` export created and tested in Task 10, after a compact toolbar skeleton. The grid owns `role="status"`, `aria-label="E‘lonlar yuklanmoqda"`, Auto layout, and reserved media/content geometry. The route does not inspect search params, and skeleton shimmer is disabled under reduced motion.

`error.tsx` is a client boundary that renders the same buyer-safe copy and a 44px `Qayta urinish` button calling `reset()`. It logs `error` through `console.error` in an effect but never renders it.

- [ ] **Step 7: Wire consumer-safe states everywhere in marketplace scope**

Replace `BrowseEmpty` and consumer use of `ApiErrorPanel` in `MarketplaceBrowser`. On listing detail fetch failure, use `MarketplaceErrorState retryHref={backHref}` or a detail-specific generic wrapper; keep `ApiErrorPanel` for admin/internal diagnostic surfaces. Leave current results rendered during client transitions and set their container `aria-busy` from Task 6.

- [ ] **Step 8: Run focused verification and commit**

Run: `npm test -- src/components/marketplace/marketplace-result-state.test.ts src/components/marketplace/listings-pagination.test.ts src/components/marketplace/responsive-listing-grid.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/components/marketplace/marketplace-result-state.tsx frontend/src/components/marketplace/marketplace-result-state.test.ts frontend/src/components/marketplace/listings-pagination.test.ts frontend/src/app/marketplace/loading.tsx frontend/src/app/marketplace/error.tsx frontend/src/components/marketplace/listings-pagination.tsx frontend/src/components/marketplace/marketplace-browser.tsx frontend/src/app/marketplace/[id]/page.tsx frontend/src/app/globals.css
git commit -m "feat(marketplace): add recoverable result states"
```

## Task 12: Restore feed position and complete safe Back behavior

**Files:**

- Create: `frontend/src/lib/marketplace-scroll-state.ts`
- Create: `frontend/src/lib/marketplace-scroll-state.test.ts`
- Create: `frontend/src/components/marketplace/marketplace-history-provider.tsx`
- Create: `frontend/src/components/marketplace/marketplace-scroll-restorer.tsx`
- Create: `frontend/src/components/marketplace/measured-bottom-bar.tsx`
- Create: `frontend/src/components/marketplace/marketplace-history-provider.test.ts`
- Modify: `frontend/src/components/marketplace/marketplace-listing-link.tsx`
- Modify: `frontend/src/components/marketplace/responsive-listing-grid.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Modify: `frontend/src/app/marketplace/layout.tsx`
- Modify: `frontend/src/components/navigation/top-back-button.tsx`
- Modify: `frontend/src/components/navigation/back-link.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-shell.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write failing versioned-marker tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  detailBackMarkerFromPending,
  feedMarkerState,
  normalizeMarketplaceQuery,
  readDetailBackMarker,
  readFeedMarker,
  restorationTarget,
} from './marketplace-scroll-state';

describe('marketplace feed history', () => {
  it('normalizes reordered and repeated query entries deterministically', () => {
    const left = 'view=grid&matchCard=b&matchCard=a&q=Messi';
    const right = 'q=Messi&matchCard=a&view=grid&matchCard=b';
    expect(normalizeMarketplaceQuery(left)).toBe(normalizeMarketplaceQuery(right));
  });

  it('merges marker state without dropping Next private fields', () => {
    const state = feedMarkerState({ __NA: true, tree: ['x'] }, {
      version: 1, kind: 'marketplace-feed', queryKey: 'q=Messi', listingId: 'listing-1',
      scrollY: 640, feedHref: '/marketplace?q=Messi',
    });
    expect(state).toMatchObject({ __NA: true, tree: ['x'] });
    expect(readFeedMarker(state)?.listingId).toBe('listing-1');
  });

  it('finalizes only a fresh pending navigation whose target matches detail', () => {
    const pending = JSON.stringify({
      version: 1, targetHref: '/marketplace/listing-1?q=Messi', createdAt: 1000,
      feed: { version: 1, kind: 'marketplace-feed', queryKey: 'q=Messi', listingId: 'listing-1', scrollY: 640, feedHref: '/marketplace?q=Messi' },
    });
    const marker = detailBackMarkerFromPending(pending, '/marketplace/listing-1?q=Messi', 1500);
    expect(marker?.previousFeedHref).toBe('/marketplace?q=Messi');
    expect(detailBackMarkerFromPending(pending, '/marketplace/listing-2?q=Messi', 1500)).toBeNull();
    expect(detailBackMarkerFromPending(pending, '/marketplace/listing-1?q=Messi', 7000)).toBeNull();
    expect(readDetailBackMarker({})).toBeNull();
  });

  it('restores only on popstate, preferring anchor then clamped pixels', () => {
    const marker = { version: 1 as const, kind: 'marketplace-feed' as const, queryKey: 'q=Messi', listingId: 'listing-1', scrollY: 900, feedHref: '/marketplace?q=Messi' };
    expect(restorationTarget(marker, 'q=Messi', 'push', true, 1200)).toBeNull();
    expect(restorationTarget(marker, 'q=Messi', 'popstate', true, 1200)).toEqual({ kind: 'anchor', listingId: 'listing-1' });
    expect(restorationTarget(marker, 'q=Messi', 'popstate', false, 600)).toEqual({ kind: 'pixel', top: 600 });
  });
});
```

- [ ] **Step 2: Run marker tests and confirm RED**

Run: `npm test -- src/lib/marketplace-scroll-state.test.ts`

Expected: FAIL because the scroll-state module does not exist.

- [ ] **Step 3: Implement marker and restoration pure functions**

Use namespaced state keys `__efbMarketplaceFeedV1` and `__efbMarketplaceDetailV1`, a pending session key `efbazaar:marketplace-navigation:v1`, and a five-second pending expiry. `normalizeMarketplaceQuery()` sorts `[key,value]` pairs by key then value and preserves duplicates. `feedMarkerState(base, marker)` returns `{ ...base, [FEED_KEY]: marker }`. Readers validate version, kind, strings, finite nonnegative scroll, and same-origin `/marketplace` href shape.

```ts
const FEED_KEY = '__efbMarketplaceFeedV1';
const DETAIL_KEY = '__efbMarketplaceDetailV1';
const PENDING_MAX_AGE_MS = 5000;

export interface MarketplaceFeedMarker {
  version: 1;
  kind: 'marketplace-feed';
  queryKey: string;
  listingId: string;
  scrollY: number;
  feedHref: string;
}

export interface MarketplaceDetailBackMarker {
  version: 1;
  kind: 'marketplace-detail';
  previousFeedHref: string;
  queryKey: string;
  listingId: string;
}

export function normalizeMarketplaceQuery(raw: string) {
  return Array.from(new URLSearchParams(raw).entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function feedMarkerState(base: unknown, marker: MarketplaceFeedMarker) {
  const safeBase = base && typeof base === 'object' ? base as Record<string, unknown> : {};
  return { ...safeBase, [FEED_KEY]: marker };
}

export function readFeedMarker(state: unknown): MarketplaceFeedMarker | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[FEED_KEY] as Partial<MarketplaceFeedMarker> | undefined;
  return value?.version === 1 && value.kind === 'marketplace-feed'
    && typeof value.queryKey === 'string' && typeof value.listingId === 'string'
    && typeof value.feedHref === 'string' && /^\/marketplace(?:\?|$)/.test(value.feedHref)
    && typeof value.scrollY === 'number' && Number.isFinite(value.scrollY) && value.scrollY >= 0
    ? value as MarketplaceFeedMarker : null;
}

export function readDetailBackMarker(state: unknown): MarketplaceDetailBackMarker | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[DETAIL_KEY] as Partial<MarketplaceDetailBackMarker> | undefined;
  return value?.version === 1 && value.kind === 'marketplace-detail'
    && typeof value.previousFeedHref === 'string' && /^\/marketplace(?:\?|$)/.test(value.previousFeedHref)
    && typeof value.queryKey === 'string' && typeof value.listingId === 'string'
    ? value as MarketplaceDetailBackMarker : null;
}

export function detailBackMarkerFromPending(raw: string | null, currentHref: string, now: number) {
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as { version?: number; targetHref?: string; createdAt?: number; feed?: MarketplaceFeedMarker };
    if (pending.version !== 1 || pending.targetHref !== currentHref
      || typeof pending.createdAt !== 'number' || now - pending.createdAt > PENDING_MAX_AGE_MS
      || !pending.feed) return null;
    const feed = readFeedMarker({ [FEED_KEY]: pending.feed });
    return feed ? {
      version: 1 as const, kind: 'marketplace-detail' as const,
      previousFeedHref: feed.feedHref, queryKey: feed.queryKey, listingId: feed.listingId,
    } : null;
  } catch {
    return null;
  }
}

export function detailMarkerState(base: unknown, marker: MarketplaceDetailBackMarker) {
  const safeBase = base && typeof base === 'object' ? base as Record<string, unknown> : {};
  return { ...safeBase, [DETAIL_KEY]: marker };
}

export function sameMarketplaceHref(left: string, right: string) {
  const parse = (href: string) => {
    const url = new URL(href, 'https://efbazaar.local');
    return url.origin === 'https://efbazaar.local' && url.pathname === '/marketplace'
      ? `${url.pathname}?${normalizeMarketplaceQuery(url.search)}` : null;
  };
  const leftKey = parse(left);
  return leftKey !== null && leftKey === parse(right);
}

export function restorationTarget(
  marker: MarketplaceFeedMarker,
  rawQuery: string,
  reason: 'push' | 'popstate',
  listingExists: boolean,
  maxScrollY: number,
) {
  if (reason !== 'popstate' || marker.queryKey !== normalizeMarketplaceQuery(rawQuery)) return null;
  return listingExists
    ? { kind: 'anchor' as const, listingId: marker.listingId }
    : { kind: 'pixel' as const, top: Math.min(marker.scrollY, Math.max(0, maxScrollY)) };
}
```

`detailBackMarkerFromPending()` must require exact path+query equality between `targetHref` and the current same-origin href and return:

```ts
{
  version: 1,
  kind: 'marketplace-detail',
  previousFeedHref: pending.feed.feedHref,
  queryKey: pending.feed.queryKey,
  listingId: pending.feed.listingId,
}
```

`restorationTarget()` returns null unless reason is `popstate` and the normalized query matches. Anchor wins; pixel fallback is `Math.min(marker.scrollY, maxScrollY)`.

- [ ] **Step 4: Mark only genuine feed-to-detail navigation**

Extend `MarketplaceListingLink`'s Next `Link.onNavigate` handler to:

1. Build a feed marker from current raw query, listing ID, `window.scrollY`, and `window.location.pathname + window.location.search`.
2. Merge it into the current history state with `history.replaceState`.
3. Store `{ version: 1, targetHref, createdAt: Date.now(), feed }` in sessionStorage.

Do not mark profile/favorites/similar-listing cards; only `ResponsiveListingGrid` uses this component with `trackFeedNavigation=true`. `onNavigate` naturally excludes modifier-key, download, external, and new-tab navigation.

- [ ] **Step 5: Add the persistent history provider**

`MarketplaceHistoryProvider` mounts in `app/marketplace/layout.tsx` outside page transitions. On pathname/search change, it validates and finalizes a pending detail marker with `detailMarkerState(window.history.state, marker)`, then removes the pending storage entry whether valid or invalid. It listens to `popstate`; only that event publishes a valid feed marker through context. It never scrolls itself.

Wrap the existing navigation provider:

```tsx
<MarketplaceHistoryProvider>
  <MarketplaceNavigationProvider>{children}</MarketplaceNavigationProvider>
</MarketplaceHistoryProvider>
```

- [ ] **Step 6: Restore after cards render**

Render `MarketplaceScrollRestorer rawQuery={rawQuery} listingIds={page.content.map((item) => item.id)}` after `ResponsiveListingGrid`. In a layout effect scheduled through two `requestAnimationFrame` calls, read the provider's popstate marker and call `restorationTarget()`. For an anchor, call `document.getElementById('marketplace-listing-' + id)?.scrollIntoView({ block: 'start' })`; card CSS uses `scroll-margin-top: calc(var(--marketplace-sticky-height, 7rem) + 0.75rem)`. If absent, `window.scrollTo({ top: clampedTop })`. Clear only the provider's pending notification, not the history marker, so back → forward → back can restore again.

- [ ] **Step 7: Make route Back marker-proven and direct-entry safe**

Add one shared callback used by visible and Telegram back controls:

```ts
function goBack() {
  const marker = readDetailBackMarker(window.history.state);
  if (marker && sameMarketplaceHref(marker.previousFeedHref, href)) window.history.back();
  else router.replace(href);
}
```

The route layer calls this callback. Browser controls intercept ordinary clicks and call it too. Never use `history.length`, `document.referrer`, or same-origin current URL as proof. A direct detail link has no detail marker and therefore replaces to the query-preserving fallback without entering a back loop.

- [ ] **Step 8: Measure fixed bottom chrome and remove magic padding**

`MeasuredBottomBar` wraps the mobile tab bar or action bar. A `ResizeObserver` writes its `borderBoxSize`/`getBoundingClientRect().height` to `--marketplace-bottom-bar-height` on the nearest `[data-marketplace-shell]`; cleanup removes the inline variable. The shell has `data-marketplace-shell`, top padding uses `var(--app-content-safe-top)`, and main padding-bottom is:

```css
padding-bottom: calc(var(--marketplace-bottom-bar-height, 3.5rem) + 1rem);
```

Remove `pb-24`. Add a visible `Sotish` label under the center bottom-nav icon while retaining five equal slots and 44px targets. Short landscape hides nonessential verification copy and begins with compact search.

- [ ] **Step 9: Add source contracts for marker lifecycle and measurement**

In `marketplace-history-provider.test.ts`, read the provider/link/restorer/shell sources and assert: `popstate`, `history.replaceState`, session pending removal, two animation frames, `scrollIntoView`, clamped `scrollTo`, `ResizeObserver`, semantic bottom variable, and absence of `history.length` and `pb-24`.

- [ ] **Step 10: Run focused verification and commit**

Run: `npm test -- src/lib/marketplace-scroll-state.test.ts src/components/marketplace/marketplace-history-provider.test.ts src/components/marketplace/listing-card.test.ts && npm run typecheck && npm run lint`

Expected: tests PASS; TypeScript and ESLint exit 0.

```bash
git add frontend/src/lib/marketplace-scroll-state.ts frontend/src/lib/marketplace-scroll-state.test.ts frontend/src/components/marketplace/marketplace-history-provider.tsx frontend/src/components/marketplace/marketplace-scroll-restorer.tsx frontend/src/components/marketplace/measured-bottom-bar.tsx frontend/src/components/marketplace/marketplace-history-provider.test.ts frontend/src/components/marketplace/marketplace-listing-link.tsx frontend/src/components/marketplace/responsive-listing-grid.tsx frontend/src/components/marketplace/marketplace-browser.tsx frontend/src/app/marketplace/layout.tsx frontend/src/components/navigation/top-back-button.tsx frontend/src/components/navigation/back-link.tsx frontend/src/components/marketplace/marketplace-shell.tsx frontend/src/app/globals.css
git commit -m "feat(marketplace): restore feed navigation context"
```

## Task 13: Complete responsive, accessibility, and production verification

**Files:**

- Modify when verification exposes a concrete defect: only files already listed in Tasks 1–12
- Test: all `frontend/src/**/*.test.ts`

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
cd /private/tmp/ef-bazaar-player-filter-single-team/frontend
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: Vitest reports all tests passing; TypeScript and ESLint exit 0; Next prints a successful production build and lists `/marketplace` and `/marketplace/[id]` without compilation errors.

- [ ] **Step 2: Start a production-like local server**

Run: `npm start -- -p 3001`

Expected: Next prints `http://localhost:3001` and reports Ready. Keep the process running for the browser checks; stop it with Ctrl-C afterward.

- [ ] **Step 3: Verify the responsive matrix in a real browser**

At widths 320, 360, 390, 430, 768, 1024, and 1440px, plus 667×375 short landscape, verify and record PASS for:

- no page-level horizontal overflow at 100% and 200% text zoom;
- every trigger, chip, favorite, close, pagination, and bottom-nav action is at least 44×44px;
- 320px toolbar keeps `Filtrlar` and `O‘yinchilar` visible with sort/view usable;
- Auto is one horizontal card below 380px, two vertical cards at 380px, three at 696px, and never exceeds three;
- explicit list stays horizontal; explicit grid is one vertical below 380px and adds columns only at safe thresholds;
- final card and pagination clear the measured bottom navigation/action bar;
- short landscape starts compact and leaves usable listing height.

Also smoke-test any admin/profile page that reuses `ListingsPagination` so its desktop numeric controls and supplied hrefs remain intact.

- [ ] **Step 4: Verify URL composition and pending interaction**

Apply search, a quick filter, two detailed attributes, sorting, explicit grid, two repeated player cards, strictness, and page navigation. Confirm each action changes only its owned keys, deletes page where required, retains both `matchCard` entries, and browser refresh/share reproduces the same state. Confirm immediate controls show pending feedback while current results stay readable.

- [ ] **Step 5: Verify filter-sheet race and failure behavior**

Open `Filtrlar`, type rapidly, and confirm the Network panel shows aborted stale `size=1&page=0` previews. Enter reversed/invalid values and confirm no preview, inline recovery text, and disabled Apply. Simulate preview 503 and confirm `Natijalarni ko‘rsatish` remains enabled and current results remain visible. Open the keyboard at 320px and confirm the sticky CTA clears the content and safe bottom.

- [ ] **Step 6: Verify player UX and singleton team**

Open `O‘yinchilar`; verify META, Qidiruv, and Mening jamoam. Pick alternate editions of one canonical player and confirm only one selection. Confirm the twelfth distinct player is rejected without haptic, meaningful picks receive one selection haptic, strictness bands match values 1–10, Apply copy contains the chosen count, and reopen shows real names/images instead of IDs. Confirm the team tab directly uses the one saved Dream Team and exposes only `Jamoani tahrirlash`.

- [ ] **Step 7: Verify cards, media, and state recovery**

Confirm tapping card whitespace opens detail; favorite never navigates; keyboard focus activates one primary link and the separate favorite; sold cards announce `Sotilgan`; match cards show `N/11 mos · P%` and at least two available names; risks condense. Throttle network for stable skeletons, force an image failure for a same-size fallback, verify the `/_next/image` request whose `url` parameter begins with `/bot/photo/` returns success or apply the `unoptimized` fallback specified in Task 10, and simulate empty/search/player/general/error states for correct recovery copy without technical diagnostics.

- [ ] **Step 8: Verify Telegram-specific behavior with a fake and a real Mini App client**

Run the concrete fake lifecycle harness first:

```bash
npm test -- src/components/telegram/telegram-mini-app.integration.test.ts
```

Then, when available, repeat the interaction matrix in Telegram iOS/Android/Web:

- explicit user theme wins; otherwise `themeChanged` follows Telegram; browser system is fallback;
- header/background/bottom chrome matches light/dark content without a contrasting flash;
- safe/content-safe inset and orientation changes keep header, sheets, CTA, and bottom bar clear;
- feed vertical swipes remain enabled; opening a gesture-sensitive sheet disables them; closing the final sheet re-enables them;
- native Back closes view/sort/filter/player/search overlays before route navigation;
- detail Back uses history only after an app-owned feed navigation; a direct detail link uses fallback and never follows unrelated history;
- no native tap produces two callbacks or duplicate haptics.

- [ ] **Step 9: Verify back/forward restoration and accessibility**

Scroll deep, open a listing, and return through browser and Telegram Back; confirm the clicked card anchor returns below sticky chrome. Remove that listing from the returned page and confirm clamped pixel fallback. Exercise back → forward → back twice. Direct-open detail and confirm no invented scroll. Keyboard-test dialogs, Escape, focus trap/return, visible focus, live count/error announcements, large Uzbek labels, light/dark WCAG AA contrast, and reduced motion with no shimmer/sheet/header/card scale animation.

- [ ] **Step 10: Run final clean verification**

After any concrete correction from Steps 3–9, rerun:

```bash
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all four frontend commands succeed; `git diff --check` prints nothing; status shows only intended marketplace/Telegram files and no `.superpowers/` mockup artifacts.

- [ ] **Step 11: Commit the verified integration**

Stage only concrete verification fixes and tests that are not already committed. If the tree has no new changes, skip this commit. Otherwise:

```bash
git add frontend/src
git commit -m "test(marketplace): verify responsive Telegram UX"
```

Do not push in this task; publishing remains a separate user-authorized action.
