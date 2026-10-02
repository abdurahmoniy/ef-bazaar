import { describe, expect, it } from 'vitest';

import { buildListingSearchParams } from './marketplace-format';
import { DEFAULT_LISTING_SORT, LISTING_SORT_OPTIONS, paramToSortId, sortIdToParam } from './marketplace-sort';

describe('marketplace sort', () => {
  it('has no recency ordering — newest-first is gone from the market', () => {
    expect(LISTING_SORT_OPTIONS.map((option) => option.param))
      .toEqual(['valueScore,desc', 'price,asc', 'price,desc', 'likeCount,desc']);
    expect(LISTING_SORT_OPTIONS.some((option) => option.param.startsWith('createdAt'))).toBe(false);
  });

  it('defaults to value and treats old recency links as default', () => {
    expect(DEFAULT_LISTING_SORT).toBe('valueScore,desc');
    expect(paramToSortId(undefined)).toBe('value');
    expect(paramToSortId('createdAt,desc')).toBe('value');
    expect(sortIdToParam(undefined)).toBe('valueScore,desc');
  });

  it('sends value sort to the API when none is chosen', () => {
    expect(buildListingSearchParams({}).get('sort')).toBe('valueScore,desc');
    expect(buildListingSearchParams({ sort: 'price,asc' }).get('sort')).toBe('price,asc');
  });
});
