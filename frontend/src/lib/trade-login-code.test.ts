import { describe, expect, it } from 'vitest';

import { isConfirmLocked, loginCodeOf, receivingMailboxEmail } from './trade-login-code';
import type { TradeResponse } from './trade-types';

const trade = (over: Partial<TradeResponse>) => over as TradeResponse;

describe('login code step', () => {
  it('unlocks confirmation as soon as the code is in hand', () => {
    // Backend kod kelganda confirmUnlocksAt ni umuman yubormaydi.
    expect(isConfirmLocked(trade({ confirmUnlocksAt: null }))).toBe(false);
    expect(loginCodeOf(trade({ loginVerificationCode: '447711' }))).toBe('447711');
  });

  it('keeps confirmation shut while the grace window runs', () => {
    const now = Date.parse('2026-09-19T10:00:00Z');
    expect(isConfirmLocked(trade({ confirmUnlocksAt: '2026-09-19T10:05:00Z' }), now)).toBe(true);
  });

  it('opens confirmation once the window passes — some accounts never ask for a code', () => {
    const now = Date.parse('2026-09-19T10:06:00Z');
    expect(isConfirmLocked(trade({ confirmUnlocksAt: '2026-09-19T10:05:00Z' }), now)).toBe(false);
  });

  it('never locks on a value it cannot read', () => {
    // Eski backend yoki buzuq sana tugmani abadiy yopib qo'ymasligi kerak.
    expect(isConfirmLocked(trade({ confirmUnlocksAt: 'kecha' }))).toBe(false);
    expect(isConfirmLocked(trade({}))).toBe(false);
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
