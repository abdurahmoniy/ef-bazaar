import type { MarketplaceFilterId, SearchParamInput } from './marketplace-format';
import type { MarketplaceTab } from './marketplace-page-loader';

export type MarketplaceView = 'auto' | 'list' | 'grid';

export const MARKETPLACE_QUICK_FILTER_CONTROLLED_KEYS = {
  all: [],
  negotiable: ['priceNegotiable'],
  clean: ['attr.has_google_play_link', 'attr.has_game_center_link', 'attr.android_coins.min', 'attr.ios_coins.min'],
  exchange: ['attr.exchange_mode'],
} as const satisfies Readonly<Record<MarketplaceFilterId, readonly string[]>>;

const MARKETPLACE_CRITERIA_KEYS = [
  'q',
  'search',
  'filter',
  'minPrice',
  'maxPrice',
  'priceNegotiable',
  'matchCard',
  'matchStrictness',
  'page',
  'size',
] as const;

function cloneParams(current: URLSearchParams) {
  return new URLSearchParams(current);
}

function resetPage(params: URLSearchParams) {
  params.delete('page');
}

export function getMarketplaceView(params: URLSearchParams): MarketplaceView {
  const view = params.get('view');
  return view === 'list' || view === 'grid' ? view : 'auto';
}

export function marketplaceHref(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/marketplace?${query}` : '/marketplace';
}

export function setMarketplaceSearch(current: URLSearchParams, value: string) {
  const next = cloneParams(current);
  next.delete('q');
  next.delete('search');
  const query = value.trim();
  if (query) next.set('q', query);
  resetPage(next);
  return next;
}

export function setMarketplaceView(current: URLSearchParams, view: MarketplaceView) {
  const next = cloneParams(current);
  next.delete('view');
  if (view !== 'auto') next.set('view', view);
  resetPage(next);
  return next;
}

export function setMarketplaceSort(current: URLSearchParams, sort: string) {
  const next = cloneParams(current);
  next.delete('sort');
  const value = sort.trim();
  if (value) next.set('sort', value);
  resetPage(next);
  return next;
}

export function setMarketplaceQuickFilter(
  current: URLSearchParams,
  filter: MarketplaceFilterId,
) {
  const next = cloneParams(current);
  next.delete('filter');
  for (const key of MARKETPLACE_QUICK_FILTER_CONTROLLED_KEYS[filter]) next.delete(key);
  if (filter !== 'all') next.set('filter', filter);
  resetPage(next);
  return next;
}

export function setMarketplacePage(current: URLSearchParams, page: number) {
  const next = cloneParams(current);
  const normalized = Number.isFinite(page) ? Math.max(0, Math.trunc(page)) : 0;
  next.set('page', String(normalized));
  return next;
}

export function loosenMarketplaceMatch(
  current: URLSearchParams,
  normalizedStrictness: number,
) {
  const next = cloneParams(current);
  next.set('matchStrictness', String(Math.max(1, normalizedStrictness - 1)));
  resetPage(next);
  return next;
}

export function removeMarketplaceParams(current: URLSearchParams, keys: readonly string[]) {
  const next = cloneParams(current);
  for (const key of keys) next.delete(key);
  resetPage(next);
  return next;
}

export function clearMarketplaceCriteria(current: URLSearchParams) {
  const next = cloneParams(current);
  for (const key of MARKETPLACE_CRITERIA_KEYS) next.delete(key);
  for (const key of Array.from(next.keys())) {
    if (key.startsWith('attr.')) next.delete(key);
  }
  return next;
}

export function searchParamsToInput(params: URLSearchParams): SearchParamInput {
  const input: SearchParamInput = {};
  for (const [key, value] of params.entries()) {
    const existing = input[key];
    if (existing === undefined) {
      input[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      input[key] = [existing, value];
    }
  }
  return input;
}

const FEED_HASH = /^[0-9a-f]{64}$/;

/** Mehmon doim Katta bozorda; login qilgan uchun default — "Mening qiziqishlarim". */
export function getMarketplaceTab(params: URLSearchParams, authenticated: boolean): MarketplaceTab {
  if (!authenticated) return 'market';
  return params.get('tab') === 'market' ? 'market' : 'mine';
}

/** Tab almashganda filtrlar qoladi; sahifa va lenta snapshot'i yangidan boshlanadi. */
export function setMarketplaceTab(current: URLSearchParams, tab: MarketplaceTab) {
  const next = new URLSearchParams(current);
  next.delete('page');
  next.delete('feed');
  next.delete('tab');
  if (tab === 'market') next.set('tab', 'market');
  return next;
}

export function setMarketplaceFeed(current: URLSearchParams, hash: string | undefined) {
  const next = new URLSearchParams(current);
  next.delete('feed');
  if (hash && FEED_HASH.test(hash)) next.set('feed', hash);
  return next;
}

export function getMarketplaceFeedHash(params: URLSearchParams): string | undefined {
  const value = params.get('feed') ?? undefined;
  return value && FEED_HASH.test(value) ? value : undefined;
}
