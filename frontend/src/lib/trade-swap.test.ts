import { describe, expect, it } from 'vitest';

import {
  allowedKinds,
  counterpartStatus,
  isWaitingForCounterpart,
  needsAmount,
  stepOf,
} from './trade-swap';
import type { TradeResponse, TradeSideProgress } from './trade-types';

const side = (over: Partial<TradeSideProgress> = {}): TradeSideProgress => ({
  role: 'SELLER',
  emailChanged: false,
  konamiVerified: false,
  passwordSent: false,
  confirmed: false,
  rejected: false,
  lastStepAt: null,
  ...over,
});

const swap = (sides: TradeSideProgress[]): TradeResponse =>
  ({ kind: 'SWAP', sides } as unknown as TradeResponse);

describe('allowedKinds', () => {
  it('offers only a sale when the seller did not opt into swaps', () => {
    expect(allowedKinds('NONE')).toEqual(['SALE']);
    expect(allowedKinds(null)).toEqual(['SALE']);
  });

  it('refuses to offer a sale on an exchange-only listing', () => {
    // The seller's own published term; the server refuses it too.
    expect(allowedKinds('EXCHANGE_ONLY')).toEqual(['SWAP']);
  });

  it('offers all three when the listing says both', () => {
    expect(allowedKinds('BOTH')).toEqual(['SALE', 'SWAP', 'SWAP_SURCHARGE']);
  });

  it('offers a surcharge swap but not a plain one when that is the term', () => {
    expect(allowedKinds('EXCHANGE_WITH_SURCHARGE')).toEqual(['SALE', 'SWAP_SURCHARGE']);
  });
});

describe('needsAmount', () => {
  it('asks for money on everything but a plain swap', () => {
    expect(needsAmount('SALE')).toBe(true);
    expect(needsAmount('SWAP_SURCHARGE')).toBe(true);
    expect(needsAmount('SWAP')).toBe(false);
  });
});

describe('stepOf', () => {
  it('walks forward as each stage completes', () => {
    expect(stepOf(side())).toBe('email');
    expect(stepOf(side({ emailChanged: true }))).toBe('konami');
    expect(stepOf(side({ emailChanged: true, konamiVerified: true }))).toBe('password');
    expect(stepOf(side({ emailChanged: true, konamiVerified: true, passwordSent: true })))
      .toBe('decision');
  });

  it('is done once the party has decided, either way', () => {
    expect(stepOf(side({ confirmed: true }))).toBe('done');
    expect(stepOf(side({ rejected: true }))).toBe('done');
  });
});

describe('counterpartStatus', () => {
  it('tells the seller where the buyer is', () => {
    const trade = swap([
      side({ role: 'SELLER', emailChanged: true }),
      side({ role: 'BUYER' }),
    ]);
    expect(counterpartStatus(trade, 'SELLER')).toContain('Email');
  });

  it('says so plainly when the other party has refused', () => {
    const trade = swap([side({ role: 'SELLER' }), side({ role: 'BUYER', rejected: true })]);
    expect(counterpartStatus(trade, 'SELLER')).toContain('rad etdi');
  });

  it('says nothing on a sale', () => {
    // A sale has no second side doing these steps, so a status line would be
    // noise on a screen that already works.
    const sale = { kind: 'SALE', sides: [] } as unknown as TradeResponse;
    expect(counterpartStatus(sale, 'SELLER')).toBeNull();
  });

  it('says nothing when the backend predates sides', () => {
    const old = { kind: 'SWAP' } as unknown as TradeResponse;
    expect(counterpartStatus(old, 'SELLER')).toBeNull();
  });
});

describe('isWaitingForCounterpart', () => {
  it('is true for the party who finished first', () => {
    // The case the whole feature exists for: a seller who has done their half
    // and would otherwise see a screen that looks stuck.
    const trade = swap([
      side({ role: 'SELLER', emailChanged: true }),
      side({ role: 'BUYER' }),
    ]);
    expect(isWaitingForCounterpart(trade, 'SELLER')).toBe(true);
    expect(isWaitingForCounterpart(trade, 'BUYER')).toBe(false);
  });

  it('is false when both are level', () => {
    const trade = swap([
      side({ role: 'SELLER', emailChanged: true }),
      side({ role: 'BUYER', emailChanged: true }),
    ]);
    expect(isWaitingForCounterpart(trade, 'SELLER')).toBe(false);
  });
});
