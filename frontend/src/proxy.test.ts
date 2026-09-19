import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn() }));
vi.mock('./lib/session-refresh', () => ({ refreshSession }));

import { proxy } from './proxy';

function request(path = '/', cookie?: string, userAgent = 'Mozilla/5.0') {
  const headers = new Headers({ 'user-agent': userAgent });
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(`https://efbazaar.uz${path}`, { headers });
}

beforeEach(() => refreshSession.mockReset());

describe('authenticated landing redirect', () => {
  it.each(['Mozilla/5.0', 'Googlebot/2.1 (+http://www.google.com/bot.html)'])('keeps the public landing response for visitors without a session: %s', async (agent) => {
    const response = await proxy(request('/', undefined, agent));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('temporarily redirects an existing session without allowing shared caching', async () => {
    const response = await proxy(request('/', 'access_token=existing-session'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://efbazaar.uz/marketplace');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('redirects after refreshing an expired access session and sends the new cookies', async () => {
    refreshSession.mockResolvedValue({ ok: true, tokens: {
      accessToken: 'new-access', refreshToken: 'new-refresh',
      accessExpiresInSeconds: 900, refreshExpiresInSeconds: 2592000,
    } });
    const response = await proxy(request('/', 'refresh_token=old-refresh'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://efbazaar.uz/marketplace');
    expect(response.cookies.get('access_token')?.value).toBe('new-access');
  });

  it.each([true, false])('keeps the landing page when refresh fails (definitive=%s)', async (definitive) => {
    refreshSession.mockResolvedValue({ ok: false, definitive });
    const response = await proxy(request('/', 'refresh_token=expired-refresh'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('preserves landing query parameters on the same-origin marketplace destination', async () => {
    const response = await proxy(request('/?utm_source=telegram&from=https://example.com', 'access_token=session'));
    expect(response.headers.get('location')).toBe('https://efbazaar.uz/marketplace?utm_source=telegram&from=https://example.com');
  });

  it('does not redirect other public pages or create a marketplace loop', async () => {
    for (const path of ['/marketplace', '/help']) {
      const response = await proxy(request(path, 'access_token=session'));
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    }
  });
});
