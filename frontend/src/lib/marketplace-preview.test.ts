import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearMarketplaceFilterDraft, type MarketplaceFilterDraft } from './marketplace-filter-draft';
import { fetchMarketplaceResultCount } from './marketplace-preview';

const MESSI_CARD = '101:11111111-1111-4111-8111-111111111111:N';

function draft(overrides: Partial<MarketplaceFilterDraft> = {}): MarketplaceFilterDraft {
  return { ...clearMarketplaceFilterDraft(), ...overrides };
}

describe('fetchMarketplaceResultCount', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('expands public detailed filters into the one-row backend count request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [], page: 0, size: 1, totalElements: 37, totalPages: 37,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const current = new URLSearchParams(`q=Messi&filter=clean&page=4&matchCard=${encodeURIComponent(MESSI_CARD)}&matchCard=bad&matchStrictness=6&view=grid`);

    await expect(fetchMarketplaceResultCount(current, draft({
      platform: 'STEAM',
      minPrice: '100000',
      teamStrengthMin: '3200',
      googlePlayDisconnected: true,
      valuablePlayer: { efhubId: 101, name: 'Messi' },
    }), controller.signal)).resolves.toBe(37);

    const [path, options] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(path, 'http://localhost');
    expect(url.pathname).toBe('/api/marketplace/v1/listings');
    expect(url.searchParams.get('page')).toBe('0');
    expect(url.searchParams.get('size')).toBe('1');
    expect(url.searchParams.get('search')).toBe('Messi');
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.get('minPrice')).toBe('100000');
    expect(url.searchParams.get('attr.platform')).toBe('STEAM');
    expect(url.searchParams.get('attr.team_strength.min')).toBe('3200');
    expect(url.searchParams.get('attr.has_google_play_link')).toBe('false');
    expect(url.searchParams.get('attr.has_game_center_link')).toBeNull();
    expect(url.searchParams.get('attr.valuable_players_id')).toBe('101');
    expect(url.searchParams.get('attr.valuable_players_name')).toBe('Messi');
    expect(url.searchParams.getAll('matchCard')).toEqual([MESSI_CARD]);
    expect(url.searchParams.get('matchStrictness')).toBe('6');
    expect(options).toEqual({
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal: controller.signal,
    });
    expect(current.get('filter')).toBe('clean');
    expect(current.get('page')).toBe('4');
  });

  it.each([
    ['unsafe', '9007199254740993', null],
    ['maximum safe', '9007199254740991', '9007199254740991'],
  ] as const)('%s price reaches the preview API only when exactly representable', async (
    _name,
    minPrice,
    expected,
  ) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      totalElements: 0,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMarketplaceResultCount(
      new URLSearchParams(),
      draft({ minPrice }),
      new AbortController().signal,
    );

    const [path] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(path, 'http://localhost').searchParams.get('minPrice')).toBe(expected);
  });

  it('rejects non-success responses and malformed totals', async () => {
    const current = new URLSearchParams();
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchMarketplaceResultCount(current, draft(), controller.signal)).rejects.toThrow('marketplace_preview_503');

    for (const payload of [
      {},
      { totalElements: '37' },
      { totalElements: -1 },
      { totalElements: 1.5 },
      { totalElements: Number.MAX_SAFE_INTEGER + 1 },
      { totalElements: Number.POSITIVE_INFINITY },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
      await expect(fetchMarketplaceResultCount(current, draft(), controller.signal)).rejects.toThrow('marketplace_preview_invalid');
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalElements: Number.NaN }),
    }));
    await expect(fetchMarketplaceResultCount(current, draft(), controller.signal)).rejects.toThrow('marketplace_preview_invalid');
  });

  it('normalizes invalid JSON without leaking the parser error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', { status: 200 })));

    const promise = fetchMarketplaceResultCount(
      new URLSearchParams(),
      draft(),
      new AbortController().signal,
    );

    await expect(promise).rejects.toThrow('marketplace_preview_invalid');
    await expect(promise).rejects.not.toBeInstanceOf(SyntaxError);
  });

  it('propagates an AbortError raised while parsing the response body', async () => {
    const aborted = { name: 'AbortError' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(aborted),
    }));

    await expect(fetchMarketplaceResultCount(
      new URLSearchParams(),
      draft(),
      new AbortController().signal,
    )).rejects.toBe(aborted);
  });

  it('propagates fetch aborts without changing the caller input', async () => {
    const aborted = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
    const current = new URLSearchParams('q=Messi&page=3&attr.platform=PLAYSTATION');
    const controller = new AbortController();

    await expect(fetchMarketplaceResultCount(current, draft(), controller.signal)).rejects.toBe(aborted);
    expect(current.toString()).toBe('q=Messi&page=3&attr.platform=PLAYSTATION');
  });
});
