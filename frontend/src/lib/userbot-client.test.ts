import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  UserbotApiError, avatarUrl, bindFeature, cancelLogin, startLogin, submitPassword,
} from './userbot-client';

function respond(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('userbot client', () => {
  it('posts the phone to the login endpoint through the same-origin proxy', async () => {
    const fetchMock = respond(200, { loginId: 'L1', status: 'CODE_SENT', codeType: 'APP', timeoutSec: 60 });
    vi.stubGlobal('fetch', fetchMock);

    const step = await startLogin('+998901234567');

    expect(step.loginId).toBe('L1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/userbot/v1/logins');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ phone: '+998901234567' });
  });

  it('turns the service error shape into a typed error with the Uzbek message', async () => {
    vi.stubGlobal('fetch', respond(429, { code: 'FLOOD_WAIT', message: '42 soniyadan keyin', retryAfterSec: 42 }));
    const err = await submitPassword('L1', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(UserbotApiError);
    expect(err).toMatchObject({ status: 429, code: 'FLOOD_WAIT', retryAfterSec: 42, message: '42 soniyadan keyin' });
  });

  it('a proxy 502 without a code still yields a readable error', async () => {
    vi.stubGlobal('fetch', respond(502, { message: 'Userbot API unreachable' }));
    const err = await bindFeature('PAYMENT', 'a1').catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('the password never appears in a thrown error', async () => {
    vi.stubGlobal('fetch', respond(400, { code: 'PASSWORD_INVALID', message: "Parol noto'g'ri." }));
    const err = await submitPassword('L1', 'hunter2-secret').catch((e) => e);
    expect(String(err)).not.toContain('hunter2-secret');
  });

  it('cancel and disconnect accept 204', async () => {
    vi.stubGlobal('fetch', respond(204));
    await expect(cancelLogin('L1')).resolves.toBeUndefined();
  });

  it('ids are encoded into the path', () => {
    expect(avatarUrl('a/../b')).toBe('/api/userbot/v1/accounts/a%2F..%2Fb/avatar');
  });
});
