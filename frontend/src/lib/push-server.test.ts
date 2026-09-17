import { beforeEach, describe, expect, it, vi } from 'vitest';
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from './api';
import { removePushSubscription, savePushSubscription } from './push-server';

beforeEach(() => vi.resetAllMocks());
describe('server push subscription', () => {
  it('stores a logout-cleanup cookie only after backend registration succeeds', async () => {
    await savePushSubscription('token');
    expect(apiFetch).toHaveBeenCalledWith('/marketplace/v1/notifications/push-tokens', expect.objectContaining({ method: 'PUT', body: { token: 'token' } }));
    expect(jar.set).toHaveBeenCalledWith('push_token', 'token', expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
  });
  it('does not persist a failed registration', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('unavailable'));
    await expect(savePushSubscription('token')).rejects.toThrow();
    expect(jar.set).not.toHaveBeenCalled();
  });
  it('revokes only the current browser token before clearing its cookie', async () => {
    jar.get.mockReturnValue({ value: 'token' });
    await removePushSubscription();
    expect(apiFetch).toHaveBeenCalledWith('/marketplace/v1/notifications/push-tokens', expect.objectContaining({ method: 'DELETE', body: { token: 'token' } }));
    expect(jar.delete).toHaveBeenCalledWith('push_token');
  });
});
