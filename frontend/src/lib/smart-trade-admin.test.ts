import { describe, expect, it } from 'vitest';

import {
  actionSides,
  isValidCode,
  isValidLoginCode,
  pickMailboxSide,
  sideDone,
  sidesWithMailbox,
  sinceLabel,
  stepIndex,
} from './smart-trade-admin';
import type { SmartTradeDetail, SmartTradeSide } from './smart-trade-admin-types';

function side(overrides: Partial<SmartTradeSide>): SmartTradeSide {
  return {
    role: 'SELLER',
    mailboxId: null,
    mailboxEmail: null,
    mailboxProvisioned: false,
    emailChangeCode: null,
    emailChangeCodeAt: null,
    emailChangedAt: null,
    konamiVerifiedAt: null,
    loginCode: null,
    loginCodeAt: null,
    ...overrides,
  };
}

function detail(sides: SmartTradeSide[]): SmartTradeDetail {
  return {
    trade: {
      id: 't1',
      kind: 'SALE',
      state: 'WAITING_EMAIL_CHANGE',
      sellerId: 's',
      buyerId: 'b',
      sellerName: '@seller',
      buyerName: '@buyer',
      stateSince: '2026-09-14T10:00:00Z',
      stateDeadline: null,
      expectedAction: 'EMAIL_CHANGE_CODE',
      createdAt: '2026-09-14T09:00:00Z',
    },
    sides,
  };
}

const sale = detail([
  side({ role: 'SELLER', mailboxId: 'm1', mailboxEmail: 'a@efbazaar.uz', mailboxProvisioned: true }),
  side({ role: 'BUYER' }),
]);

const swap = detail([
  side({ role: 'SELLER', mailboxId: 'm1' }),
  side({ role: 'BUYER', mailboxId: 'm2' }),
]);

describe('actionSides', () => {
  it('kirish kodini sotuvda XARIDORGA taklif qiladi', () => {
    // Sotuvda quti bitta va u sotuvchida; kod esa akkountga kirayotgan
    // xaridorga kerak. Ilgari ro'yxat "qutisi bor tomonlar" edi, ya'ni
    // faqat sotuvchi chiqar va backend uni rad etardi.
    expect(actionSides(sale, 'LOGIN_CODE').map((s) => s.role)).toEqual(['BUYER']);
  });

  it('obmenda ikkala tomon ham kirish kodini oladi', () => {
    expect(actionSides(swap, 'LOGIN_CODE').map((s) => s.role)).toEqual(['SELLER', 'BUYER']);
  });

  it('qolgan qadamlarda qutisi bor tomonlar qoladi', () => {
    expect(actionSides(sale, 'EMAIL_CHANGE_CODE').map((s) => s.role)).toEqual(['SELLER']);
    expect(actionSides(sale, 'KONAMI_EMAIL_CONFIRM').map((s) => s.role)).toEqual(['SELLER']);
  });

  it('quti umuman yo\'q bo\'lsa hech kimni taklif qilmaydi', () => {
    const fresh = detail([side({ role: 'SELLER' }), side({ role: 'BUYER' })]);
    expect(actionSides(fresh, 'LOGIN_CODE')).toEqual([]);
  });
});

describe('pickMailboxSide', () => {
  it('opens the only mailbox a sale has', () => {
    expect(pickMailboxSide(sale, undefined)?.role).toBe('SELLER');
  });

  it('falls back to the seller when a stale link asks for the buyer on a sale', () => {
    expect(pickMailboxSide(sale, 'BUYER')?.role).toBe('SELLER');
  });

  it('opens the requested side of a swap', () => {
    expect(pickMailboxSide(swap, 'BUYER')?.role).toBe('BUYER');
  });

  it('ignores a value that is not a role', () => {
    expect(pickMailboxSide(swap, 'nonsense')?.role).toBe('SELLER');
  });

  it('has nothing to open before any mailbox exists', () => {
    expect(pickMailboxSide(detail([side({}), side({ role: 'BUYER' })]), 'SELLER')).toBeNull();
  });
});

describe('sidesWithMailbox', () => {
  it('offers a switch only when both parties have a box', () => {
    expect(sidesWithMailbox(sale)).toHaveLength(1);
    expect(sidesWithMailbox(swap)).toHaveLength(2);
  });
});

describe('sideDone', () => {
  it('reads the field that matches the step', () => {
    const coded = side({ emailChangeCode: '563280' });
    expect(sideDone(coded, 'EMAIL_CHANGE_CODE')).toBe(true);
    expect(sideDone(coded, 'KONAMI_EMAIL_CONFIRM')).toBe(false);
    expect(sideDone(side({ konamiVerifiedAt: '2026-09-14T10:00:00Z' }), 'KONAMI_EMAIL_CONFIRM')).toBe(true);
    expect(sideDone(coded, 'NONE')).toBe(false);
  });
});

describe('stepIndex', () => {
  it('places happy-path states and leaves failures off the chain', () => {
    expect(stepIndex('INITIATED')).toBe(0);
    expect(stepIndex('VERIFYING_KONAMI_LINK')).toBe(3);
    expect(stepIndex('REJECTED')).toBe(-1);
  });
});

describe('sinceLabel', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  it('scales from minutes to days', () => {
    expect(sinceLabel('2026-09-14T11:48:00Z', now)).toBe('12 daq');
    expect(sinceLabel('2026-09-14T09:00:00Z', now)).toBe('3 soat');
    expect(sinceLabel('2026-09-12T11:00:00Z', now)).toBe('2 kun');
  });

  it('never shows a negative duration for a clock slightly ahead', () => {
    expect(sinceLabel('2026-09-14T12:01:00Z', now)).toBe('0 daq');
  });
});

describe('isValidCode', () => {
  it('accepts exactly six digits', () => {
    expect(isValidCode('563280')).toBe(true);
    expect(isValidCode(' 563280 ')).toBe(true);
    expect(isValidCode('56328')).toBe(false);
    expect(isValidCode('56328a')).toBe(false);
  });
});

describe('login code', () => {
  it('counts the step done once a code reached this side', () => {
    expect(sideDone(side({ loginCode: '447711' }), 'LOGIN_CODE')).toBe(true);
    expect(sideDone(side({}), 'LOGIN_CODE')).toBe(false);
  });

  it('accepts the lengths Konami actually sends', () => {
    // Kirish kodi har doim ham 6 xonali emas — email almashtirish kodidan farqi shu.
    expect(isValidLoginCode('4477')).toBe(true);
    expect(isValidLoginCode('44771122')).toBe(true);
    expect(isValidLoginCode('447')).toBe(false);
    expect(isValidLoginCode('447711a')).toBe(false);
    expect(isValidCode('4477')).toBe(false);
  });
});
