/**
 * Linking a Konami account to a mailbox: email change, then a forgot-password
 * mail as proof. The wizard polls the session; this turns its state into
 * what the step shows.
 */

export type LinkSessionState = 'WAIT_EMAIL_CHANGE' | 'WAIT_RESET' | 'VERIFIED' | 'EXPIRED' | 'CANCELLED';

export type LinkSession = {
  id: string;
  mailboxId: string;
  email: string;
  accountId: string;
  state: LinkSessionState;
  stepDeadline: string;
  emailChangeCode: string | null;
  notRegistered: boolean;
};

export type SessionView = {
  /** 0 pick account, 1 email change, 2 reset, 3 done. */
  step: 0 | 1 | 2 | 3;
  title: string;
  body: string;
  secondsLeft: number;
  canRetry: boolean;
  canCancel: boolean;
  codeShown: string | null;
  warning: string | null;
};

export function sessionView(s: LinkSession, now: Date): SessionView {
  const secondsLeft = Math.max(0, Math.floor((Date.parse(s.stepDeadline) - now.getTime()) / 1000));
  const live = s.state === 'WAIT_EMAIL_CHANGE' || s.state === 'WAIT_RESET';
  const common = { secondsLeft: live ? secondsLeft : 0, canRetry: s.state === 'EXPIRED', canCancel: live || s.state === 'EXPIRED' };
  switch (s.state) {
    case 'WAIT_EMAIL_CHANGE':
      return {
        ...common,
        step: 1,
        title: 'Konami emailini almashtiring',
        body: `Yangi email sifatida ${s.email} ni yozing. Konami yuborgan kod shu yerda chiqadi.`,
        codeShown: s.emailChangeCode,
        warning: s.notRegistered ? 'Email hali o‘zgarmagan' : null,
      };
    case 'WAIT_RESET':
      return {
        ...common,
        step: 2,
        title: 'Endi Forgot password qiling',
        body: `Email sifatida ${s.email} ni yozing — parolni o‘zgartirish shart emas, xatning kelishining o‘zi kifoya.`,
        codeShown: null,
        warning: null,
      };
    case 'VERIFIED':
      return {
        ...common,
        step: 3,
        title: 'Muvaffaqiyatli ulandi',
        body: `Akkount ${s.email} ga ulangan va tasdiqlangan.`,
        codeShown: null,
        warning: null,
      };
    case 'EXPIRED':
      return {
        ...common,
        step: 1,
        title: 'Vaqt tugadi',
        body: '15 daqiqa ichida Konami xati kelmadi. Akkount va quti o‘zgarmadi — qadamni qaytadan boshlang.',
        codeShown: null,
        warning: null,
      };
    case 'CANCELLED':
      return { ...common, step: 0, title: 'Bekor qilindi', body: '', codeShown: null, warning: null };
  }
}

export function pollIntervalMs(state: LinkSessionState): number {
  return state === 'WAIT_EMAIL_CHANGE' || state === 'WAIT_RESET' ? 3000 : 0;
}
