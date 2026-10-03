import { describe, expect, it } from 'vitest';

import { initialLogin, loginReducer, resendSecondsLeft } from './userbot-login-flow';

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
      type: 'failure', error: { code: 'CODE_INVALID', message: "Kod noto'g'ri." },
    });
    expect(s).toMatchObject({ step: 'code', loginId: 'L1', busy: false, error: "Kod noto'g'ri." });
  });

  it.each(['LOGIN_GONE', 'CODE_EXPIRED'])('%s starts over from the phone and forgets the login id', (code) => {
    const s = loginReducer({ ...initialLogin, step: 'password', loginId: 'L1' }, {
      type: 'failure', error: { code, message: 'Boshidan boshlang.' },
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
});
