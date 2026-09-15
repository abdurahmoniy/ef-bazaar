import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetRefreshCaches, refreshSession } from './session-refresh';

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refreshSession — kirish shartlari', () => {
  beforeEach(() => {
    __resetRefreshCaches();
  });

  it('marks ACCESS_REQUIREMENTS_UNMET as access-required and definitive', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: 403, code: 'ACCESS_REQUIREMENTS_UNMET' }, 403));

    expect(await refreshSession('rt-access', fetchImpl)).toEqual({
      ok: false,
      definitive: true,
      accessRequired: true,
    });
  });

  it('keeps other 403s as a plain definitive failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: 'forbidden' }, 403));

    expect(await refreshSession('rt-403', fetchImpl)).toEqual({ ok: false, definitive: true });
  });
});
