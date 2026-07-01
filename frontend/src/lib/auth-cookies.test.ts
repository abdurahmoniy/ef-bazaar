import { describe, expect, it } from 'vitest';

import {
  getAuthCookieClearOptions,
  getAuthCookieOptions,
  normalizeCookieDomain,
} from './auth-cookies';

describe('auth cookie options', () => {
  it('keeps cookies host-only when no shared cookie domain is configured', () => {
    expect(getAuthCookieOptions({ NODE_ENV: 'development' })).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('adds a normalized shared domain for api subdomain requests', () => {
    expect(
      getAuthCookieOptions({
        NODE_ENV: 'production',
        AUTH_COOKIE_DOMAIN: '.efbazaar.uz',
      }),
    ).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      domain: 'efbazaar.uz',
    });
  });

  it('ignores empty cookie domains', () => {
    expect(normalizeCookieDomain('   ')).toBeUndefined();
  });

  it('clears both shared-domain and legacy host-only cookies', () => {
    expect(
      getAuthCookieClearOptions({
        NODE_ENV: 'production',
        AUTH_COOKIE_DOMAIN: 'efbazaar.uz',
      }),
    ).toEqual([
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        domain: 'efbazaar.uz',
        maxAge: 0,
      },
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      },
    ]);
  });
});
