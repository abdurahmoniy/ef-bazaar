import { describe, expect, it } from 'vitest';

import {
  getAuthCookieClearOptions,
  getAuthCookieOptions,
  normalizeCookieDomain,
} from './auth-cookies';

describe('auth cookie options', () => {
  it('uses SameSite=Lax without Secure in development so localhost works', () => {
    expect(getAuthCookieOptions({ NODE_ENV: 'development' })).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      partitioned: false,
      path: '/',
    });
  });

  it('uses SameSite=None + Secure + Partitioned in production so Telegram Web Mini App iframe works', () => {
    expect(
      getAuthCookieOptions({
        NODE_ENV: 'production',
        AUTH_COOKIE_DOMAIN: '.efbazaar.uz',
      }),
    ).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
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
        sameSite: 'none',
        partitioned: true,
        path: '/',
        domain: 'efbazaar.uz',
        maxAge: 0,
      },
      {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        path: '/',
        maxAge: 0,
      },
    ]);
  });
});
