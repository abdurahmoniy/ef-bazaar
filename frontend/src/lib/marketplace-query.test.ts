import { describe, expect, it } from 'vitest';

import {
  clearMarketplaceCriteria,
  getMarketplaceView,
  marketplaceHref,
  removeMarketplaceParams,
  searchParamsToInput,
  setMarketplacePage,
  setMarketplaceQuickFilter,
  setMarketplaceSearch,
  setMarketplaceSort,
  setMarketplaceView,
} from './marketplace-query';

const MESSI_CARD = '101:11111111-1111-4111-8111-111111111111:N';
const NEYMAR_CARD = '202:22222222-2222-4222-8222-222222222222:P';

describe('marketplace query state', () => {
  it('defaults invalid views to auto and round-trips explicit views without a page', () => {
    expect(getMarketplaceView(new URLSearchParams())).toBe('auto');
    expect(getMarketplaceView(new URLSearchParams('view=cards'))).toBe('auto');
    const list = setMarketplaceView(new URLSearchParams('page=3'), 'list');
    const grid = setMarketplaceView(new URLSearchParams('page=3'), 'grid');
    expect(list.toString()).toBe('view=list');
    expect(grid.toString()).toBe('view=grid');
    expect(getMarketplaceView(list)).toBe('list');
    expect(getMarketplaceView(grid)).toBe('grid');
    expect(setMarketplaceView(new URLSearchParams('view=list&page=3'), 'auto').toString()).toBe('');
  });

  it('sets a trimmed search while preserving unrelated and repeated query criteria', () => {
    const current = new URLSearchParams();
    current.set('search', 'legacy');
    current.set('filter', 'clean');
    current.set('attr.team_strength.min', '3000');
    current.set('sort', 'price,asc');
    current.set('view', 'grid');
    current.set('page', '2');
    current.append('matchCard', MESSI_CARD);
    current.append('matchCard', NEYMAR_CARD);

    const next = setMarketplaceSearch(current, '  Messi  ');

    expect(next.get('q')).toBe('Messi');
    expect(next.has('search')).toBe(false);
    expect(next.has('page')).toBe(false);
    expect(next.get('filter')).toBe('clean');
    expect(next.get('attr.team_strength.min')).toBe('3000');
    expect(next.get('sort')).toBe('price,asc');
    expect(next.get('view')).toBe('grid');
    expect(next.getAll('matchCard')).toEqual([MESSI_CARD, NEYMAR_CARD]);
    expect(current.has('q')).toBe(false);
  });

  it('resets page for sort and quick-filter changes but pagination changes only page', () => {
    const current = new URLSearchParams('page=4&sort=createdAt%2Cdesc&attr.exchange_mode=BOTH&campaign=summer');

    const sorted = setMarketplaceSort(current, 'price,asc');
    expect(sorted.get('sort')).toBe('price,asc');
    expect(sorted.has('page')).toBe(false);
    expect(sorted.get('attr.exchange_mode')).toBe('BOTH');
    expect(sorted.get('campaign')).toBe('summer');

    const quickFiltered = setMarketplaceQuickFilter(current, 'exchange');
    expect(quickFiltered.toString()).toBe('sort=createdAt%2Cdesc&campaign=summer&filter=exchange');

    const paged = setMarketplacePage(current, 2.9);
    expect(paged.toString()).toBe('page=2&sort=createdAt%2Cdesc&attr.exchange_mode=BOTH&campaign=summer');
  });

  it('clears marketplace criteria but preserves display, order, and tracking state', () => {
    const current = new URLSearchParams();
    current.set('q', 'Messi');
    current.set('search', 'legacy');
    current.set('filter', 'clean');
    current.set('minPrice', '100');
    current.set('maxPrice', '200');
    current.set('priceNegotiable', 'true');
    current.append('matchCard', MESSI_CARD);
    current.append('matchCard', NEYMAR_CARD);
    current.set('matchStrictness', '4');
    current.set('page', '3');
    current.set('size', '12');
    current.set('attr.team_strength.min', '3000');
    current.set('view', 'list');
    current.set('sort', 'price,asc');
    current.set('utm_source', 'telegram');

    const next = clearMarketplaceCriteria(current);

    expect(next.toString()).toBe('view=list&sort=price%2Casc&utm_source=telegram');
    expect(current.getAll('matchCard')).toEqual([MESSI_CARD, NEYMAR_CARD]);
  });

  it('removes requested owned parameters and resets the page without mutating its input', () => {
    const current = new URLSearchParams('q=Messi&attr.team_strength.min=3000&page=2&view=list');

    const next = removeMarketplaceParams(current, ['q', 'attr.team_strength.min']);

    expect(next.toString()).toBe('view=list');
    expect(current.toString()).toBe('q=Messi&attr.team_strength.min=3000&page=2&view=list');
  });

  it('formats clean marketplace hrefs and preserves repeated keys when converting to input', () => {
    expect(marketplaceHref(new URLSearchParams())).toBe('/marketplace');
    expect(marketplaceHref(new URLSearchParams('view=grid'))).toBe('/marketplace?view=grid');
    expect(searchParamsToInput(new URLSearchParams(`q=Messi&matchCard=${encodeURIComponent(MESSI_CARD)}&matchCard=${encodeURIComponent(NEYMAR_CARD)}`))).toEqual({
      q: 'Messi',
      matchCard: [MESSI_CARD, NEYMAR_CARD],
    });
  });
});
