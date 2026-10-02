import { buildListingSearchParams } from './marketplace-format';
import { DEFAULT_LISTING_SORT, LISTING_SORT_OPTIONS } from './marketplace-sort';
import type {
  FeedResponse,
  ListingBrowseParams,
  ListingResponse,
  MatchDetails,
  MatchIdsResponse,
  PageResponse,
} from './marketplace-types';

export type MarketplaceTab = 'mine' | 'market';
export type MarketplaceMode = 'match' | 'mine' | 'market';
export type MarketplaceNotice = 'rec_unavailable' | 'feed_empty';

export const MARKETPLACE_DEFAULT_PAGE_SIZE = 12;

/** Server (apiFetch) va brauzer (same-origin proxy) uchun bir xil shartnoma. Xato → throw. */
export interface MarketplaceTransport {
  marketplaceGet<T>(path: string, params?: URLSearchParams): Promise<T>;
  marketplacePost<T>(path: string, body: unknown): Promise<T>;
  recGet<T>(path: string, params?: URLSearchParams): Promise<T>;
}

export interface MarketplacePageRequest {
  filters: ListingBrowseParams;
  tab: MarketplaceTab;
  authenticated: boolean;
  /** Oldingi javobdagi lenta snapshot hash'i — sessiya ichida tartib o'zgarmasin. */
  feedHash?: string;
}

export interface MarketplacePageResult {
  mode: MarketplaceMode;
  page: PageResponse<ListingResponse>;
  profileHash?: string;
  notice?: MarketplaceNotice;
}

export class MarketplaceLoadError extends Error {
  readonly mode: MarketplaceMode;

  constructor(mode: MarketplaceMode, cause?: unknown) {
    super(`Marketplace ${mode} page failed`, { cause });
    this.name = 'MarketplaceLoadError';
    this.mode = mode;
  }
}

/**
 * Rejim tanlovi (spec §6): player filtri bor → `match` (har ikki tabda); login qilgan va
 * "Qiziqishlarim" → `mine`; aks holda `market`. Lenta bo'sh yoki rec xato → `market` + izoh.
 * Player filtri xatosi esa xato — filtrlanmagan ro'yxat ko'rsatilmaydi.
 */
export async function loadMarketplacePage(
  transport: MarketplaceTransport,
  request: MarketplacePageRequest,
): Promise<MarketplacePageResult> {
  const { filters } = request;

  if (filters.matchCards?.length) {
    try {
      const params = matchParams(filters);
      const { ids } = await transport.recGet<MatchIdsResponse>('v1/match', params);
      const ranked = await rankedPage(transport, ids, filters);
      const explained = await withDetails(transport, ranked, 'v1/match/details', params, 'filter');
      return { mode: 'match', page: explained };
    } catch (error) {
      throw new MarketplaceLoadError('match', error);
    }
  }

  if (request.tab === 'mine' && request.authenticated) {
    let feed: FeedResponse;
    try {
      const params = new URLSearchParams();
      if (request.feedHash) params.set('profileHash', request.feedHash);
      feed = await transport.recGet<FeedResponse>('v1/feed', params);
    } catch {
      return { ...(await marketPage(transport, filters)), notice: 'rec_unavailable' };
    }
    if (feed.empty || feed.ids.length === 0) {
      return { ...(await marketPage(transport, filters)), notice: 'feed_empty' };
    }
    let ranked: PageResponse<ListingResponse>;
    try {
      ranked = await rankedPage(transport, feed.ids, filters);
    } catch (error) {
      throw new MarketplaceLoadError('mine', error);
    }
    const explained = await withDetails(transport, ranked, 'v1/feed/details', new URLSearchParams(), 'feed');
    return { mode: 'mine', page: explained, profileHash: feed.profileHash ?? undefined };
  }

  return marketPage(transport, filters);
}

async function marketPage(transport: MarketplaceTransport, filters: ListingBrowseParams) {
  const { matchCards: _ignored, matchStrictness: _strictness, sort, ...rest } = filters;
  // Menyuda yo'q tartib (masalan eski `sort=createdAt,desc` havolasi) — default: eng yangi tepaga qaytmasin.
  const known = LISTING_SORT_OPTIONS.some((option) => option.param === sort);
  try {
    const page = await transport.marketplaceGet<PageResponse<ListingResponse>>(
      'v1/listings', buildListingSearchParams({ ...rest, sort: known ? sort : DEFAULT_LISTING_SORT }));
    return { mode: 'market' as const, page };
  } catch (error) {
    throw new MarketplaceLoadError('market', error);
  }
}

function matchParams(filters: ListingBrowseParams) {
  const params = new URLSearchParams();
  for (const criterion of filters.matchCards ?? []) params.append('matchCard', criterion);
  params.set('matchStrictness', String(filters.matchStrictness ?? 4));
  return params;
}

async function rankedPage(
  transport: MarketplaceTransport,
  ids: string[],
  filters: ListingBrowseParams,
): Promise<PageResponse<ListingResponse>> {
  const page = filters.page ?? 0;
  const size = filters.size ?? MARKETPLACE_DEFAULT_PAGE_SIZE;
  if (ids.length === 0) {
    return { content: [], page, size, totalElements: 0, totalPages: 0 };
  }
  return transport.marketplacePost<PageResponse<ListingResponse>>('v1/listings/ranked', {
    ids,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    priceNegotiable: filters.priceNegotiable,
    search: filters.search,
    attributes: filters.attributes,
    page,
    size,
  });
}

/** Tafsilot ixtiyoriy: xato bo'lsa ro'yxat izohsiz qaytadi. Tartib — ranked javobidagi tartib. */
async function withDetails(
  transport: MarketplaceTransport,
  page: PageResponse<ListingResponse>,
  path: string,
  baseParams: URLSearchParams,
  kind: 'filter' | 'feed',
): Promise<PageResponse<ListingResponse>> {
  if (page.content.length === 0) return page;
  const params = new URLSearchParams(baseParams);
  for (const listing of page.content) params.append('ids', listing.id);
  let details: Record<string, MatchDetails>;
  try {
    details = await transport.recGet<Record<string, MatchDetails>>(path, params);
  } catch {
    return page;
  }
  return {
    ...page,
    content: page.content.map((listing) => {
      const match = details[listing.id];
      return match ? { ...listing, matchDetails: match, matchKind: kind } : listing;
    }),
  };
}
