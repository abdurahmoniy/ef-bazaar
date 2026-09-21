import { beforeEach, describe, expect, it, vi } from 'vitest';

import { publishAccount, setAccountEmail, unpublishAccount } from './accounts-client';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('accounts client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes through the marketplace proxy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'listing-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishAccount('acc-1', {
      price: 2400000,
      priceNegotiable: true,
      exchangeMode: null,
      channelIds: [],
    });

    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/marketplace/v1/accounts/acc-1/publish');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('sends a cleared email as null, not an empty string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'acc-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await setAccountEmail('acc-1', '   ');

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ email: null });
  });

  it('carries the server message when publishing is refused', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 'account_without_photos', message: "Akkountga rasm qo'shing" }, 400),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishAccount('acc-1', {
      price: 2400000,
      priceNegotiable: false,
      exchangeMode: null,
      channelIds: [],
    });

    expect(result).toMatchObject({ ok: false, status: 400, code: 'account_without_photos' });
  });

  it('unpublishes without a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'acc-1', onMarket: false }));
    vi.stubGlobal('fetch', fetchMock);

    await unpublishAccount('acc-1');

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/marketplace/v1/accounts/acc-1/unpublish');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });
});
