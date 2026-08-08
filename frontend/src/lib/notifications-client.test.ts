import { describe, expect, it } from 'vitest';

import { notificationHref } from './notifications-client';
import type { NotificationResponse } from './marketplace-types';

describe('notification client helpers', () => {
  it('deep-links trade-admin invitations by trade id before chat id', () => {
    const notification = {
      id: 'n1',
      type: 'TRADE_ADMIN_INVITED',
      tradeId: 'trade-123',
      chatId: 'chat-123',
      listingId: 'listing-123',
      createdAt: '2026-08-08T00:00:00Z',
    } satisfies NotificationResponse;

    expect(notificationHref(notification)).toBe('/trade-admin?tradeId=trade-123');
  });

  it('keeps existing chat and listing fallbacks', () => {
    expect(
      notificationHref({
        id: 'n2',
        type: 'CHAT_MESSAGE',
        chatId: 'chat-1',
        createdAt: '2026-08-08T00:00:00Z',
      }),
    ).toBe('/chats/chat-1');

    expect(
      notificationHref({
        id: 'n3',
        type: 'CHAT_CREATED',
        listingId: 'listing-1',
        createdAt: '2026-08-08T00:00:00Z',
      }),
    ).toBe('/marketplace/listing-1');
  });
});
