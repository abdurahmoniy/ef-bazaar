import { describe, expect, it } from 'vitest';

import {
  getMarketplaceFeedHash,
  getMarketplaceTab,
  setMarketplaceFeed,
  setMarketplaceTab,
  clearMarketplaceCriteria,
  getMarketplaceView,
  loosenMarketplaceMatch,
  marketplaceHref,
  removeMarketplaceParams,
  searchParamsToInput,
  setMarketplacePage,
  setMarketplaceQuickFilter,
  setMarketplaceSearch,
  setMarketplaceSort,
  setMarketplaceView,
} from './marketplace-query';
import { parsePlayerMatchValues } from './player-match-query';

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

  it.each([
    ['search', ['q', 'search'], (params: URLSearchParams) => setMarketplaceSearch(params, '   ')],
    ['sort', ['sort'], (params: URLSearchParams) => setMarketplaceSort(params, '   ')],
  ] as const)('deletes blank %s state and resets page', (_name, ownedKeys, apply) => {
    const current = new URLSearchParams(
      'q=Messi&search=legacy&sort=price%2Casc&page=2&utm_source=telegram',
    );

    const next = apply(current);

    for (const key of ownedKeys) expect(next.has(key)).toBe(false);
    expect(next.has('page')).toBe(false);
    expect(next.get('utm_source')).toBe('telegram');
    expect(current.get('page')).toBe('2');
  });

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
    [-2.8, 0],
    [2.9, 2],
  ])('normalizes page input %s to the deterministic integer %i', (page, expected) => {
    const current = new URLSearchParams('page=7&view=list&utm_source=telegram');

    const next = setMarketplacePage(current, page);

    expect(next.toString()).toBe(
      `page=${expected}&view=list&utm_source=telegram`,
    );
    expect(next.get('page')).not.toMatch(/NaN|Infinity/);
    expect(current.get('page')).toBe('7');
  });

  it.each([
    ['all', []],
    ['negotiable', ['priceNegotiable']],
    ['clean', ['attr.has_google_play_link', 'attr.has_game_center_link']],
    ['exchange', ['attr.exchange_mode']],
  ] as const)('clears only the %s shortcut conflicts', (filter, removedKeys) => {
    const controlledKeys = [
      'priceNegotiable',
      'attr.has_google_play_link',
      'attr.has_game_center_link',
      'attr.exchange_mode',
    ];
    const current = new URLSearchParams(
      'filter=clean&page=4&priceNegotiable=false&attr.has_google_play_link=true&attr.has_game_center_link=true&attr.exchange_mode=BOTH&utm_source=telegram',
    );

    const next = setMarketplaceQuickFilter(current, filter);

    expect(next.get('filter')).toBe(filter === 'all' ? null : filter);
    for (const key of controlledKeys) {
      expect(next.has(key)).toBe(!removedKeys.some((removed) => removed === key));
    }
    expect(next.has('page')).toBe(false);
    expect(next.get('utm_source')).toBe('telegram');
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

  it.each([
    ['', 3],
    ['bogus', 3],
    ['999', 9],
  ])('loosens normalized match strictness for raw %j while preserving raw query state', (raw, expected) => {
    const current = new URLSearchParams();
    current.set('matchStrictness', raw);
    current.set('page', '7');
    current.set('utm_source', 'telegram');
    current.append('matchCard', MESSI_CARD);
    current.append('matchCard', NEYMAR_CARD);
    const normalized = parsePlayerMatchValues(
      current.getAll('matchCard'),
      current.get('matchStrictness') ?? undefined,
    ).strictness;

    const next = loosenMarketplaceMatch(current, normalized);

    expect(next.get('matchStrictness')).toBe(String(expected));
    expect(next.has('page')).toBe(false);
    expect(next.get('utm_source')).toBe('telegram');
    expect(next.getAll('matchCard')).toEqual([MESSI_CARD, NEYMAR_CARD]);
    expect(current.get('matchStrictness')).toBe(raw);
  });
});

describe('marketplace tabs', () => {
  const hash = 'a'.repeat(64);

  it('defaults signed-in buyers to their interests and guests to the market', () => {
    expect(getMarketplaceTab(new URLSearchParams(), true)).toBe('mine');
    expect(getMarketplaceTab(new URLSearchParams('tab=market'), true)).toBe('market');
    expect(getMarketplaceTab(new URLSearchParams('tab=mine'), false)).toBe('market');
    expect(getMarketplaceTab(new URLSearchParams(), false)).toBe('market');
  });

  it('switching tabs keeps filters but drops paging and the feed snapshot', () => {
    const current = new URLSearchParams(`minPrice=5&page=3&feed=${hash}&attr.platform=pc`);
    expect(setMarketplaceTab(current, 'market').toString()).toBe('minPrice=5&attr.platform=pc&tab=market');
    expect(setMarketplaceTab(new URLSearchParams('tab=market&page=2'), 'mine').toString()).toBe('');
  });

  it('page links keep the feed snapshot', () => {
    const withFeed = setMarketplaceFeed(new URLSearchParams('minPrice=5'), hash);
    expect(setMarketplacePage(withFeed, 2).get('feed')).toBe(hash);
    expect(setMarketplaceFeed(withFeed, undefined).has('feed')).toBe(false);
  });

  it('accepts only a well-formed feed hash', () => {
    expect(getMarketplaceFeedHash(new URLSearchParams(`feed=${hash}`))).toBe(hash);
    expect(getMarketplaceFeedHash(new URLSearchParams('feed=../x'))).toBeUndefined();
    expect(getMarketplaceFeedHash(new URLSearchParams())).toBeUndefined();
  });
});
