import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasCookie, getMe } = vi.hoisted(() => ({ hasCookie: vi.fn(), getMe: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ has: hasCookie }) }));
vi.mock('@/lib/auth', () => ({ getMe }));

import { GET } from './route';

beforeEach(() => vi.resetAllMocks());

describe('verified public session state', () => {
  it('returns anonymous without requesting a user when there is no access cookie', async () => {
    hasCookie.mockReturnValue(false);
    const response = await GET();
    expect(await response.json()).toEqual({ authenticated: false });
    expect(getMe).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not display profile navigation for an expired or rejected session', async () => {
    hasCookie.mockReturnValue(true);
    getMe.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ authenticated: false });
  });

  it('matches the marketplace anonymous fallback when session verification is unavailable', async () => {
    hasCookie.mockReturnValue(true);
    getMe.mockRejectedValue(new Error('Auth unavailable'));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
  });

  it('reports a verified session without exposing user details or caching it', async () => {
    hasCookie.mockReturnValue(true);
    getMe.mockResolvedValue({ id: 'verified-user', email: 'private@example.com' });
    const response = await GET();
    expect(await response.json()).toEqual({ authenticated: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
