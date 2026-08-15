import { describe, expect, it } from 'vitest';

import { roleInRequest, type AccountRequest } from './account-request';

const request = (requesterId: string): AccountRequest => ({
  id: 'r1',
  chatId: 'c1',
  requesterId,
  listingId: 'l1',
  status: 'OPEN',
  createdAt: '2026-08-15T00:00:00Z',
  listing: null,
});

/**
 * Roles come from the account request, never from the chat.
 *
 * `chats.buyer_id` / `seller_id` record who opened the conversation about which
 * listing. Once the same pair trades again — possibly the other way round —
 * those columns describe history, not the trade in hand. Deriving the panel
 * from them showed people the counterparty's screen.
 */
describe('roleInRequest', () => {
  it('makes the requester the buyer', () => {
    expect(roleInRequest(request('alice'), 'alice')).toBe('BUYER');
  });

  it('makes the other participant the seller', () => {
    expect(roleInRequest(request('alice'), 'bob')).toBe('SELLER');
  });

  it('lets the roles swap on the next request in the same chat', () => {
    // Alice bought from Bob; now Bob is buying from Alice in that same chat.
    expect(roleInRequest(request('bob'), 'bob')).toBe('BUYER');
    expect(roleInRequest(request('bob'), 'alice')).toBe('SELLER');
  });

  it('has no answer when nothing has been picked yet', () => {
    expect(roleInRequest(null, 'alice')).toBeNull();
  });
});
