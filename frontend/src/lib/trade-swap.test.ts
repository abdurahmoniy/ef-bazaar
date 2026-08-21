import { describe, expect, it } from 'vitest';

import {
  allowedKinds,
  counterpartStatus,
  hasClearedCurrentStep,
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

const swapAt = (state: string, sides: TradeSideProgress[]): TradeResponse =>
  ({ kind: 'SWAP', state, sides } as unknown as TradeResponse);

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

/**
 * Whether there is anything left for this party to do in the current state.
 *
 * Reported from testing: the party changed their email, entered the Konami
 * code, pressed "email o'zgartirdim" — and the screen did not change. It could
 * not: a swap waits for both parties, so the state stayed put and the panel
 * re-rendered the same code and the same button, with nothing to say the click
 * had registered.
 */
describe('hasClearedCurrentStep', () => {
  const seller = (over = {}) => side({ role: 'SELLER', ...over });
  const buyer = (over = {}) => side({ role: 'BUYER', ...over });

  it('is true once this party has changed their email', () => {
    const trade = swapAt('WAITING_EMAIL_CHANGE', [
      seller({ emailChanged: true }),
      buyer(),
    ]);
    expect(hasClearedCurrentStep(trade, 'SELLER')).toBe(true);
  });

  it('is false for the party who still has to do it', () => {
    const trade = swapAt('WAITING_EMAIL_CHANGE', [
      seller({ emailChanged: true }),
      buyer(),
    ]);
    expect(hasClearedCurrentStep(trade, 'BUYER')).toBe(false);
  });

  it('follows the state, not the furthest step reached', () => {
    // Email is behind them; the trade is now asking for the password, which
    // this party has not sent — so the controls must stay up.
    const trade = swapAt('WAITING_PASSWORD', [
      seller({ emailChanged: true, konamiVerified: true }),
      buyer({ emailChanged: true, konamiVerified: true }),
    ]);
    expect(hasClearedCurrentStep(trade, 'SELLER')).toBe(false);
  });

  it('counts a rejection as an answer given', () => {
    const trade = swapAt('WAITING_BUYER_VERIFY', [
      seller({ rejected: true }),
      buyer(),
    ]);
    expect(hasClearedCurrentStep(trade, 'SELLER')).toBe(true);
  });

  it('never hides a sale\'s controls', () => {
    // A sale advances on the seller alone, so there is no waiting to describe
    // and the panel must keep working exactly as it did.
    const sale = {
      kind: 'SALE',
      state: 'WAITING_EMAIL_CHANGE',
      sides: [seller({ emailChanged: true })],
    } as unknown as TradeResponse;
    expect(hasClearedCurrentStep(sale, 'SELLER')).toBe(false);
  });

  it('is false in a state that asks nobody for anything', () => {
    const trade = swapAt('WAITING_PAYMENT', [seller({ emailChanged: true }), buyer()]);
    expect(hasClearedCurrentStep(trade, 'SELLER')).toBe(false);
  });
});
