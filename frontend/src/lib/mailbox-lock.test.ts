import { describe, expect, it } from 'vitest';
import { showUpgrade, swapCandidates } from './mailbox-lock';
import type { OwnedMailbox } from './mailbox-slots';

const box = (id: string, locked: boolean, tradeId: string | null = null): OwnedMailbox => ({
  id, email: `${id}@efbazaar.uz`, tradeId, createdAt: '2026-01-01T00:00:00Z', handedOffAt: null, locked,
});

describe('mailbox lock', () => {
  it('offers only open mailboxes, and greys out one in a live trade', () => {
    const out = swapCandidates([box('a', true), box('b', false), box('c', false, 't1')]);
    expect(out).toEqual([
      { id: 'b', email: 'b@efbazaar.uz', disabledReason: null },
      { id: 'c', email: 'c@efbazaar.uz', disabledReason: 'Davom etayotgan savdoda' },
    ]);
  });

  it('does not upsell the top plan', () => {
    expect(showUpgrade('STANDARD')).toBe(true);
    expect(showUpgrade('PRO')).toBe(false);
    expect(showUpgrade('MAX')).toBe(false);
    expect(showUpgrade('STAFF')).toBe(false);
  });
});

describe('mailboxIdFromSearch', () => {
  it('reads ?mailbox=', async () => {
    const { mailboxIdFromSearch } = await import('./mailbox-lock');
    expect(mailboxIdFromSearch('?tab=account&mailbox=abc')).toBe('abc');
    expect(mailboxIdFromSearch('?tab=account')).toBeNull();
    expect(mailboxIdFromSearch('')).toBeNull();
  });
});

 it('lets finished trade boxes swap while protecting gifts and active trades across kinds', () => {
   expect(swapCandidates([
     { ...box('custom', false, 'historic'), kind: 'CUSTOM', activeTrade: false, slotExempt: false },
     { ...box('gift', false), slotExempt: true, activeTrade: false },
     { ...box('live', false), activeTrade: true, slotExempt: false },
   ])).toEqual([
     { id: 'custom', email: 'custom@efbazaar.uz', disabledReason: null },
     { id: 'gift', email: 'gift@efbazaar.uz', disabledReason: 'Umumiy limitdan tashqarida' },
     { id: 'live', email: 'live@efbazaar.uz', disabledReason: 'Davom etayotgan savdoda' },
   ]);
 });

it('does not sacrifice a recovery box when legacy locked is false', () => {
  expect(swapCandidates([{ ...box('recovery', false), accessState: 'RECOVERY' } as OwnedMailbox])).toEqual([]);
});
