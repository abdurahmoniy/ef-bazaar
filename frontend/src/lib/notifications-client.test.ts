import { describe, expect, it } from 'vitest';

import { notificationHref, notificationLabel } from './notifications-client';
import { siteConfig } from './site';
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

  /**
   * An escrow inbox that became somebody's.
   *
   * The trade is over, so the trade page is the wrong destination — what the
   * reader needs is the mail itself, which is where Konami's codes arrive if
   * they want to move the account on to an address of their own.
   */
  it('sends a handed-over mailbox to the webmail, not the trade', () => {
    const returned = {
      id: 'n4',
      type: 'TRADE_MAILBOX_RETURNED',
      tradeId: 'trade-9',
      createdAt: '2026-08-21T00:00:00Z',
    } satisfies NotificationResponse;

    expect(notificationHref(returned)).toBe(siteConfig.mailUrl);
    // Guards the ordering: a trade id would otherwise fall through to the
    // admin workspace, which most recipients cannot even open.
    expect(notificationHref(returned)).not.toContain('/trade-admin');
  });

  it('tells a failed trade apart from a completed one', () => {
    const base = { id: 'n5', createdAt: '2026-08-21T00:00:00Z' };

    const received = notificationLabel({
      ...base, type: 'TRADE_MAILBOX_RECEIVED',
    } satisfies NotificationResponse);
    const returned = notificationLabel({
      ...base, type: 'TRADE_MAILBOX_RETURNED',
    } satisfies NotificationResponse);

    expect(received).not.toBe(returned);
    // Reading "savdo yakunlandi" after a trade timed out would be worse than
    // saying nothing, so the two must not share wording.
    expect(returned).toContain('yakunlanmadi');
  });
});
