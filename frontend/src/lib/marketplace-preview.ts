import { buildListingSearchParams, parseListingSearchParams } from './marketplace-format';
import { buildMarketplaceApiPath, REC_API_BASE } from './marketplace-client-api';
import { applyMarketplaceFilterDraft, type MarketplaceFilterDraft } from './marketplace-filter-draft';
import { getMarketplaceTab, searchParamsToInput } from './marketplace-query';

function isAbortError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

/** Fetches the matching-listing count for a draft without changing public URL state. */
export async function fetchMarketplaceResultCount(
  current: URLSearchParams,
  draft: MarketplaceFilterDraft,
  signal: AbortSignal,
  authenticated = false,
) {
  const publicParams = applyMarketplaceFilterDraft(current, draft);
  const filters = parseListingSearchParams(searchParamsToInput(publicParams));
  const apiParams = buildListingSearchParams({ ...filters, page: 0, size: 1 });
  let ids: string[] | undefined;
  if (filters.matchCards?.length) {
    const matchParams = new URLSearchParams();
    for (const card of filters.matchCards) matchParams.append('matchCard', card);
    matchParams.set('matchStrictness', String(filters.matchStrictness ?? 4));
    ids = await recommendationIds('v1/match', matchParams, signal);
    if (ids.length === 0) return 0;
  } else if (getMarketplaceTab(publicParams, authenticated) === 'mine') {
    const feedParams = new URLSearchParams();
    const hash = publicParams.get('feed');
    if (hash) feedParams.set('profileHash', hash);
    try {
      const feedIds = await recommendationIds('v1/feed', feedParams, signal);
      // Match the result loader's empty/unavailable-feed fallback to the full market.
      if (feedIds.length) ids = feedIds;
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }

  let response: Response;
  if (ids) {
    response = await fetch(buildMarketplaceApiPath('v1/listings/ranked'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include', signal,
      body: JSON.stringify({ ids, minPrice: filters.minPrice, maxPrice: filters.maxPrice,
        priceNegotiable: filters.priceNegotiable, search: filters.search,
        attributes: filters.attributes, page: 0, size: 1 }),
    });
  } else {
    response = await fetch(buildMarketplaceApiPath('v1/listings', apiParams), {
      headers: { Accept: 'application/json' }, credentials: 'include', signal,
    });
  }

  if (!response.ok) throw new Error(`marketplace_preview_${response.status}`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error('marketplace_preview_invalid');
  }
  const totalElements = typeof payload === 'object' && payload !== null
    ? (payload as { totalElements?: unknown }).totalElements
    : undefined;
  if (typeof totalElements !== 'number'
    || !Number.isSafeInteger(totalElements)
    || totalElements < 0) {
    throw new Error('marketplace_preview_invalid');
  }
  return totalElements;
}

async function recommendationIds(path: string, params: URLSearchParams, signal: AbortSignal): Promise<string[]> {
  const response = await fetch(buildMarketplaceApiPath(path, params, REC_API_BASE), {
    headers: { Accept: 'application/json' }, credentials: 'include', signal,
  });
  if (!response.ok) throw new Error(`marketplace_preview_${response.status}`);
  const payload: unknown = await response.json();
  const ids = typeof payload === 'object' && payload !== null && 'ids' in payload ? payload.ids : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw new Error('marketplace_preview_invalid');
  if ('empty' in (payload as object) && (payload as { empty: unknown }).empty === true) return [];
  return ids;
}
