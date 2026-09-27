import { describe, expect, it } from 'vitest';
import { feePayerLabel, proposalHoldTiyin, splitAdminFee } from './trade-fee';

describe('swap fee terms', () => {
  it('uses authoritative wallet holds, including odd tiyin, by participant', () => {
    const p = { sellerId: 's', buyerId: 'b', priceUzs: 5000, buyerHoldTiyin: 750001, sellerHoldTiyin: 0 };
    expect(proposalHoldTiyin(p, 'b')).toBe(750001);
    expect(proposalHoldTiyin(p, 's')).toBe(0);
    expect(proposalHoldTiyin(p, 'outsider')).toBe(0);
  });
  it('retains legacy sale funding when quotes are absent', () => {
    expect(proposalHoldTiyin({ sellerId: 's', buyerId: 'b', priceUzs: 5000 }, 'b')).toBe(500000);
  });
  it('describes the payer relative to the viewer', () => {
    expect(feePayerLabel('SELLER', 's', 's')).toBe('Siz');
    expect(feePayerLabel('BUYER', 's', 's')).toBe('Sherigingiz');
    expect(feePayerLabel('SPLIT', 's', 'b')).toBe('Teng bo‘linadi');
  });
  it('splits every tiyin exactly once with the odd tiyin on the buyer side', () => {
    expect(splitAdminFee(500001, 'SPLIT')).toEqual({ seller: 250000, buyer: 250001 });
    expect(splitAdminFee(500001, 'SELLER')).toEqual({ seller: 500001, buyer: 0 });
    expect(splitAdminFee(500001, 'BUYER')).toEqual({ seller: 0, buyer: 500001 });
  });
});
