import type { OwnedMailbox } from './mailbox-slots';

export interface SwapCandidate {
  id: string;
  email: string;
  disabledReason: string | null;
}

/**
 * Open mailboxes that could be locked in exchange for unlocking another.
 *
 * <p>A mailbox that has a trade is greyed out. `tradeId` is the trade the box
 * was created for and may be finished, so this is only a UX hint: the backend
 * re-checks the swap (`invalid_unlock_swap`) and its message is shown on error.
 */
export function swapCandidates(boxes: OwnedMailbox[]): SwapCandidate[] {
  return boxes
    .filter((b) => !b.locked)
    .map((b) => ({
      id: b.id,
      email: b.email,
      disabledReason: b.tradeId ? 'Davom etayotgan savdoda' : null,
    }));
}

/** The top plan has nowhere to go: offer detaching instead. */
export function showUpgrade(plan: string): boolean {
  return plan !== 'MAX';
}

/** `?mailbox=<id>` from the webmail's "locked" page; null when absent. */
export function mailboxIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get('mailbox') || null;
}
