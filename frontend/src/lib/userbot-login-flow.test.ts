import { describe, expect, it } from 'vitest';

import { initialLogin, loginReducer, resendSecondsLeft, MAX_ATTEMPTS } from './userbot-login-flow';

const T0 = 1_000_000;

describe('login flow', () => {
  it('phone → code: keeps the login id, the delivery and when resend unlocks', () => {
    const s = loginReducer(loginReducer(initialLogin, { type: 'submit' }), {
      type: 'response', now: T0, res: { loginId: 'L1', status: 'CODE_SENT', codeType: 'APP', timeoutSec: 60 },
    });
    expect(s).toMatchObject({ step: 'code', loginId: 'L1', codeType: 'APP', busy: false, error: null });
    expect(resendSecondsLeft(s, T0 + 18_000)).toBe(42);
    expect(resendSecondsLeft(s, T0 + 61_000)).toBe(0);
  });

  it('code → password carries the hint', () => {
    const atCode = { ...initialLogin, step: 'code' as const, loginId: 'L1' };
    const s = loginReducer(atCode, { type: 'response', now: T0, res: { loginId: 'L1', status: 'PASSWORD_REQUIRED', hint: 'mushuk' } });
    expect(s).toMatchObject({ step: 'password', hint: 'mushuk' });
  });

  it('DONE shows the connected account', () => {
    const account = { id: 'a1' } as never;
    const s = loginReducer({ ...initialLogin, step: 'password', loginId: 'L1' }, {
      type: 'response', now: T0, res: { loginId: 'L1', status: 'DONE', account },
    });
    expect(s).toMatchObject({ step: 'done', account, loginId: null });
  });

  it('a wrong code stays on the step and shows the message', () => {
    const s = loginReducer({ ...initialLogin, step: 'code', loginId: 'L1', busy: true }, {
      type: 'failure', op: 'submit', error: { code: 'CODE_INVALID', message: "Kod noto'g'ri." },
    });
    expect(s).toMatchObject({ step: 'code', loginId: 'L1', busy: false, error: "Kod noto'g'ri." });
  });

  it.each(['LOGIN_GONE', 'CODE_EXPIRED'])('%s starts over from the phone and forgets the login id', (code) => {
    const s = loginReducer({ ...initialLogin, step: 'password', loginId: 'L1' }, {
      type: 'failure', op: 'submit', error: { code, message: 'Boshidan boshlang.' },
    });
    expect(s).toMatchObject({ step: 'phone', loginId: null, error: 'Boshidan boshlang.' });
  });

  it('back from code returns to the phone step and drops the login id', () => {
    const s = loginReducer({ ...initialLogin, step: 'code', loginId: 'L1' }, { type: 'back' });
    expect(s).toMatchObject({ step: 'phone', loginId: null });
  });

  it('reset clears everything', () => {
    expect(loginReducer({ ...initialLogin, step: 'done', error: 'x' }, { type: 'reset' })).toEqual(initialLogin);
  });

  it('FLOOD_WAIT on submit starts over and keeps the message', () => {
    const s = loginReducer({ ...initialLogin, step: 'code', loginId: 'L1', busy: true }, {
      type: 'failure', op: 'submit', error: { code: 'FLOOD_WAIT', message: 'Kuting, keyin urinib ko\'ring.' },
    });
    expect(s).toMatchObject({ step: 'phone', loginId: null, error: 'Kuting, keyin urinib ko\'ring.' });
  });

  it('FLOOD_WAIT on resend keeps the step and loginId', () => {
    const s = loginReducer({ ...initialLogin, step: 'code', loginId: 'L1', busy: true }, {
      type: 'failure', op: 'resend', error: { code: 'FLOOD_WAIT', message: 'Kuting, keyin urinib ko\'ring.' },
    });
    expect(s).toMatchObject({ step: 'code', loginId: 'L1', busy: false, error: 'Kuting, keyin urinib ko\'ring.' });
  });

  it('four wrong codes stay on the code step', () => {
    let s = { ...initialLogin, step: 'code', loginId: 'L1' } as any;
    for (let i = 0; i < 4; i++) {
      s = loginReducer(s, {
        type: 'failure', op: 'submit', error: { code: 'CODE_INVALID', message: "Kod noto'g'ri." },
      });
      expect(s).toMatchObject({ step: 'code', loginId: 'L1', failures: i + 1 });
    }
  });

  it('fifth wrong code starts over with the "Urinishlar tugadi" suffix', () => {
    let s = { ...initialLogin, step: 'code', loginId: 'L1' } as any;
    for (let i = 0; i < 4; i++) {
      s = loginReducer(s, {
        type: 'failure', op: 'submit', error: { code: 'CODE_INVALID', message: "Kod noto'g'ri." },
      });
    }
    s = loginReducer(s, {
      type: 'failure', op: 'submit', error: { code: 'CODE_INVALID', message: "Kod noto'g'ri." },
    });
    expect(s).toMatchObject({
      step: 'phone',
      loginId: null,
      error: "Kod noto'g'ri. Urinishlar tugadi — boshidan boshlang.",
      failures: 0,
    });
  });

  it('a response resets the failure count', () => {
    let s = { ...initialLogin, step: 'code', loginId: 'L1', failures: 3 } as any;
    s = loginReducer(s, {
      type: 'response', now: T0, res: { loginId: 'L1', status: 'PASSWORD_REQUIRED' },
    });
    expect(s).toMatchObject({ step: 'password', failures: 0 });
  });
});
