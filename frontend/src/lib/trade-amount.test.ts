import { expect, it } from 'vitest';
import { tradeAmountError } from './trade-amount';
import { DEFAULT_TRADE_COMMISSION_CONFIG as defaults } from './trade-commission';

it('requires at least 5000 for money-changing trades', () => {
  for (const kind of ['SALE', 'SWAP_SURCHARGE'] as const) {
    expect(tradeAmountError(kind, '4999', 'HUMAN')).toContain('5 000');
    expect(tradeAmountError(kind, '5000', 'HUMAN')).toBeNull();
  }
});
it('requires positive Smart-admin sale proceeds', () => {
  expect(tradeAmountError('SALE', '5000')).toContain('Smart-admin');
  expect(tradeAmountError('SALE', '5001')).toBeNull();
});
it('uses the correct commission band and configurable floor', () => {
  const config = { ...defaults, lowMinSom: 15000, highMinSom: 110000 };
  expect(tradeAmountError('SALE', '15000', 'SMART', config)).not.toBeNull();
  expect(tradeAmountError('SALE', '15001', 'SMART', config)).toBeNull();
  expect(tradeAmountError('SALE', '100000', 'SMART', config)).not.toBeNull();
  expect(tradeAmountError('SALE', '110001', 'SMART', config)).toBeNull();
});
it('rejects a commission rate that takes the entire sale', () => {
  expect(tradeAmountError('SALE', '25000', 'SMART', { ...defaults, lowRatePercent: 100 })).not.toBeNull();
  expect(tradeAmountError('SALE', '25000', 'SMART', { ...defaults, lowRatePercent: 99.99 })).not.toBeNull();
});
it('allows the 5000 minimum when the configured fee is smaller', () => {
  expect(tradeAmountError('SALE', '5000', 'SMART', { ...defaults, lowMinSom: 1000 })).toBeNull();
});
it('keeps exchange fee handling separate from sale proceeds', () => {
  expect(tradeAmountError('SWAP', '')).toBeNull();
  expect(tradeAmountError('SWAP_SURCHARGE', '5000')).toBeNull();
});
