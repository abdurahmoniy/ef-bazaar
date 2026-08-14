import { describe, expect, it } from 'vitest';

import { rewriteCookieHeader } from './proxy-refresh-cookies';

/**
 * The intermittent-401 regression.
 *
 * A refreshed token used to be written only to the response, which tells the
 * browser and only in time for the next request. The request in flight still
 * carried the expired access cookie, so the handler downstream found no token,
 * sent no Authorization header, and the upstream answered 401 — once per
 * expiry, on whatever the user clicked first.
 */
describe('rewriteCookieHeader', () => {
  it('puts the refreshed tokens on the request that triggered the refresh', () => {
    const header = rewriteCookieHeader(
      [{ name: 'theme', value: 'dark' }],
      { accessToken: 'new-access', refreshToken: 'new-refresh' },
    );

    expect(header).toContain('access_token=new-access');
    expect(header).toContain('refresh_token=new-refresh');
  });

  it('keeps every other cookie', () => {
    const header = rewriteCookieHeader(
      [
        { name: 'theme', value: 'dark' },
        { name: 'locale', value: 'uz' },
      ],
      { accessToken: 'a', refreshToken: 'r' },
    );

    expect(header).toContain('theme=dark');
    expect(header).toContain('locale=uz');
  });

  it('replaces a stale access token rather than sending both', () => {
    // Two access_token entries would let the upstream pick the expired one.
    const header = rewriteCookieHeader(
      [
        { name: 'access_token', value: 'expired' },
        { name: 'refresh_token', value: 'used' },
      ],
      { accessToken: 'fresh', refreshToken: 'rotated' },
    );

    expect(header).not.toContain('expired');
    expect(header).not.toContain('used');
    expect(header.match(/access_token=/g)).toHaveLength(1);
    expect(header.match(/refresh_token=/g)).toHaveLength(1);
  });

  it('works when there were no cookies at all', () => {
    const header = rewriteCookieHeader([], { accessToken: 'a', refreshToken: 'r' });
    expect(header).toBe('access_token=a; refresh_token=r');
  });
});
