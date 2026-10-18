import 'server-only';

import { apiFetch } from './api';
import type { CustomMailbox } from './custom-mailbox';

/** The caller's custom boxes; null when trade-service could not be reached. */
export async function getMyCustomMailboxesSSR(): Promise<CustomMailbox[] | null> {
  try {
    return await apiFetch<CustomMailbox[]>('/trade/v1/mailboxes/custom');
  } catch {
    return null;
  }
}

export type OwnedMailboxSSR = { id: string; email: string; kind: 'RANDOM' | 'CUSTOM'; activeSessionId?: string | null };

/**
 * Every box the caller owns, with the live session of custom ones merged in.
 * Null when trade-service could not be reached.
 */
export async function getMyOwnedMailboxesSSR(): Promise<OwnedMailboxSSR[] | null> {
  try {
    const [owned, custom] = await Promise.all([
      apiFetch<OwnedMailboxSSR[]>('/trade/v1/mailboxes'),
      apiFetch<CustomMailbox[]>('/trade/v1/mailboxes/custom'),
    ]);
    const live = new Map(custom.map((c) => [c.id, c.activeSessionId]));
    return owned.map((o) => ({ ...o, activeSessionId: live.get(o.id) ?? null }));
  } catch {
    return null;
  }
}

/** Every box the caller owns (custom and trade), for the free-box banner; null on failure. */
export async function getMyMailboxesSSR(): Promise<import('./mailbox-slots').OwnedMailbox[] | null> {
  try {
    return await apiFetch<import('./mailbox-slots').OwnedMailbox[]>('/trade/v1/mailboxes');
  } catch {
    return null;
  }
}
