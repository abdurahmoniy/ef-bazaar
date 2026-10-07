import { describe, expect, it } from 'vitest';

import { buildListingSearchParams } from './marketplace-format';
import { DEFAULT_LISTING_SORT, LISTING_SORT_OPTIONS, paramToSortId, sortIdToParam } from './marketplace-sort';

describe('marketplace sort', () => {
  it('offers newest and oldest ordering alongside existing sorts', () => {
    expect(LISTING_SORT_OPTIONS.map((option) => option.param))
      .toEqual(['valueScore,desc', 'price,asc', 'price,desc', 'likeCount,desc', 'createdAt,desc', 'createdAt,asc']);
    expect(sortIdToParam('newest')).toBe('createdAt,desc');
    expect(sortIdToParam('oldest')).toBe('createdAt,asc');
  });

  it('defaults to value and recognizes date ordering', () => {
    expect(DEFAULT_LISTING_SORT).toBe('valueScore,desc');
    expect(paramToSortId(undefined)).toBe('value');
    expect(paramToSortId('createdAt,desc')).toBe('newest');
    expect(paramToSortId('createdAt,asc')).toBe('oldest');
    expect(sortIdToParam(undefined)).toBe('valueScore,desc');
  });

  it('sends value sort to the API when none is chosen', () => {
    expect(buildListingSearchParams({}).get('sort')).toBe('valueScore,desc');
    expect(buildListingSearchParams({ sort: 'price,asc' }).get('sort')).toBe('price,asc');
  });
});
