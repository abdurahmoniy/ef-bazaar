import { describe, expect, it } from 'vitest';

import { isInsufficientFunds, shortfallSom, topUpHref } from './wallet-shortfall';

describe('shortfallSom', () => {
  it('asks for exactly the missing amount', () => {
    // 50 000 so'm account, 10 000 so'm in the wallet → top up 40 000.
    expect(shortfallSom(50_000, 1_000_000)).toBe(40_000);
  });

  it('is zero when the wallet already covers it', () => {
    expect(shortfallSom(50_000, 5_000_000)).toBe(0);
  });

  it('is zero on an exact balance', () => {
    // Boundary: the accept succeeds here, so there must be no redirect.
    expect(shortfallSom(50_000, 5_000_000)).toBe(0);
  });

  it('rounds up a part-so‘m remainder', () => {
    // Topping up 39 999 so'm would leave the accept one tiyin short and fail
    // again, which reads as the button being broken.
    expect(shortfallSom(50_000, 1_000_001)).toBe(40_000);
    expect(shortfallSom(50_000, 999_901)).toBe(40_001);
  });

  it('asks for the whole price when the wallet is empty', () => {
    expect(shortfallSom(50_000, 0)).toBe(50_000);
  });
});

describe('topUpHref', () => {
  it('lands on the wallet with the amount prefilled', () => {
    expect(topUpHref(40_000)).toBe('/hamyon?toldirish=40000');
  });
});

describe('isInsufficientFunds', () => {
  it('recognises the wallet message', () => {
    expect(isInsufficientFunds("Hamyonda mablag' yetarli emas")).toBe(true);
  });

  it('recognises it with a typographic apostrophe', () => {
    expect(isInsufficientFunds('Hamyonda mablag‘ yetarli emas')).toBe(true);
  });

  it('leaves other 409s alone', () => {
    // Same status code, entirely different fix — sending these to the top-up
    // page would be worse than showing the message.
    expect(isInsufficientFunds('Savdo summasi juda kichik')).toBe(false);
    expect(isInsufficientFunds("Sizda ochiq so'rov bor")).toBe(false);
  });
});
