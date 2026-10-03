import type { LoginStepResponse, UserbotAccount } from './userbot-types';

/**
 * The login dialog's state machine, kept pure so every transition is tested
 * without a browser. Codes and passwords are not in here — the inputs own them.
 * "back" and the start-over errors drop the login id: the service has either
 * forgotten it or the dialog is about to cancel it, and an old id must never be
 * sent again.
 */
export type LoginStep = 'phone' | 'code' | 'password' | 'done';

export interface LoginState {
  step: LoginStep;
  loginId: string | null;
  codeType?: string;
  resendAt: number | null;
  hint: string | null;
  account: UserbotAccount | null;
  error: string | null;
  busy: boolean;
}

export type LoginAction =
  | { type: 'submit' }
  | { type: 'response'; res: LoginStepResponse; now: number }
  | { type: 'failure'; error: { code: string; message: string } }
  | { type: 'back' }
  | { type: 'reset' };

export const initialLogin: LoginState = {
  step: 'phone', loginId: null, codeType: undefined, resendAt: null,
  hint: null, account: null, error: null, busy: false,
};

const START_OVER = new Set(['LOGIN_GONE', 'CODE_EXPIRED']);

export function loginReducer(s: LoginState, a: LoginAction): LoginState {
  switch (a.type) {
    case 'submit':
      return { ...s, busy: true, error: null };
    case 'response': {
      const { res, now } = a;
      if (res.status === 'CODE_SENT') {
        return {
          ...s, step: 'code', loginId: res.loginId, codeType: res.codeType, busy: false, error: null,
          resendAt: res.timeoutSec ? now + res.timeoutSec * 1000 : null,
        };
      }
      if (res.status === 'PASSWORD_REQUIRED') {
        return { ...s, step: 'password', loginId: res.loginId, hint: res.hint ?? null, busy: false, error: null };
      }
      return { ...initialLogin, step: 'done', account: res.account ?? null };
    }
    case 'failure':
      if (START_OVER.has(a.error.code)) return { ...initialLogin, error: a.error.message };
      return { ...s, busy: false, error: a.error.message };
    case 'back':
      return { ...initialLogin };
    case 'reset':
      return initialLogin;
  }
}

export function resendSecondsLeft(s: LoginState, now: number): number {
  if (s.resendAt === null) return 0;
  return Math.max(0, Math.ceil((s.resendAt - now) / 1000));
}
