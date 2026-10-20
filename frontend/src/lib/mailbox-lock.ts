import { mailboxAccess } from './mailbox-access';
import type { OwnedMailbox } from './mailbox-slots';

export interface SwapCandidate {
  id: string;
  email: string;
  disabledReason: string | null;
}

/**
 * Open mailboxes that could be locked in exchange for unlocking another.
 *
 * <p>Admin gifts and currently active trades cannot be sacrificed. Older
 * responses fall back to tradeId as a conservative hint. The backend
 * re-checks the swap (`invalid_unlock_swap`) and its message is shown on error.
 */
export function swapCandidates(boxes: OwnedMailbox[]): SwapCandidate[] {
  return boxes
    .filter((b) => mailboxAccess(b) === 'ACTIVE')
    .map((b) => ({
      id: b.id,
      email: b.email,
      disabledReason: b.slotExempt ? 'Umumiy limitdan tashqarida'
        : (b.activeTrade ?? !!b.tradeId) ? 'Davom etayotgan savdoda' : null,
    }));
}

/** Only Free has a higher public plan available. */
export function showUpgrade(plan: string): boolean {
  return plan === 'STANDARD';
}

/** `?mailbox=<id>` from the webmail's "locked" page; null when absent. */
export function mailboxIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get('mailbox') || null;
}
