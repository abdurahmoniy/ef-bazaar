import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  accountEmailSet,
  cleanupCandidates,
  isAttachedTo,
  isDeletable,
  slotPressure,
  slotWarning,
  sortForCleanup,
  type MailboxSlotStatus,
  type OwnedMailbox,
} from './mailbox-slots';

describe('slotWarning', () => {
  const full: MailboxSlotStatus = { used: 3, limit: 3, totalUsed: 3, totalLimit: 3, customUsed: 0, customLimit: 0, full: true, plan: 'STANDARD', lockedCount: 0 };

  it('names the numbers, not just "no room"', () => {
    // "Joy qolmadi" does not tell anyone what to do. The counts say how
    // many inboxes have to go before a trade can start again.
    const warning = slotWarning(full);
    expect(warning).toContain('3');
    expect(warning).toContain('ko‘rib chiqing');
  });

  it('puts capacity before allocated count, including over-limit accounts', () => {
    expect(slotWarning({ used: 7, limit: 3, totalUsed: 7, totalLimit: 3, customUsed: 0, customLimit: 0, full: true, plan: 'STANDARD', lockedCount: 0 })).toContain('3 tadan 7 ta');
  });

  it('says nothing while there is room — the banner must not become wallpaper', () => {
    expect(slotWarning({ used: 1, limit: 3, totalUsed: 1, totalLimit: 3, customUsed: 0, customLimit: 0, full: false, plan: 'STANDARD', lockedCount: 0 })).toBeNull();
  });

  it('says nothing on an unlimited plan', () => {
    // MAX carries no ceiling, so `full` can never be meaningful there.
    expect(slotWarning({ used: 40, limit: null, totalUsed: 40, totalLimit: null, customUsed: 0, customLimit: 0, full: false, plan: 'MAX', lockedCount: 0 })).toBeNull();
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
    locked: false,
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
    expect(slotPressure({ used: 2, limit: 3, totalUsed: 2, totalLimit: 3, customUsed: 0, customLimit: 0, full: false, plan: 'STANDARD', lockedCount: 0 })).toBe('near');
    expect(slotPressure({ used: 3, limit: 3, totalUsed: 3, totalLimit: 3, customUsed: 0, customLimit: 0, full: true, plan: 'STANDARD', lockedCount: 0 })).toBe('full');
  });

  it('kattaroq rejada arafa ham kengroq', () => {
    // 10 slotli rejada bitta bo'sh joy qolgandagina aytish kech: odam
    // bir necha savdoni parallel yuritadi. Chegara — 20%, eng kami 1.
    expect(slotPressure({ used: 7, limit: 10, totalUsed: 7, totalLimit: 10, customUsed: 0, customLimit: 0, full: false, plan: 'PRO', lockedCount: 0 })).toBe('none');
    expect(slotPressure({ used: 8, limit: 10, totalUsed: 8, totalLimit: 10, customUsed: 0, customLimit: 0, full: false, plan: 'PRO', lockedCount: 0 })).toBe('near');
  });

  it('joy yetarli bo‘lsa jim — banner devor qog‘ozi bo‘lib qolmasin', () => {
    expect(slotPressure({ used: 1, limit: 3, totalUsed: 1, totalLimit: 3, customUsed: 0, customLimit: 0, full: false, plan: 'STANDARD', lockedCount: 0 })).toBe('none');
  });

  it('cheksiz rejada va status o‘qilmaganda jim', () => {
    expect(slotPressure({ used: 40, limit: null, totalUsed: 40, totalLimit: null, customUsed: 0, customLimit: 0, full: false, plan: 'MAX', lockedCount: 0 })).toBe('none');
    expect(slotPressure(null)).toBe('none');
  });
});

describe('slotWarning — arafa', () => {
  it('nechta joy qolganini aytadi', () => {
    const warning = slotWarning({ used: 2, limit: 3, totalUsed: 2, totalLimit: 3, customUsed: 0, customLimit: 0, full: false, plan: 'STANDARD', lockedCount: 0 });
    expect(warning).toContain('1 ta');
    expect(warning).toContain('3');
  });
});

