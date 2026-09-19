import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

describe('mail session handling', () => {
  it('returns 401 for an expired name-edit session instead of redirecting a PATCH to the login page', async () => {
    const request = new NextRequest('http://localhost:3001/api/trade/v1/mailboxes/box/name', { method: 'PATCH' });
    const response = await proxy(request);
    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('still redirects signed-out page visits to login', async () => {
    const response = await proxy(new NextRequest('http://localhost:3001/box'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('login');
  });

  it('allows authenticated mailbox name requests through', async () => {
    const request = new NextRequest('http://localhost:3001/api/trade/v1/mailboxes/box/name', {
      method: 'PATCH', headers: { Cookie: 'access_token=test-access-token' },
    });
    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
