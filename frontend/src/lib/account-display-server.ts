import 'server-only';

import { apiFetch } from './api';
import { getListing } from './marketplace-server';
import type { AccountDisplayData, UserAccountResponse } from './accounts-types';
import type { OwnedMailbox } from './mailbox-slots';

/** Optional services must not prevent the owner from managing their accounts. */
export async function getAccountDisplayData(
  accounts: UserAccountResponse[],
  viewerId: string,
): Promise<Record<string, AccountDisplayData>> {
  if (!accounts.length) return {};
  const [mailboxes, listings] = await Promise.all([
    accounts.some((account) => account.email)
      ? apiFetch<OwnedMailbox[]>('/trade/v1/mailboxes').catch(() => [])
      : Promise.resolve([]),
    Promise.all(accounts.map(async (account) => {
      if (!account.onMarket || !account.currentListingId) return null;
      const result = await getListing(account.currentListingId);
      return result.ok && result.data.sellerId === viewerId ? result.data : null;
    })),
  ]);
  const mailboxByEmail = new Map(mailboxes.map((mailbox) => [mailbox.email.trim().toLowerCase(), mailbox.id]));
  return Object.fromEntries(accounts.map((account, index) => {
    const display: AccountDisplayData = {};
    const mailboxId = account.email ? mailboxByEmail.get(account.email.trim().toLowerCase()) : undefined;
    if (mailboxId) display.mailboxHref = `/mail/${encodeURIComponent(mailboxId)}`;
    if (listings[index]) display.price = listings[index].price;
    return [account.id, display];
  }));
}
