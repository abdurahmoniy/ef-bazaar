/**
 * Which account a chat is currently about, and therefore who is buying.
 *
 * A chat is a conversation between two people, not a thread about one listing.
 * Before a trade can start, one of them picks an account from the other's
 * active listings — that pick decides the roles, so the same pair can trade
 * repeatedly, in either direction, without opening a second chat.
 */

import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export type AccountRequestStatus = 'OPEN' | 'FULFILLED' | 'CANCELLED';

export interface ChatListingOption {
  id: string;
  description: string;
  price: number;
  priceNegotiable: boolean;
  coverMessageId: string | null;
  exchangeMode?: string | null;
  attributes?: Record<string, any>;
}

export interface AccountRequest {
  id: string;
  chatId: string;
  /** The buyer. The other participant is the seller. */
  requesterId: string;
  listingId: string;
  status: AccountRequestStatus;
  createdAt: string;
  /** Null when the listing was deleted after the request was opened. */
  listing: ChatListingOption | null;
}

/**
 * The viewer's role for the trade this request will open.
 *
 * Derived here and nowhere else. Reading it off `chat.sellerId` is what used to
 * strand people on the wrong panel: those columns record who opened the chat,
 * not who is selling this time.
 */
export function roleInRequest(
  request: AccountRequest | null,
  viewerId: string,
): 'BUYER' | 'SELLER' | null {
  if (!request) return null;
  return request.requesterId === viewerId ? 'BUYER' : 'SELLER';
}

const json = { Accept: 'application/json' };

export async function fetchAccountRequest(chatId: string): Promise<AccountRequest | null> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'account-request']),
    { credentials: 'include', headers: json },
  );
  if (!response.ok) return null;
  try {
    // The endpoint answers with a null body when nothing is being negotiated.
    return ((await response.json()) as AccountRequest | null) ?? null;
  } catch {
    return null;
  }
}

export async function fetchPartnerListings(chatId: string): Promise<ChatListingOption[]> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'partner-listings']),
    { credentials: 'include', headers: json },
  );
  if (!response.ok) return [];
  return (await response.json()) as ChatListingOption[];
}

export async function openAccountRequest(
  chatId: string,
  listingId: string,
): Promise<{ ok: true; data: AccountRequest } | { ok: false; error: string }> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'account-request']),
    {
      method: 'POST',
      credentials: 'include',
      headers: { ...json, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId }),
    },
  );
  if (!response.ok) {
    return { ok: false, error: await readError(response) };
  }
  return { ok: true, data: (await response.json()) as AccountRequest };
}

export async function cancelAccountRequest(chatId: string): Promise<boolean> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'chats', chatId, 'account-request']),
    { method: 'DELETE', credentials: 'include', headers: json },
  );
  return response.ok;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // fall through
  }
  return 'Akkount so’rovini ochib bo’lmadi';
}
