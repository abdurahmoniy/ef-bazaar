import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetRefreshCaches,
  invalidateRefreshToken,
  refreshSession,
  type RefreshedTokens,
} from './session-refresh';

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

  it('fetches again once the remembered result has expired', async () => {
    // Was "fetches again after the in-flight call settles", asserting that a
    // spent token goes back to auth-service. It does not any more: rotation
    // means the backend would refuse it, and the caller — a request that was
    // already in flight — would be logged out over a session that is fine.
    // Past the window there is nothing to reuse, so it asks properly.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(TOKENS));
    const realNow = Date.now;

    await refreshSession('rt-sequential', fetchImpl);
    Date.now = () => realNow() + 60_000;
    try {
      await refreshSession('rt-sequential', fetchImpl);
    } finally {
      Date.now = realNow;
    }

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

/**
 * The bug users actually hit: a bare 401 on whatever they clicked, while the
 * session was perfectly valid.
 *
 * Refresh tokens rotate and the spent one is blacklisted. Requests already in
 * flight when a refresh lands still carry the old cookie — the browser learns
 * the new one only from a response it has not received yet — so they ask to
 * refresh a token the backend has just retired. Before, that second ask went
 * to auth-service and came back refused.
 *
 * Reported on accepting a proposal, where a four-second poll ran alongside the
 * click, and seen elsewhere too: every internal API call shares this function.
 */
describe('refreshSession — a request that was already travelling', () => {
  beforeEach(() => {
    __resetRefreshCaches();
  });

  it('answers a straggler from the refresh that already happened', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(TOKENS));

    const first = await refreshSession('rt-shared', fetchImpl);
    // A request that left the browser before the cookie was updated.
    const straggler = await refreshSession('rt-shared', fetchImpl);

    expect(straggler).toEqual(first);
    // The spent token must not reach auth-service a second time: it is
    // blacklisted, and the refusal is what logged the user out.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('still collapses refreshes that overlap', async () => {
    let release: (r: Response) => void = () => {};
    const fetchImpl = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );

    const a = refreshSession('rt-parallel', fetchImpl);
    const b = refreshSession('rt-parallel', fetchImpl);
    release(jsonResponse(TOKENS));

    expect(await a).toEqual(await b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failure', async () => {
    // A network blip must stay retryable rather than pinning the session to
    // "broken" for the length of the window.
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(jsonResponse(TOKENS));

    const failed = await refreshSession('rt-flaky', fetchImpl);
    const retried = await refreshSession('rt-flaky', fetchImpl);

    expect(failed).toEqual({ ok: false, definitive: false });
    expect(retried).toEqual({ ok: true, tokens: TOKENS });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps different sessions apart', async () => {
    const other: RefreshedTokens = { ...TOKENS, accessToken: 'other-access' };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(TOKENS))
      .mockResolvedValueOnce(jsonResponse(other));

    const one = await refreshSession('rt-user-a', fetchImpl);
    const two = await refreshSession('rt-user-b', fetchImpl);

    expect(one).toEqual({ ok: true, tokens: TOKENS });
    expect(two).toEqual({ ok: true, tokens: other });
  });

  it('evicts a cached refresh token from memory when invalidateRefreshToken is called', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(TOKENS));

    const first = await refreshSession('rt-logout', fetchImpl);
    expect(first).toEqual({ ok: true, tokens: TOKENS });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    invalidateRefreshToken('rt-logout');

    await refreshSession('rt-logout', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

