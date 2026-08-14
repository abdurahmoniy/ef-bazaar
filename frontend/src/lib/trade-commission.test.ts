import { describe, expect, it } from 'vitest';

import { MIN_TRADE_PRICE_SOM, sellerProceedsSom, tradeFeeSom } from './trade-commission';

/**
 * These numbers are duplicated from payment-service's TradeCommissionTest on
 * purpose. If one side changes the table, one of the two suites goes red — and
 * a silent disagreement about a fee is exactly what this file exists to catch.
 */
describe('tradeFeeSom', () => {
  it('takes ten percent below the band', () => {
    expect(tradeFeeSom(90_000)).toBe(9_000);
  });

  it('takes seven and a half percent at and above the band', () => {
    expect(tradeFeeSom(500_000)).toBe(37_500);
    expect(tradeFeeSom(2_000_000)).toBe(150_000);
  });

  it('applies the 5 000 floor to small trades', () => {
    expect(tradeFeeSom(20_000)).toBe(5_000);
  });

  it('applies the 10 000 floor just above the band', () => {
    expect(tradeFeeSom(100_000)).toBe(10_000);
    expect(tradeFeeSom(200_000)).toBe(15_000);
  });

  it('does not jump across the band boundary', () => {
    // 9 999 just below, 10 000 at it — the lower rate and the higher floor
    // cross there, so a seller has nothing to gain by pricing around it.
    expect(Math.abs(tradeFeeSom(100_000) - tradeFeeSom(99_999))).toBeLessThan(100);
  });

  it('never exceeds the price', () => {
    expect(tradeFeeSom(3_000)).toBe(3_000);
    expect(sellerProceedsSom(3_000)).toBe(0);
  });

  it('splits the price exactly', () => {
    for (const price of [5_000, 20_000, 99_999, 100_000, 133_334, 500_000, 10_000_000]) {
      expect(tradeFeeSom(price) + sellerProceedsSom(price)).toBe(price);
    }
  });

  it('rounds in the seller favour', () => {
    // 7.5% of 1 000 001 is 75 000.075; the fraction stays with the seller.
    expect(tradeFeeSom(1_000_001)).toBe(75_000);
  });

  it('treats a missing or nonsense price as zero rather than throwing', () => {
    expect(tradeFeeSom(0)).toBe(0);
    expect(tradeFeeSom(-1)).toBe(0);
    expect(tradeFeeSom(Number.NaN)).toBe(0);
    expect(sellerProceedsSom(Number.NaN)).toBe(0);
  });

  it('exposes the price below which a trade cannot be opened', () => {
    expect(MIN_TRADE_PRICE_SOM).toBe(5_000);
  });
});
