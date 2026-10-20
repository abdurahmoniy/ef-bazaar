import { afterEach, expect, it, vi } from 'vitest';
import { watchRequest } from './watches-client';
afterEach(() => vi.unstubAllGlobals());
it('uses the authenticated service-specific same-origin route and preserves zero prices', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'mine' })); vi.stubGlobal('fetch', fetch);
  await watchRequest('search', '', 'POST', { name: 'Arzon', matchCard: [], matchStrictness: 4, minPrice: 0, maxPrice: 5000, notificationsEnabled: false });
  expect(fetch).toHaveBeenCalledWith('/api/rec/v1/saved-searches', expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ name: 'Arzon', matchCard: [], matchStrictness: 4, minPrice: 0, maxPrice: 5000, notificationsEnabled: false }) }));
  await watchRequest('price', '/one', 'DELETE');
  expect(fetch).toHaveBeenLastCalledWith('/api/marketplace/v1/price-watches/one', expect.objectContaining({ method: 'DELETE' }));
});
it('rejects a failed deletion rather than showing an optimistic success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'plan_projection_unavailable' }, { status: 503 })));
  await expect(watchRequest('price', '/one', 'DELETE')).rejects.toThrow(/tayyor/);
});
