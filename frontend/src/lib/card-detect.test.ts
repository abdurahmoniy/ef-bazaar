import { describe, expect, it } from 'vitest';

import {
  detectBrand,
  formatPanForDisplay,
  luhnCheck,
  normalizePan,
} from './card-detect';

describe('normalizePan', () => {
  it('strips spaces, dashes, and other non-digit characters', () => {
    expect(normalizePan('4111 1111 1111 1111')).toBe('4111111111111111');
    expect(normalizePan('4111-1111-1111-1111')).toBe('4111111111111111');
    expect(normalizePan('  4111abc1111\n1111\t1111 ')).toBe('4111111111111111');
  });

  it('returns empty string for empty / nullish input', () => {
    expect(normalizePan('')).toBe('');
    expect(normalizePan(undefined as unknown as string)).toBe('');
  });
});

describe('detectBrand', () => {
  it('detects VISA from a leading 4', () => {
    expect(detectBrand('4111 1111 1111 1111')).toBe('VISA');
    expect(detectBrand('4')).toBe('VISA');
  });

  it('detects MC from the classic 51-55 range', () => {
    expect(detectBrand('5555 5555 5555 4444')).toBe('MC');
    expect(detectBrand('5100 0000 0000 0000')).toBe('MC');
    expect(detectBrand('5599 0000 0000 0000')).toBe('MC');
  });

  it('detects MC from the newer 2221-2720 range', () => {
    expect(detectBrand('2221 0000 0000 0000')).toBe('MC');
    expect(detectBrand('2720 0000 0000 0000')).toBe('MC');
    // Just outside the range — MC no longer matches, no other brand takes over.
    expect(detectBrand('2220 0000 0000 0000')).toBeNull();
    expect(detectBrand('2721 0000 0000 0000')).toBeNull();
  });

  it('detects UZCARD from prefix 8600', () => {
    expect(detectBrand('8600 0000 0000 0007')).toBe('UZCARD');
  });

  it('detects HUMO from prefix 9860', () => {
    expect(detectBrand('9860 0000 0000 0000')).toBe('HUMO');
  });

  it('returns null for unsupported / unknown BINs', () => {
    expect(detectBrand('3000 0000 0000 0000')).toBeNull(); // AmEx-ish
    expect(detectBrand('6011 0000 0000 0004')).toBeNull(); // Discover
    expect(detectBrand('')).toBeNull();
  });
});

describe('luhnCheck', () => {
  it('accepts known-valid PANs (matches backend LuhnValidator)', () => {
    expect(luhnCheck('4111 1111 1111 1111')).toBe(true); // VISA test PAN
    expect(luhnCheck('5555 5555 5555 4444')).toBe(true); // MC test PAN
    expect(luhnCheck('8600 0000 0000 0007')).toBe(true); // UZCARD test PAN
    expect(luhnCheck('9860 0000 0000 0000')).toBe(true); // HUMO test PAN
  });

  it('rejects PANs with an off-by-one check digit', () => {
    expect(luhnCheck('4111 1111 1111 1112')).toBe(false);
    expect(luhnCheck('5555 5555 5555 4445')).toBe(false);
    expect(luhnCheck('8600 0000 0000 0000')).toBe(false);
  });

  it('rejects too short and too long inputs', () => {
    expect(luhnCheck('4111111111')).toBe(false); // 10 digits
    expect(luhnCheck('41111111111111111111')).toBe(false); // 20 digits
  });

  it('rejects non-digit characters after stripping known spacers', () => {
    // Letters embedded in digits — normalizePan strips them, and the
    // remaining digits happen to Luhn-check-out, so we mirror the loose
    // backend contract: the wire value is the stripped string.
    expect(luhnCheck('4111 1111 1111 1111 ')).toBe(true);
    // But a purely non-digit / short input is rejected.
    expect(luhnCheck('abcd efgh ijkl mnop')).toBe(false);
  });
});

describe('formatPanForDisplay', () => {
  it('groups digits by four with spaces', () => {
    expect(formatPanForDisplay('4111111111111111')).toBe('4111 1111 1111 1111');
    expect(formatPanForDisplay('411111')).toBe('4111 11');
  });

  it('caps at 19 digits (max PAN length)', () => {
    expect(formatPanForDisplay('12345678901234567890')).toBe(
      '1234 5678 9012 3456 789',
    );
  });

  it('strips non-digits before grouping', () => {
    expect(formatPanForDisplay('4111-1111-1111-1111')).toBe(
      '4111 1111 1111 1111',
    );
  });
});
