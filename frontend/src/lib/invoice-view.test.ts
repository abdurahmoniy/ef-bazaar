import { describe, expect, it } from 'vitest';

import {
  countdownAnnouncement,
  formatCountdown,
  invoiceBumpTiyin,
  secondsUntil,
  transferAmountForCopy,
} from './invoice-view';

describe('secondsUntil', () => {
  const now = Date.parse('2026-08-13T09:00:00Z');

  it('counts the whole seconds that remain', () => {
    expect(secondsUntil('2026-08-13T09:15:00Z', now)).toBe(900);
  });

  it('floors a partial second rather than rounding up', () => {
    expect(secondsUntil('2026-08-13T09:00:01.900Z', now)).toBe(1);
  });

  it('clamps a passed deadline to zero', () => {
    expect(secondsUntil('2026-08-13T08:59:00Z', now)).toBe(0);
  });

  it('treats an unparseable deadline as expired instead of returning NaN', () => {
    expect(secondsUntil('not a date', now)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('pads both halves', () => {
    expect(formatCountdown(900)).toBe('15:00');
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(61)).toBe('01:01');
  });

  it('shows zero rather than a negative clock', () => {
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('countdownAnnouncement', () => {
  it('says nothing while there is plenty of time', () => {
    expect(countdownAnnouncement(900)).toBeNull();
    expect(countdownAnnouncement(301)).toBeNull();
  });

  it('speaks once at five minutes and holds that text', () => {
    // A live region announces on CHANGE — a string that stays put is silence.
    expect(countdownAnnouncement(300)).toContain('besh daqiqa');
    expect(countdownAnnouncement(300)).toBe(countdownAnnouncement(120));
  });

  it('speaks again under a minute', () => {
    expect(countdownAnnouncement(60)).toContain('bir daqiqadan kam');
    expect(countdownAnnouncement(1)).toBe(countdownAnnouncement(60));
  });

  it('says the window has closed, and what to do', () => {
    expect(countdownAnnouncement(0)).toContain('muddati tugadi');
    expect(countdownAnnouncement(0)).toContain('Yangi so‘rov');
  });

  it('treats a negative clock as expired, not as plenty of time', () => {
    expect(countdownAnnouncement(-5)).toBe(countdownAnnouncement(0));
  });

  it('announces at most three times over the whole window', () => {
    const spoken = new Set<string>();
    for (let left = 900; left >= 0; left -= 1) {
      const line = countdownAnnouncement(left);
      if (line) spoken.add(line);
    }
    expect(spoken.size).toBe(3);
  });
});

describe('invoiceBumpTiyin', () => {
  it('is zero when the transfer equals what was requested', () => {
    expect(invoiceBumpTiyin({ requestedTiyin: 10_000_000, transferTiyin: 10_000_000 })).toBe(0);
  });

  it('is the difference when the amount was bumped for disambiguation', () => {
    expect(invoiceBumpTiyin({ requestedTiyin: 10_000_000, transferTiyin: 10_010_000 })).toBe(10_000);
  });
});

describe('transferAmountForCopy', () => {
  it("copies plain digits so a banking app accepts the paste", () => {
    expect(transferAmountForCopy(10_010_000)).toBe('100100');
  });

  it('never truncates a tiyin remainder away — the amount must match exactly', () => {
    expect(transferAmountForCopy(10_010_055)).toBe('100100.55');
  });
});
