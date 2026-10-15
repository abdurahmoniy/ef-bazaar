import { describe, expect, it } from 'vitest';
import { fromEntitlementValue, isReduction, parseSomInput, toEntitlementValue } from './plans-admin';

describe('plans admin', () => {
  it('turns the unlimited box into null and back', () => {
    expect(toEntitlementValue({ unlimited: true, count: '5' })).toBeNull();
    expect(toEntitlementValue({ unlimited: false, count: ' 7 ' })).toBe('7');
    expect(fromEntitlementValue(null)).toEqual({ unlimited: true, count: '' });
    expect(fromEntitlementValue('3')).toEqual({ unlimited: false, count: '3' });
  });

  it('refuses what the backend would refuse', () => {
    for (const bad of ['', '-1', '2.5', 'abc']) {
      expect(() => toEntitlementValue({ unlimited: false, count: bad })).toThrow();
    }
    expect(toEntitlementValue({ unlimited: false, count: '0' })).toBe('0');
  });

  it('knows when saving will lock mailboxes', () => {
    expect(isReduction('5', '3')).toBe(true);
    expect(isReduction(null, '10')).toBe(true);
    expect(isReduction('3', null)).toBe(false);
    expect(isReduction('3', '3')).toBe(false);
  });

  it('reads so‘m with spaces into tiyin', () => {
    expect(parseSomInput('10 000')).toBe(1_000_000);
    expect(parseSomInput('250000')).toBe(25_000_000);
    for (const bad of ['', '0', '-5', '1,5']) expect(() => parseSomInput(bad)).toThrow();
  });
});
