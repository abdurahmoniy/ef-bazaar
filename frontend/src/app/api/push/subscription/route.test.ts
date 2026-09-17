import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth', () => ({ getMe: vi.fn() }));
vi.mock('@/lib/push-server', () => ({ savePushSubscription: vi.fn(), removePushSubscription: vi.fn() }));
import { getMe } from '@/lib/auth';
import { savePushSubscription } from '@/lib/push-server';
import { PUT, DELETE } from './route';

function request(body: unknown, origin = 'https://efbazaar.uz') {
  return new NextRequest('http://internal:3000/api/push/subscription', {
    method: 'PUT', headers: { host: 'efbazaar.uz', origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
beforeEach(() => vi.resetAllMocks());
describe('push subscription ownership', () => {
  it.each(['https://evil.example', 'null', 'invalid'])('rejects a foreign or invalid origin %s', async (origin) => {
    expect((await PUT(request({}, origin))).status).toBe(403);
    expect((await DELETE(request({}, origin))).status).toBe(403);
    expect(savePushSubscription).not.toHaveBeenCalled();
  });
  it('rejects stale registration when the account changed during permission request', async () => {
    vi.mocked(getMe).mockResolvedValue({ id: 'new-user' } as NonNullable<Awaited<ReturnType<typeof getMe>>>);
    expect((await PUT(request({ token: 'token', userId: 'old-user' }))).status).toBe(409);
    expect(savePushSubscription).not.toHaveBeenCalled();
  });
  it('registers for the authenticated user behind the internal reverse proxy', async () => {
    vi.mocked(getMe).mockResolvedValue({ id: 'user' } as NonNullable<Awaited<ReturnType<typeof getMe>>>);
    expect((await PUT(request({ token: 'token', userId: 'user' }))).status).toBe(204);
    expect(savePushSubscription).toHaveBeenCalledWith('token');
  });
  it('returns an unavailable status when registration fails', async () => {
    vi.mocked(getMe).mockResolvedValue({ id: 'user' } as NonNullable<Awaited<ReturnType<typeof getMe>>>);
    vi.mocked(savePushSubscription).mockRejectedValue(new Error('offline'));
    expect((await PUT(request({ token: 'token', userId: 'user' }))).status).toBe(503);
  });
});
