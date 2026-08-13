import { describe, expect, it } from 'vitest';

import {
  MIN_TOP_UP_UZS,
  TOP_UP_PRESETS,
  formatTopUpInput,
  parseTopUpAmount,
} from './top-up-draft';

/** Explicit escape — never assert a literal invisible character. See money.test.ts. */
const NBSP = '\u00A0';

describe('formatTopUpInput', () => {
  it('keeps only digits', () => {
    expect(formatTopUpInput('1a2b3c')).toBe('123');
    expect(formatTopUpInput("  50 000 so'm ")).toBe(`50${NBSP}000`);
  });

  it('groups thousands with a non-breaking space as the user types', () => {
    expect(formatTopUpInput('100000')).toBe(`100${NBSP}000`);
  });

  it('stays empty for an empty or digit-free value', () => {
    expect(formatTopUpInput('')).toBe('');
    expect(formatTopUpInput('abc')).toBe('');
  });

  it('drops leading zeros instead of showing a padded amount', () => {
    expect(formatTopUpInput('0050000')).toBe(`50${NBSP}000`);
  });
});

describe('parseTopUpAmount', () => {
  it('accepts the grouped value the input itself produced', () => {
    expect(parseTopUpAmount(`100${NBSP}000`)).toEqual({ uzs: 100_000, error: null });
  });

  it('accepts a plain value', () => {
    expect(parseTopUpAmount('5000')).toEqual({ uzs: 5000, error: null });
  });

  it('asks for a value when the field is empty', () => {
    expect(parseTopUpAmount('')).toEqual({ uzs: null, error: 'Summani kiriting.' });
    expect(parseTopUpAmount('   ')).toEqual({ uzs: null, error: 'Summani kiriting.' });
  });

  it('rejects zero', () => {
    expect(parseTopUpAmount('0').uzs).toBeNull();
  });

  it('names the minimum, matching payment.deposit.minimum-uzs', () => {
    expect(MIN_TOP_UP_UZS).toBe(1000);
    expect(parseTopUpAmount('999')).toEqual({
      uzs: null,
      error: `Eng kam summa: 1${NBSP}000 so'm.`,
    });
  });

  it('accepts exactly the minimum', () => {
    expect(parseTopUpAmount('1000')).toEqual({ uzs: 1000, error: null });
  });

  it('rejects an amount that cannot be represented in tiyin', () => {
    expect(parseTopUpAmount('999999999999999999').error).toBe('Summa juda katta.');
  });

  it('every preset is a valid amount', () => {
    for (const preset of TOP_UP_PRESETS) {
      expect(parseTopUpAmount(String(preset))).toEqual({ uzs: preset, error: null });
    }
  });
});
