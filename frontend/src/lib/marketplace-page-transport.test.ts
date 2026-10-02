import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserMarketplaceTransport } from './marketplace-page-transport';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('browserMarketplaceTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the same-origin proxies', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ok({ ids: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await browserMarketplaceTransport.recGet('v1/feed', new URLSearchParams({ profileHash: 'h' }));
    await browserMarketplaceTransport.marketplaceGet('v1/listings', new URLSearchParams({ page: '1' }));
    await browserMarketplaceTransport.marketplacePost('v1/listings/ranked', { ids: ['a'] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/rec/v1/feed?profileHash=h',
      '/api/marketplace/v1/listings?page=1',
      '/api/marketplace/v1/listings/ranked',
    ]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ ids: ['a'] }) });
  });

  it('throws on a non-2xx answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(browserMarketplaceTransport.recGet('v1/feed')).rejects.toThrow('503');
  });
});
