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
