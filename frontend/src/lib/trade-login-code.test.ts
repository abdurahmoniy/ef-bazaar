import { describe, expect, it } from 'vitest';

import { loginCodeOf, receivingMailboxEmail } from './trade-login-code';
import type { TradeResponse } from './trade-types';

const trade = (over: Partial<TradeResponse>) => over as TradeResponse;

describe('login code step', () => {
  it('reads the delivered code', () => {
    expect(loginCodeOf(trade({ loginVerificationCode: '447711' }))).toBe('447711');
  });

  it('treats a blank code as no code', () => {
    expect(loginCodeOf(trade({ loginVerificationCode: '   ' }))).toBeNull();
    expect(loginCodeOf(trade({}))).toBeNull();
  });
});

describe('which mailbox is checked', () => {
  it('hands a swap party the box of the account they are RECEIVING', () => {
    // O'z qutisi — o'z akkountini o'tkazgan joyi; unga kirish hech narsani
    // isbotlamaydi. Foydalanuvchi aynan shu teskari tartibni kutadi.
    expect(receivingMailboxEmail(trade({
      mailboxEmail: 'trade-mine@efbazaar.uz',
      counterpartMailboxEmail: 'trade-theirs@efbazaar.uz',
    }))).toBe('trade-theirs@efbazaar.uz');
  });

  it('falls back to the single box a sale has', () => {
    expect(receivingMailboxEmail(trade({
      mailboxEmail: 'trade-sale@efbazaar.uz',
      counterpartMailboxEmail: null,
    }))).toBe('trade-sale@efbazaar.uz');
  });

  it('returns an empty string when nothing is known yet', () => {
    expect(receivingMailboxEmail(trade({}))).toBe('');
  });
});
