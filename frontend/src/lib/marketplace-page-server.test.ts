import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('./api', () => ({ apiFetch: mocks.apiFetch }));

import { REC_TIMEOUT_MS, serverMarketplaceTransport } from './marketplace-page-server';

beforeEach(() => vi.resetAllMocks());

/** Sekin rec (o'lik emas) login qilgan har foydalanuvchining sahifasini 60 s ushlab turmasin. */
it('bounds every recommendation call with a timeout signal', async () => {
  mocks.apiFetch.mockResolvedValue({ ids: [] });
  await serverMarketplaceTransport.recGet('v1/feed', new URLSearchParams({ profileHash: 'h' }));
  const [path, init] = mocks.apiFetch.mock.calls[0];
  expect(path).toBe('/rec/v1/feed?profileHash=h');
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(REC_TIMEOUT_MS).toBeLessThanOrEqual(3000);
});
