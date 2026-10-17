import { describe, expect, it } from 'vitest';

import { emailBadges, freeCustomMailboxes, freeMailboxes } from './account-email-badges';
import type { OwnedMailbox } from './mailbox-slots';
import type { UserAccountResponse } from './accounts-types';
import type { CustomMailbox } from './custom-mailbox';

const account = (over: Partial<UserAccountResponse> = {}): UserAccountResponse => ({
  id: 'acc-1', title: 'A', description: '', attributes: {}, mediaMessageIds: [],
  email: null, emailSource: null, emailVerified: false, status: 'ACTIVE', onMarket: false,
  currentListingId: null, createdAt: '', updatedAt: '', ...over,
});

describe('emailBadges', () => {
  it('marks a verified custom address with both badges', () => {
    const b = emailBadges(account({ email: 'alibek1@efbazaar.uz', emailSource: 'CUSTOM', emailVerified: true }));
    expect(b).toMatchObject({ verified: true, custom: true, verifyHref: null, offerHref: null });
  });

  it('a trade address is verified but not custom', () => {
    const b = emailBadges(account({ email: 'trade-1@efbazaar.uz', emailSource: 'PLATFORM', emailVerified: true }));
    expect(b).toMatchObject({ verified: true, custom: false });
  });

  it('offers verification only when the box is the user’s own', () => {
    const typed = account({ email: 'sardor10@efootball.uz', emailSource: 'MANUAL' });
    expect(emailBadges(typed, { verifyMailboxId: 'box-9' }).verifyHref)
      .toBe('/mailboxes/custom/box-9/link?verify=1&accountId=acc-1');
    expect(emailBadges(typed).verifyHref).toBeNull();
  });

  it('never offers to verify an outside address', () => {
    expect(emailBadges(account({ email: 'me@gmail.com', emailSource: 'MANUAL' }), { verifyMailboxId: 'box-9' }).verifyHref).toBeNull();
  });

  it('offers a custom address to an account without email', () => {
    expect(emailBadges(account()).offerHref).toBe('/mailboxes/custom?accountId=acc-1');
  });

  it('offers nothing on a sold account', () => {
    expect(emailBadges(account({ status: 'ARCHIVED' })).offerHref).toBeNull();
  });

  it('a verified flag without an email is not a badge', () => {
    expect(emailBadges(account({ emailVerified: true })).verified).toBe(false);
  });
});

describe('freeCustomMailboxes', () => {
  const box = (over: Partial<CustomMailbox>): CustomMailbox => ({
    id: 'b', email: 'x@efbazaar.uz', provisioned: true, locked: false, linkedAccountId: null,
    activeSessionId: null, createdAt: '', ...over,
  });
  it('keeps ready, unlocked, unlinked boxes with no session running', () => {
    const boxes = [
      box({ id: 'free' }),
      box({ id: 'linked', linkedAccountId: 'a' }),
      box({ id: 'locked', locked: true }),
      box({ id: 'pending', provisioned: false }),
      box({ id: 'linking', activeSessionId: 's' }),
    ];
    expect(freeCustomMailboxes(boxes).map((b) => b.id)).toEqual(['free']);
  });
});

describe('freeMailboxes', () => {
  const box = (over: Partial<OwnedMailbox>): OwnedMailbox => ({
    id: 'b', email: 'x@efbazaar.uz', tradeId: null, createdAt: '', handedOffAt: null, locked: false,
    kind: 'RANDOM', linkedAccountId: null, activeSessionId: null, provisionedAt: '2026-10-01T00:00:00Z', ...over,
  });

  it('offers trade boxes left behind after a sale, alongside custom ones', () => {
    const boxes = [
      box({ id: 'sold', email: 'trade-1@efbazaar.uz' }),
      box({ id: 'custom', email: 'alibek1@efbazaar.uz', kind: 'CUSTOM' }),
    ];
    expect(freeMailboxes(boxes, new Set()).map((b) => b.id)).toEqual(['custom', 'sold']);
  });

  it('skips boxes an account still uses, even when not linked in trade-service', () => {
    const boxes = [box({ id: 'used', email: 'Trade-2@efbazaar.uz' })];
    expect(freeMailboxes(boxes, new Set(['trade-2@efbazaar.uz']))).toEqual([]);
  });

  it('skips linked, locked, unprovisioned, in-trade and being-linked boxes', () => {
    const boxes = [
      box({ id: 'linked', linkedAccountId: 'a' }),
      box({ id: 'locked', locked: true }),
      box({ id: 'pending', provisionedAt: null }),
      box({ id: 'trade', tradeId: 't' }),
      box({ id: 'linking', activeSessionId: 's' }),
    ];
    expect(freeMailboxes(boxes, new Set())).toEqual([]);
  });
});
