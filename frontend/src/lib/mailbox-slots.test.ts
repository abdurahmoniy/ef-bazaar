import { describe, expect, it } from 'vitest';

import {
  isDeletable,
  slotPressure,
  slotWarning,
  type MailboxSlotStatus,
  type OwnedMailbox,
} from './mailbox-slots';

describe('slotWarning', () => {
  const full: MailboxSlotStatus = { used: 3, limit: 3, full: true, plan: 'STANDARD' };

  it('names the numbers, not just "no room"', () => {
    // "Joy qolmadi" does not tell anyone what to do. The counts say how
    // many inboxes have to go before a trade can start again.
    const warning = slotWarning(full);
    expect(warning).toContain('3');
    expect(warning).toContain('ko‘rib chiqing');
  });

  it('puts capacity before allocated count, including over-limit accounts', () => {
    expect(slotWarning({ used: 7, limit: 3, full: true, plan: 'STANDARD' })).toContain('3 tadan 7 ta');
  });

  it('says nothing while there is room — the banner must not become wallpaper', () => {
    expect(slotWarning({ used: 1, limit: 3, full: false, plan: 'STANDARD' })).toBeNull();
  });

  it('says nothing on an unlimited plan', () => {
    // MAX carries no ceiling, so `full` can never be meaningful there.
    expect(slotWarning({ used: 40, limit: null, full: false, plan: 'MAX' })).toBeNull();
  });

  it('says nothing when the status could not be read', () => {
    // The profile page must render even when trade-service is down.
    expect(slotWarning(null)).toBeNull();
  });
});

describe('isDeletable', () => {
  const mailbox = (tradeId: string | null): OwnedMailbox => ({
    id: 'm1',
    email: 'a@efbazaar.uz',
    tradeId,
    createdAt: '2026-09-01T00:00:00Z',
    handedOffAt: null,
  });

  it('offers no button for an inbox a live trade is using', () => {
    // The server refuses it with a 409. Showing a button that is
    // guaranteed to fail teaches people to distrust the screen.
    expect(isDeletable(mailbox('t1'))).toBe(false);
  });

  it('offers the button once the trade has let go', () => {
    expect(isDeletable(mailbox(null))).toBe(true);
  });
});

describe('slotPressure', () => {
  it('to‘lish arafasida ogohlantiradi — to‘lgandan keyin emas', () => {
    // Slot to'lganda savdo allaqachon rad etiladi. Ogohlantirish undan
    // OLDIN kelishi kerak, aks holda u xabar emas, xulosa bo'lib qoladi.
    expect(slotPressure({ used: 2, limit: 3, full: false, plan: 'STANDARD' })).toBe('near');
    expect(slotPressure({ used: 3, limit: 3, full: true, plan: 'STANDARD' })).toBe('full');
  });

  it('kattaroq rejada arafa ham kengroq', () => {
    // 10 slotli rejada bitta bo'sh joy qolgandagina aytish kech: odam
    // bir necha savdoni parallel yuritadi. Chegara — 20%, eng kami 1.
    expect(slotPressure({ used: 7, limit: 10, full: false, plan: 'PRO' })).toBe('none');
    expect(slotPressure({ used: 8, limit: 10, full: false, plan: 'PRO' })).toBe('near');
  });

  it('joy yetarli bo‘lsa jim — banner devor qog‘ozi bo‘lib qolmasin', () => {
    expect(slotPressure({ used: 1, limit: 3, full: false, plan: 'STANDARD' })).toBe('none');
  });

  it('cheksiz rejada va status o‘qilmaganda jim', () => {
    expect(slotPressure({ used: 40, limit: null, full: false, plan: 'MAX' })).toBe('none');
    expect(slotPressure(null)).toBe('none');
  });
});

describe('slotWarning — arafa', () => {
  it('nechta joy qolganini aytadi', () => {
    const warning = slotWarning({ used: 2, limit: 3, full: false, plan: 'STANDARD' });
    expect(warning).toContain('1 ta');
    expect(warning).toContain('3');
  });
});
