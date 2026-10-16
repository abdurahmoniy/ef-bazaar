import { describe, expect, it } from 'vitest';

import { pollIntervalMs, sessionView, type LinkSession } from './link-session';

const base: LinkSession = {
  id: 's1',
  mailboxId: 'm1',
  email: 'alibek1@efbazaar.uz',
  accountId: 'a1',
  state: 'WAIT_EMAIL_CHANGE',
  stepDeadline: '2026-10-16T10:15:00Z',
  emailChangeCode: null,
  notRegistered: false,
};

describe('sessionView', () => {
  it('shows the relayed code on the email step', () => {
    const v = sessionView({ ...base, emailChangeCode: '123456' }, new Date('2026-10-16T10:05:00Z'));
    expect(v.step).toBe(1);
    expect(v.codeShown).toBe('123456');
    expect(v.secondsLeft).toBe(600);
    expect(v.canCancel).toBe(true);
  });

  it('warns when Konami said the box is not on any account', () => {
    const v = sessionView({ ...base, notRegistered: true }, new Date('2026-10-16T10:00:00Z'));
    expect(v.warning).toBe('Email hali o‘zgarmagan');
  });

  it('reset step says the password change is optional', () => {
    const v = sessionView({ ...base, state: 'WAIT_RESET' }, new Date('2026-10-16T10:00:00Z'));
    expect(v.step).toBe(2);
    expect(v.body).toContain('parolni o‘zgartirish shart emas');
  });

  it('never counts below zero', () => {
    expect(sessionView(base, new Date('2026-10-16T11:00:00Z')).secondsLeft).toBe(0);
  });

  it('verified is the last step and cannot be cancelled', () => {
    const v = sessionView({ ...base, state: 'VERIFIED' }, new Date('2026-10-16T10:00:00Z'));
    expect(v.step).toBe(3);
    expect(v.title).toBe('Muvaffaqiyatli ulandi');
    expect(v.canCancel).toBe(false);
  });

  it('expired offers a retry', () => {
    const v = sessionView({ ...base, state: 'EXPIRED' }, new Date('2026-10-16T10:00:00Z'));
    expect(v.title).toBe('Vaqt tugadi');
    expect(v.canRetry).toBe(true);
  });
});

describe('pollIntervalMs', () => {
  it('polls while live and stops when done', () => {
    expect(pollIntervalMs('WAIT_EMAIL_CHANGE')).toBe(3000);
    expect(pollIntervalMs('WAIT_RESET')).toBe(3000);
    expect(pollIntervalMs('VERIFIED')).toBe(0);
    expect(pollIntervalMs('EXPIRED')).toBe(0);
    expect(pollIntervalMs('CANCELLED')).toBe(0);
  });
});
