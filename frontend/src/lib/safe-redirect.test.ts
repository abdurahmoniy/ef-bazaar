import { describe, expect, it } from 'vitest';

import { buildLoginHref, resolvePostLoginPath } from './safe-redirect';

describe('resolvePostLoginPath', () => {
  it('accepts internal paths', () => {
    expect(resolvePostLoginPath('/mail')).toBe('/mail');
    expect(resolvePostLoginPath('/mail/abc-123/42')).toBe('/mail/abc-123/42');
    expect(resolvePostLoginPath('/marketplace?sort=new')).toBe('/marketplace?sort=new');
  });

  it('falls back to /profile when from is missing', () => {
    expect(resolvePostLoginPath(null)).toBe('/profile');
    expect(resolvePostLoginPath(undefined)).toBe('/profile');
    expect(resolvePostLoginPath('')).toBe('/profile');
  });

  it('rejects absolute and protocol-relative URLs (open redirect)', () => {
    expect(resolvePostLoginPath('https://evil.com')).toBe('/profile');
    expect(resolvePostLoginPath('//evil.com')).toBe('/profile');
    expect(resolvePostLoginPath('/\\evil.com')).toBe('/profile');
    expect(resolvePostLoginPath('javascript:alert(1)')).toBe('/profile');
  });

  it('rejects paths with control characters', () => {
    expect(resolvePostLoginPath('/mail\r\nSet-Cookie: x')).toBe('/profile');
    expect(resolvePostLoginPath('/mail\u0000')).toBe('/profile');
  });
});

describe('buildLoginHref', () => {
  const from = (href: string) => new URL(href, 'https://efbazaar.uz').searchParams.get('from');

  it('returns to the current page and query after login', () => {
    expect(from(buildLoginHref('/marketplace/abc', ''))).toBe('/marketplace/abc');
    expect(from(buildLoginHref('/marketplace', 'sort=price%2Casc&attr.x=1'))).toBe('/marketplace?sort=price%2Casc&attr.x=1');
    expect(from(buildLoginHref('/', ''))).toBe('/');
  });

  it('round-trips through resolvePostLoginPath', () => {
    expect(resolvePostLoginPath(from(buildLoginHref('/users/42', 'tab=reviews')))).toBe('/users/42?tab=reviews');
  });

  it('omits from when the path is unknown, on auth pages, or unsafe', () => {
    expect(buildLoginHref(null, '')).toBe('/auth/login');
    expect(buildLoginHref('/auth/login', 'from=%2Fchats')).toBe('/auth/login');
    expect(buildLoginHref('//evil.com', '')).toBe('/auth/login');
  });
});
