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
      path: '/',
    });
  });

  it('uses SameSite=None + Secure in production so all Telegram Mini App WebViews accept it', () => {
    expect(
      getAuthCookieOptions({
        NODE_ENV: 'production',
        AUTH_COOKIE_DOMAIN: '.efbazaar.uz',
      }),
    ).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
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
        path: '/',
        domain: 'efbazaar.uz',
        maxAge: 0,
      },
      {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 0,
      },
    ]);
  });
});