describe('bo‘sh qutilar', () => {
  const box = (id: string, email: string, tradeId: string | null = null): OwnedMailbox => ({
    id, email, tradeId, createdAt: '2026-09-01T00:00:00Z', handedOffAt: null, locked: false,
  });

  it('akkountga bog‘langan qutini bo‘sh deb hisoblamaydi', () => {
    const emails = accountEmailSet([{ email: 'A@efbazaar.uz' }, { email: null }]);
    // Manzil registrga sezgir emas: Mailcow ham, akkount ham bir xil
    // qutini turli registrda saqlab qolishi mumkin.
    expect(isAttachedTo(box('m1', 'a@efbazaar.uz'), emails)).toBe(true);
    expect(isAttachedTo(box('m2', 'b@efbazaar.uz'), emails)).toBe(false);
  });

  it('o‘chirishga tayyorlarini tepaga chiqaradi', () => {
    // Bog'lanmagan va savdoda band bo'lmagan quti — o'chirish xavfsiz
    // bo'lgan yagona tur. Odam ro'yxatni aylanib chiqmasin.
    const emails = accountEmailSet([{ email: 'a@efbazaar.uz' }]);
    const sorted = sortForCleanup(
      [box('m1', 'a@efbazaar.uz'), box('m2', 'b@efbazaar.uz'), box('m3', 'c@efbazaar.uz', 't1')],
      emails,
    );
    expect(sorted.map((m) => m.id)).toEqual(['m2', 'm1', 'm3']);
  });
});

describe('custom mailboxes in the cleanup list', () => {
  const base = { tradeId: null, createdAt: '', handedOffAt: null, locked: false };
  it('remain visible for access swaps but cannot be detached', () => {
    const boxes: OwnedMailbox[] = [
      { ...base, id: 'c', email: 'alibek1@efbazaar.uz', kind: 'CUSTOM' },
      { ...base, id: 'r', email: 'trade-1@efbazaar.uz', kind: 'RANDOM' },
    ];
    expect(isDeletable(boxes[0])).toBe(false);
    expect(cleanupCandidates(boxes).map((b) => b.id)).toEqual(['c', 'r']);
  });
});

 it('counts custom inboxes inside the authoritative total and shows their subset', () => {
   const status = { used: 8, limit: 10, totalUsed: 10, totalLimit: 10, customUsed: 2, customLimit: 2, full: true, plan: 'PRO', lockedCount: 0 };
   expect(slotWarning(status)).toContain('10 tadan 10 ta');
   expect(slotWarning(status)).toContain('shundan custom: 2 / 2');
 });

 it('shows gift and resource allocations without adding gifts to the quota', async () => {
   const { slotUsageSummary } = await import('./mailbox-slots');
   expect(slotUsageSummary({ used: 3, limit: 3, totalUsed: 3, totalLimit: 3, customUsed: 1, customLimit: 0, exemptUsed: 2, resourceUsed: 5, plan: 'STANDARD', full: true, lockedCount: 1 })).toContain('Limitdan tashqari qutilar: 2 · Resursda: 5');
 });

 describe('slot contract rollout', () => {
   afterEach(() => vi.unstubAllGlobals());
   it('does not display legacy random-only responses as unified totals', async () => {
     const { fetchSlotStatus } = await import('./mailbox-slots');
     vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ used: 5, limit: 5, full: true, plan: 'PRO', lockedCount: 0 }))));
     expect(await fetchSlotStatus()).toBeNull();
   });
   it.each([{ customUsed: undefined }, { totalLimit: undefined }, { totalLimit: -1 }, { customLimit: '2' }])('rejects incomplete or malformed unified capacity %j', async (invalid) => {
     const { fetchSlotStatus } = await import('./mailbox-slots');
     const status = { used: 10, limit: 10, totalUsed: 10, totalLimit: 10, customUsed: 2, customLimit: 2, full: true, plan: 'PRO', lockedCount: 0, ...invalid };
     vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(status))));
     expect(await fetchSlotStatus()).toBeNull();
   });
   it('accepts explicitly unlimited counters', async () => {
     const { fetchSlotStatus } = await import('./mailbox-slots');
     const status = { used: 10, limit: null, totalUsed: 10, totalLimit: null, customUsed: 2, customLimit: null, full: false, plan: 'STAFF', lockedCount: 0 };
     vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(status))));
     expect(await fetchSlotStatus()).toEqual(status);
   });
 });
