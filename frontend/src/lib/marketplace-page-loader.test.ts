import { describe, expect, it, vi } from 'vitest';

import {
  loadMarketplacePage,
  MarketplaceLoadError,
  type MarketplaceTransport,
} from './marketplace-page-loader';
import type { ListingResponse, MatchDetails, PageResponse } from './marketplace-types';

const listing = (id: string) => ({ id, description: id } as ListingResponse);
const page = (ids: string[], extra: Partial<PageResponse<ListingResponse>> = {}): PageResponse<ListingResponse> => ({
  content: ids.map(listing), page: 0, size: 12, totalElements: ids.length, totalPages: 1, ...extra,
});
const details = (percent: number) => ({ percent, exactCount: 1, alternateCount: 0, missingCount: 0,
  selectedCount: 1, strictness: 0, exactEfhubIds: [101], alternateEfhubIds: [], missingEfhubIds: [],
  priorityEfhubIds: [], earnedWeight: 1, possibleWeight: 1 } as MatchDetails);

function transport(overrides: Partial<{
  listings: () => unknown; ranked: (body: Record<string, unknown>) => unknown;
  feed: (params?: URLSearchParams) => unknown; feedDetails: () => unknown;
  match: (params?: URLSearchParams) => unknown; matchDetails: () => unknown;
}> = {}) {
  const calls: string[] = [];
  const t: MarketplaceTransport = {
    marketplaceGet: vi.fn(async (path, params) => {
      calls.push(`GET mp ${path}?${params?.toString() ?? ''}`);
      return (overrides.listings ?? (() => page(['m1', 'm2'])))() as never;
    }),
    marketplacePost: vi.fn(async (path, body) => {
      calls.push(`POST mp ${path}`);
      return (overrides.ranked ?? ((b: Record<string, unknown>) => page(b.ids as string[])))(
        body as Record<string, unknown>) as never;
    }),
    recGet: vi.fn(async (path, params) => {
      calls.push(`GET rec ${path}?${params?.toString() ?? ''}`);
      const map: Record<string, ((p?: URLSearchParams) => unknown) | undefined> = {
        'v1/feed': overrides.feed ?? (() => ({ empty: false, profileHash: 'h1', ids: ['a', 'b', 'c'] })),
        'v1/feed/details': overrides.feedDetails ?? (() => ({ b: details(40) })),
        'v1/match': overrides.match ?? (() => ({ ids: ['x', 'y'] })),
        'v1/match/details': overrides.matchDetails ?? (() => ({ y: details(90) })),
      };
      return map[path]!(params) as never;
    }),
  };
  return { t, calls };
}

describe('loadMarketplacePage', () => {
  it('market tab uses value-sorted browse', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, { filters: { page: 0, size: 12 }, tab: 'market', authenticated: true });
    expect(result.mode).toBe('market');
    expect(result.page.content.map((l) => l.id)).toEqual(['m1', 'm2']);
    expect(calls[0]).toContain('GET mp v1/listings?');
    expect(calls[0]).toContain('sort=valueScore%2Cdesc');
    expect(calls).toHaveLength(1);
  });

  it('guest never calls feed even when tab says mine', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: false });
    expect(result.mode).toBe('market');
    expect(calls.some((c) => c.includes('v1/feed'))).toBe(false);
  });

  it('mine tab ranks the feed ids through marketplace with filters', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, {
      filters: { page: 1, size: 2, minPrice: 1000, search: 'messi', attributes: { platform: 'pc' } },
      tab: 'mine', authenticated: true, feedHash: 'h0',
    });
    expect(result.mode).toBe('mine');
    expect(result.profileHash).toBe('h1');
    // URLSearchParams obyektlari toEqual'da doim "teng" — satr bilan solishtiramiz.
    expect(calls).toContain('GET rec v1/feed?profileHash=h0');
    expect(t.marketplacePost).toHaveBeenCalledWith('v1/listings/ranked', {
      ids: ['a', 'b', 'c'], minPrice: 1000, maxPrice: undefined, priceNegotiable: undefined,
      search: 'messi', attributes: { platform: 'pc' }, page: 1, size: 2,
    });
  });

  it('keeps ranked order and attaches details by id', async () => {
    const { t } = transport();
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result.page.content.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(result.page.content[1].matchDetails?.percent).toBe(40);
    expect(result.page.content[1].matchKind).toBe('feed');
    expect(result.page.content[0].matchDetails).toBeUndefined();
  });

  it('empty feed falls back to market with a notice', async () => {
    const { t } = transport({ feed: () => ({ empty: true, profileHash: null, ids: [] }) });
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result).toMatchObject({ mode: 'market', notice: 'feed_empty' });
    expect(result.page.content.map((l) => l.id)).toEqual(['m1', 'm2']);
  });

  it('falls back to market with notice when rec fails', async () => {
    const { t } = transport({ feed: () => { throw new Error('rec down'); } });
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result).toMatchObject({ mode: 'market', notice: 'rec_unavailable' });
  });

  it('details failure keeps the list without explanations', async () => {
    const { t } = transport({ feedDetails: () => { throw new Error('details down'); } });
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result.mode).toBe('mine');
    expect(result.page.content.every((l) => l.matchDetails === undefined)).toBe(true);
  });

  it('player filter wins over the tab and tags filter details', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, {
      filters: { matchCards: ['101:p:N'], matchStrictness: 6 }, tab: 'market', authenticated: true,
    });
    expect(result.mode).toBe('match');
    expect(calls).toContain('GET rec v1/match?matchCard=101%3Ap%3AN&matchStrictness=6');
    expect(calls).toContain('GET rec v1/match/details?matchCard=101%3Ap%3AN&matchStrictness=6&ids=x&ids=y');
    expect(result.page.content.map((l) => l.id)).toEqual(['x', 'y']);
    expect(result.page.content[1]).toMatchObject({ matchKind: 'filter' });
    expect(result.page.content[1].matchDetails?.percent).toBe(90);
  });

  it('match mode errors instead of showing unfiltered listings', async () => {
    const { t } = transport({ match: () => { throw new Error('rec down'); } });
    await expect(loadMarketplacePage(t, {
      filters: { matchCards: ['101:p:N'] }, tab: 'mine', authenticated: true,
    })).rejects.toBeInstanceOf(MarketplaceLoadError);
    expect(t.marketplaceGet).not.toHaveBeenCalled();
  });

  it('no matching ids returns an empty page without calling ranked', async () => {
    const { t } = transport({ match: () => ({ ids: [] }) });
    const result = await loadMarketplacePage(t, {
      filters: { matchCards: ['101:p:N'], page: 2, size: 12 }, tab: 'market', authenticated: true,
    });
    expect(result.page).toEqual({ content: [], page: 2, size: 12, totalElements: 0, totalPages: 0 });
    expect(t.marketplacePost).not.toHaveBeenCalled();
  });

  it('marketplace failure is an error, not an empty market', async () => {
    const { t } = transport({ listings: () => { throw new Error('mp down'); } });
    await expect(loadMarketplacePage(t, { filters: {}, tab: 'market', authenticated: true }))
      .rejects.toBeInstanceOf(MarketplaceLoadError);
  });
});
