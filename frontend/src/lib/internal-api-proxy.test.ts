import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyInternalApiRequest } from './internal-api-proxy';

const refreshPayload = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 2_592_000,
};

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`https://efbazaar.uz${path}`, init);
}

describe('proxyInternalApiRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries a protected mutation with refreshed cookies after upstream 401', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":"unauthenticated"}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"id":"trade-1"}', { status: 201 }));

    const response = await proxyInternalApiRequest(
      request('/api/trade/v1/trades/proposals/p-1/accept', {
        method: 'POST',
        headers: {
          Cookie: 'access_token=expired-access; refresh_token=old-refresh',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cardId: 'card-1' }),
      }),
      { params: Promise.resolve({ path: ['v1', 'trades', 'proposals', 'p-1', 'accept'] }) },
      { servicePrefix: 'trade', serviceName: 'Trade' },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'trade-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const first = fetchMock.mock.calls[0];
    expect(String(first[0])).toBe('http://nginx:8080/api/trade/v1/trades/proposals/p-1/accept');
    expect((first[1]?.headers as Headers).get('Authorization')).toBe('Bearer expired-access');
    expect((first[1]?.headers as Headers).get('Cookie')).toBeNull();
    expect(new TextDecoder().decode(first[1]?.body as ArrayBuffer)).toBe('{"cardId":"card-1"}');

    const refresh = fetchMock.mock.calls[1];
    expect(String(refresh[0])).toBe('http://nginx:8080/api/auth/v1/auth/refresh');
    expect(refresh[1]?.body).toBe('{"refreshToken":"old-refresh"}');

    const retry = fetchMock.mock.calls[2];
    expect((retry[1]?.headers as Headers).get('Authorization')).toBe('Bearer new-access');
    expect((retry[1]?.headers as Headers).get('Cookie')).toBeNull();
    expect(new TextDecoder().decode(retry[1]?.body as ArrayBuffer)).toBe('{"cardId":"card-1"}');

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('access_token=new-access');
    expect(setCookie).toContain('refresh_token=new-refresh');
  });

  it('returns invalid_path without calling upstream for unsafe path segments', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await proxyInternalApiRequest(
      request('/api/trade/../secret', { method: 'GET' }),
      { params: Promise.resolve({ path: ['..', 'secret'] }) },
      { servicePrefix: 'trade', serviceName: 'Trade' },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps rotated cookies when retrying after refresh hits a network error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":"unauthenticated"}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshPayload), { status: 200 }))
      .mockRejectedValueOnce(new Error('connection reset'));

    const response = await proxyInternalApiRequest(
      request('/api/trade/v1/trades/proposals/p-1/accept', {
        method: 'POST',
        headers: {
          Cookie: 'access_token=expired-access; refresh_token=old-refresh',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cardId: 'card-1' }),
      }),
      { params: Promise.resolve({ path: ['v1', 'trades', 'proposals', 'p-1', 'accept'] }) },
      { servicePrefix: 'trade', serviceName: 'Trade' },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'bad_gateway' });
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('access_token=new-access');
    expect(setCookie).toContain('refresh_token=new-refresh');
  });

  it('rejects oversized replayable request bodies before proxying', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await proxyInternalApiRequest(
      request('/api/trade/v1/trades/proposals/p-1/accept', {
        method: 'POST',
        headers: {
          Cookie: 'access_token=access; refresh_token=refresh',
          'Content-Type': 'application/json',
          'Content-Length': '1000001',
        },
        body: '{}',
      }),
      { params: Promise.resolve({ path: ['v1', 'trades', 'proposals', 'p-1', 'accept'] }) },
      { servicePrefix: 'trade', serviceName: 'Trade' },
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'payload_too_large' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
