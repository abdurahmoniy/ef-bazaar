import { describe, expect, it } from 'vitest';

import { emailBadges, freeCustomMailboxes } from './account-email-badges';
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
