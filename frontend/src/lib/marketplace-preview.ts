import { buildListingSearchParams, parseListingSearchParams } from './marketplace-format';
import { buildMarketplaceApiPath } from './marketplace-client-api';
import { applyMarketplaceFilterDraft, type MarketplaceFilterDraft } from './marketplace-filter-draft';
import { searchParamsToInput } from './marketplace-query';

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
) {
  const publicParams = applyMarketplaceFilterDraft(current, draft);
  const filters = parseListingSearchParams(searchParamsToInput(publicParams));
  const apiParams = buildListingSearchParams({ ...filters, page: 0, size: 1 });
  const response = await fetch(buildMarketplaceApiPath('v1/listings', apiParams), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

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
