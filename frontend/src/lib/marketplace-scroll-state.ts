const MARKETPLACE_ORIGIN = 'https://efbazaar.local';

export const MARKETPLACE_FEED_STATE_KEY = '__efbMarketplaceFeedV1';
export const MARKETPLACE_DETAIL_STATE_KEY = '__efbMarketplaceDetailV1';
export const MARKETPLACE_PENDING_STORAGE_KEY = 'efbazaar:marketplace-navigation:v1';
export const MARKETPLACE_PENDING_MAX_AGE_MS = 5_000;

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

export interface MarketplacePendingNavigation {
  version: 1;
  targetHref: string;
  createdAt: number;
  feed: MarketplaceFeedMarker;
}

export type MarketplaceRestorationTarget =
  | { kind: 'anchor'; listingId: string }
  | { kind: 'pixel'; top: number };

function stateObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseMarketplaceHref(href: string, expectedPath: 'feed' | 'detail') {
  try {
    const url = new URL(href, MARKETPLACE_ORIGIN);
    const isRelative = href.startsWith('/');
    if ((!isRelative && url.origin !== MARKETPLACE_ORIGIN) || url.origin !== MARKETPLACE_ORIGIN) {
      return null;
    }

    const validPath = expectedPath === 'feed'
      ? url.pathname === '/marketplace'
      : /^\/marketplace\/[^/]+$/.test(url.pathname);
    if (!validPath || url.hash) return null;

    return {
      pathname: url.pathname,
      queryKey: normalizeMarketplaceQuery(url.search),
    };
  } catch {
    return null;
  }
}

export function normalizeMarketplaceQuery(raw: string) {
  return Array.from(new URLSearchParams(raw.replace(/^\?/, '')).entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function feedMarkerState(base: unknown, marker: MarketplaceFeedMarker) {
  return {
    ...(stateObject(base) ?? {}),
    [MARKETPLACE_FEED_STATE_KEY]: marker,
  };
}

export function readFeedMarker(state: unknown): MarketplaceFeedMarker | null {
  const record = stateObject(state);
  const value = stateObject(record?.[MARKETPLACE_FEED_STATE_KEY]);
  if (!value) return null;

  const feedHref = typeof value.feedHref === 'string'
    ? parseMarketplaceHref(value.feedHref, 'feed')
    : null;
  const scrollY = value.scrollY;
  if (
    value.version !== 1
    || value.kind !== 'marketplace-feed'
    || typeof value.queryKey !== 'string'
    || typeof value.listingId !== 'string'
    || value.listingId.length === 0
    || typeof scrollY !== 'number'
    || !Number.isFinite(scrollY)
    || scrollY < 0
    || !feedHref
    || value.queryKey !== feedHref.queryKey
  ) return null;

  return value as unknown as MarketplaceFeedMarker;
}

export function detailMarkerState(base: unknown, marker: MarketplaceDetailBackMarker) {
  return {
    ...(stateObject(base) ?? {}),
    [MARKETPLACE_DETAIL_STATE_KEY]: marker,
  };
}

export function readDetailBackMarker(state: unknown): MarketplaceDetailBackMarker | null {
  const record = stateObject(state);
  const value = stateObject(record?.[MARKETPLACE_DETAIL_STATE_KEY]);
  if (!value) return null;

  const previousFeed = typeof value.previousFeedHref === 'string'
    ? parseMarketplaceHref(value.previousFeedHref, 'feed')
    : null;
  if (
    value.version !== 1
    || value.kind !== 'marketplace-detail'
    || typeof value.queryKey !== 'string'
    || typeof value.listingId !== 'string'
    || value.listingId.length === 0
    || !previousFeed
    || value.queryKey !== previousFeed.queryKey
  ) return null;

  return value as unknown as MarketplaceDetailBackMarker;
}

function sameDetailHref(left: string, right: string) {
  const leftUrl = parseMarketplaceHref(left, 'detail');
  const rightUrl = parseMarketplaceHref(right, 'detail');
  return leftUrl !== null
    && rightUrl !== null
    && leftUrl.pathname === rightUrl.pathname
    && leftUrl.queryKey === rightUrl.queryKey;
}

export function detailBackMarkerFromPending(
  raw: string | null,
  currentHref: string,
  now: number,
): MarketplaceDetailBackMarker | null {
  if (!raw || !Number.isFinite(now)) return null;

  try {
    const pending = JSON.parse(raw) as Partial<MarketplacePendingNavigation>;
    const createdAt = pending.createdAt;
    if (
      pending.version !== 1
      || typeof pending.targetHref !== 'string'
      || typeof createdAt !== 'number'
      || !Number.isFinite(createdAt)
      || createdAt > now
      || now - createdAt > MARKETPLACE_PENDING_MAX_AGE_MS
      || !sameDetailHref(pending.targetHref, currentHref)
      || !pending.feed
    ) return null;

    const feed = readFeedMarker({ [MARKETPLACE_FEED_STATE_KEY]: pending.feed });
    if (!feed) return null;

    return {
      version: 1,
      kind: 'marketplace-detail',
      previousFeedHref: feed.feedHref,
      queryKey: feed.queryKey,
      listingId: feed.listingId,
    };
  } catch {
    return null;
  }
}

export function sameMarketplaceHref(left: string, right: string) {
  const leftUrl = parseMarketplaceHref(left, 'feed');
  const rightUrl = parseMarketplaceHref(right, 'feed');
  return leftUrl !== null
    && rightUrl !== null
    && leftUrl.pathname === rightUrl.pathname
    && leftUrl.queryKey === rightUrl.queryKey;
}

export function restorationTarget(
  marker: MarketplaceFeedMarker,
  rawQuery: string,
  reason: 'push' | 'popstate',
  listingExists: boolean,
  maxScrollY: number,
): MarketplaceRestorationTarget | null {
  if (
    reason !== 'popstate'
    || marker.queryKey !== normalizeMarketplaceQuery(rawQuery)
  ) return null;

  if (listingExists) {
    return { kind: 'anchor', listingId: marker.listingId };
  }

  const safeMaxScrollY = Number.isFinite(maxScrollY) ? Math.max(0, maxScrollY) : 0;
  return { kind: 'pixel', top: Math.min(marker.scrollY, safeMaxScrollY) };
}
