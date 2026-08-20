import { describe, expect, it } from 'vitest';

import {
  isInsufficientFunds,
  proposerShortfallSom,
  shortfallSom,
  topUpHref,
} from './wallet-shortfall';

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

  it('carries where to go once the invoice is paid', () => {
    expect(topUpHref(40_000, '/chats/abc'))
      .toBe('/hamyon?toldirish=40000&keyin=%2Fchats%2Fabc');
  });

  it('refuses to carry somewhere off-site', () => {
    // The value ends up in a redirect, so an absolute or protocol-relative
    // URL would be an open redirect out of the wallet page.
    expect(topUpHref(40_000, 'https://evil.example')).toBe('/hamyon?toldirish=40000');
    expect(topUpHref(40_000, '//evil.example')).toBe('/hamyon?toldirish=40000');
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

/**
 * The proposer's side of a swap.
 *
 * They pay the platform's fee, and a surcharge from the accepter offsets it.
 * Checked before the proposal goes out: at accept time the refusal lands on
 * the other party, over a balance they can neither see nor top up.
 */
describe('proposerShortfallSom', () => {
  it('asks for the fee when there is no surcharge', () => {
    // 37 500 fee, empty wallet.
    expect(proposerShortfallSom(37_500, 0, 0)).toBe(37_500);
  });

  it('counts what is already in the wallet', () => {
    expect(proposerShortfallSom(37_500, 0, 1_000_000)).toBe(27_500);
  });

  it('lets the surcharge cover the fee', () => {
    // 50 000 coming in against a 37 500 fee: nothing to fund.
    expect(proposerShortfallSom(37_500, 50_000, 0)).toBe(0);
  });

  it('asks only for the part the surcharge leaves', () => {
    expect(proposerShortfallSom(37_500, 10_000, 0)).toBe(27_500);
  });

  it('is zero when the wallet already covers it', () => {
    expect(proposerShortfallSom(37_500, 0, 5_000_000)).toBe(0);
  });
});

