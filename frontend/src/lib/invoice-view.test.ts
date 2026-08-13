import { describe, expect, it } from 'vitest';

import {
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
