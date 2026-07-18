import { describe, expect, it, vi } from 'vitest';

import { refreshSession, type RefreshedTokens } from './session-refresh';

const TOKENS: RefreshedTokens = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 2_592_000,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refreshSession', () => {
  it('returns new tokens on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(TOKENS));

    const result = await refreshSession('rt-success', fetchImpl);

    expect(result).toEqual({ ok: true, tokens: TOKENS });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/auth/v1/auth/refresh');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      refreshToken: 'rt-success',
    });
  });

  it('coalesces concurrent calls for the same token — rotation-safe', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchImpl = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const first = refreshSession('rt-concurrent', fetchImpl);
    const second = refreshSession('rt-concurrent', fetchImpl);
    resolveFetch(jsonResponse(TOKENS));

    expect(await first).toEqual({ ok: true, tokens: TOKENS });
    expect(await second).toEqual({ ok: true, tokens: TOKENS });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetches again after the in-flight call settles', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(TOKENS));

    await refreshSession('rt-sequential', fetchImpl);
    await refreshSession('rt-sequential', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('treats 401 as definitive — cookies should be cleared', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'invalid token' }, 401));

    expect(await refreshSession('rt-401', fetchImpl)).toEqual({
      ok: false,
      definitive: true,
    });
  });

  it('treats 5xx as transient — cookies stay for a retry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'boom' }, 503));

    expect(await refreshSession('rt-503', fetchImpl)).toEqual({
      ok: false,
      definitive: false,
    });
  });

  it('treats network errors as transient', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    expect(await refreshSession('rt-network', fetchImpl)).toEqual({
      ok: false,
      definitive: false,
    });
  });

  it('treats a malformed success body as transient', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));

    expect(await refreshSession('rt-malformed', fetchImpl)).toEqual({
      ok: false,
      definitive: false,
    });
  });
});
