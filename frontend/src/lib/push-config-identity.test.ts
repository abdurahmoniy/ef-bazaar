import { expect, it, vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ getMe: vi.fn().mockResolvedValue({ id: 'user' }) }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/push-config', () => ({ getPushConfig: () => ({ config: null, vapidKey: '' }) }));
import { GET } from '@/app/api/push/config/route';
it('returns authenticated identity without Firebase configuration', async () => {
  expect(await (await GET()).json()).toEqual({ config: null, vapidKey: '', userId: 'user' });
});
