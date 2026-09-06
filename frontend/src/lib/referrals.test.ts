import { afterEach, describe, expect, it, vi } from 'vitest';

import { claimReferral } from './referrals';

afterEach(() => vi.unstubAllGlobals());

describe('claimReferral', () => {
  it.each([500, 429, 401, 403, 400, 404])('rejects HTTP %s so attribution can be retried', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(claimReferral('ABCD2345')).rejects.toThrow();
  });

  it.each([true, false])('accepts an explicit successful business result: %s', async (claimed) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ claimed })));
    await expect(claimReferral('ABCD2345')).resolves.toBe(claimed);
    expect(fetch).toHaveBeenCalledWith('/api/marketplace/v1/referrals/claim', expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({ code: 'ABCD2345' }),
    }));
  });

  it.each([{}, { claimed: null }, { claimed: 'false' }])('preserves attribution for an ambiguous response %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(claimReferral('ABCD2345')).rejects.toThrow();
  });

  it('preserves a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network failed')));
    await expect(claimReferral('ABCD2345')).rejects.toThrow('Network failed');
  });
});
