import { describe, expect, it } from 'vitest';

import { resolvePostLoginPath } from './safe-redirect';

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
