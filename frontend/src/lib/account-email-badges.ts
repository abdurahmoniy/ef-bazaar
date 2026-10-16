import type { AccountDisplayData, UserAccountResponse } from './accounts-types';
import type { CustomMailbox } from './custom-mailbox';

const OUR_DOMAINS = /@(efbazaar\.uz|efootball\.uz)$/i;

export type EmailBadges = {
  /** The platform proved the Konami account is on this address. */
  verified: boolean;
  /** Verified on a box the user named — the gold border. */
  custom: boolean;
  /** Our address, the user's own box, not yet proven: "Tasdiqlash". */
  verifyHref: string | null;
  /** No address at all: offer a custom one. */
  offerHref: string | null;
};

/** What the account card shows next to the email. */
export function emailBadges(account: UserAccountResponse, display?: AccountDisplayData): EmailBadges {
  const verified = Boolean(account.email) && account.emailVerified;
  const ownBox = display?.verifyMailboxId;
  const canVerify = !verified && Boolean(account.email && OUR_DOMAINS.test(account.email)) && Boolean(ownBox);
  return {
    verified,
    custom: verified && account.emailSource === 'CUSTOM',
    verifyHref: canVerify
      ? `/mailboxes/custom/${encodeURIComponent(ownBox!)}/link?verify=1&accountId=${encodeURIComponent(account.id)}`
      : null,
    offerHref: !account.email && account.status === 'ACTIVE'
      ? `/mailboxes/custom?accountId=${encodeURIComponent(account.id)}`
      : null,
  };
}

/** Custom boxes sitting empty — ready, open, linked to nothing and not being linked. */
export function freeCustomMailboxes(boxes: CustomMailbox[]): CustomMailbox[] {
  return boxes.filter((b) => b.provisioned && !b.locked && !b.linkedAccountId && !b.activeSessionId);
}
