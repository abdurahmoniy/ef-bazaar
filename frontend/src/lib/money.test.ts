import { describe, expect, it } from 'vitest';

import { formatTiyin, uzsToTiyin } from './money';

/**
 * Every grouped number below is asserted with an explicit `\u00A0` escape.
 * The separator is a NO-BREAK SPACE on purpose — a thousands separator must
 * never line-break — and a literal invisible character in the source makes a
 * failing diff read as two identical strings. Never assert one directly.
 */
const NBSP = '\u00A0';
const ASCII_SPACE = '\u0020';

describe('formatTiyin', () => {
  it("renders whole so'm with a non-breaking thousands separator", () => {
    expect(formatTiyin(10_000_000)).toBe(`100${NBSP}000`);
  });

  it('keeps a non-zero tiyin part', () => {
    expect(formatTiyin(10_000_055)).toBe(`100${NBSP}000,55`);
  });

  it('pads a single-digit tiyin part', () => {
    expect(formatTiyin(10_000_005)).toBe(`100${NBSP}000,05`);
  });

  it('handles zero', () => {
    expect(formatTiyin(0)).toBe('0');
  });

  it('handles the bumped amount', () => {
    expect(formatTiyin(10_010_000)).toBe(`100${NBSP}100`);
  });

  it('groups every triple of a large amount', () => {
    expect(formatTiyin(123_456_789_00)).toBe(`123${NBSP}456${NBSP}789`);
  });

  it('leaves amounts under a thousand ungrouped', () => {
    expect(formatTiyin(99_900)).toBe('999');
  });

  it('never emits a plain ASCII space, whatever ICU build produced it', () => {
    expect(formatTiyin(1_000_000_000)).not.toContain(ASCII_SPACE);
    expect(formatTiyin(1_000_000_000)).toContain(NBSP);
  });

  it('keeps the sign on a negative amount', () => {
    // The history list flips the ledger sign before formatting, so this should
    // not reach the UI — but a wrong sign must not silently vanish either.
    expect(formatTiyin(-155)).toBe('-1,55');
  });
});

describe('uzsToTiyin', () => {
  it('multiplies by a hundred without floating point drift', () => {
    expect(uzsToTiyin(100_000)).toBe(10_000_000);
    expect(uzsToTiyin(1)).toBe(100);
  });

  it("rounds a fractional so'm to a whole one before converting", () => {
    expect(uzsToTiyin(1.4)).toBe(100);
    expect(uzsToTiyin(1.6)).toBe(200);
  });

  it('round-trips through formatTiyin', () => {
    expect(formatTiyin(uzsToTiyin(250_000))).toBe(`250${NBSP}000`);
  });
});
