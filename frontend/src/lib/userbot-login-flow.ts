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
  failures: number;
}

export type LoginAction =
  | { type: 'submit' }
  | { type: 'response'; res: LoginStepResponse; now: number }
  | { type: 'failure'; op: 'start' | 'submit' | 'resend'; error: { code: string; message: string } }
  | { type: 'back' }
  | { type: 'reset' };

export const initialLogin: LoginState = {
  step: 'phone', loginId: null, codeType: undefined, resendAt: null,
  hint: null, account: null, error: null, busy: false, failures: 0,
};

/** Maximum failed code or password attempts before session resets (userbot-service login.py _drop_if_spent) */
export const MAX_ATTEMPTS = 5;

export function loginReducer(s: LoginState, a: LoginAction): LoginState {
  switch (a.type) {
    case 'submit':
      return { ...s, busy: true, error: null };
    case 'response': {
      const { res, now } = a;
      if (res.status === 'CODE_SENT') {
        return {
          ...s, step: 'code', loginId: res.loginId, codeType: res.codeType, busy: false, error: null,
          resendAt: res.timeoutSec ? now + res.timeoutSec * 1000 : null, failures: 0,
        };
      }
      if (res.status === 'PASSWORD_REQUIRED') {
        return { ...s, step: 'password', loginId: res.loginId, hint: res.hint ?? null, busy: false, error: null, failures: 0 };
      }
      if (res.status === 'DONE') {
        return { ...initialLogin, step: 'done', account: res.account ?? null };
      }
      return { ...s, busy: false, error: 'Kutilmagan javob. Qayta urinib ko\'ring.' };
    }
    case 'failure': {
      const { code, message } = a.error;

      if (code === 'LOGIN_GONE' || code === 'CODE_EXPIRED') {
        return { ...initialLogin, error: message };
      }

      if (a.op === 'submit') {
        if (code === 'FLOOD_WAIT') {
          return { ...initialLogin, error: message };
        }

        const nextFailures = s.failures + 1;
        if (nextFailures >= MAX_ATTEMPTS) {
          return { ...initialLogin, error: `${message} Urinishlar tugadi — boshidan boshlang.` };
        }

        return { ...s, busy: false, error: message, failures: nextFailures };
      }

      // op === 'start' or 'resend' (not 'submit')
      return { ...s, busy: false, error: message };
    }
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
