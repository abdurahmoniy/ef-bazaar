import { afterEach, describe, expect, it } from 'vitest';

import { notificationHref, notificationLabel } from './notifications-client';
import { siteConfig } from './site';
import { FEATURES } from './feature-flags';
import type { NotificationResponse } from './marketplace-types';

describe('notification client helpers', () => {
  const initialHumanAdmin = FEATURES.humanAdmin;
  afterEach(() => Object.assign(FEATURES, { humanAdmin: initialHumanAdmin }));

  it('sends an approved partner to the panel, not back to the application', () => {
    // The panel is where the posting price lives and it starts at zero —
    // a partner who never opens it gives their channel away for free.
    expect(notificationHref({
      id: 'n-approved',
      type: 'PARTNER_APPROVED',
      createdAt: '2026-09-04T00:00:00Z',
    } satisfies NotificationResponse)).toBe('/partner');
  });

  it('sends a rejected or ended partnership to the application page', () => {
    // The panel is shut for both, and the application page is what
    // carries the decision and its reason.
    for (const type of ['PARTNER_REJECTED', 'PARTNER_CANCELLED'] as const) {
      expect(notificationHref({
        id: 'n-' + type,
        type,
        createdAt: '2026-09-04T00:00:00Z',
      } satisfies NotificationResponse)).toBe('/partnership');
    }
  });

  it('labels every partner decision — silence was the bug being fixed', () => {
    // Before this, an applicant learned their fate only by revisiting
    // the page themselves. An unlabelled type falls through to the
    // actor name, which for these is empty.
    for (const type of ['PARTNER_APPROVED', 'PARTNER_REJECTED', 'PARTNER_CANCELLED'] as const) {
      const label = notificationLabel({
        id: 'n-' + type,
        type,
        createdAt: '2026-09-04T00:00:00Z',
      } satisfies NotificationResponse);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe('Foydalanuvchi');
    }
  });

  it('deep-links trade-admin invitations by trade id before chat id', () => {
    Object.assign(FEATURES, { humanAdmin: true });
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

  it('keeps old admin invitations out of the disabled workspace', () => {
    Object.assign(FEATURES, { humanAdmin: false });
    expect(notificationHref({
      id: 'invitation', type: 'TRADE_ADMIN_INVITED',
      tradeId: 'trade-123', chatId: 'chat-123', createdAt: '',
    })).toBe('/chats/chat-123');
  });

  it.each([
    'TRADE_PROPOSAL_CREATED', 'TRADE_STARTED', 'TRADE_EMAIL_CHANGED',
    'TRADE_PASSWORD_SENT', 'TRADE_SUCCESS', 'TRADE_REJECTED', 'TRADE_ORPHANED',
  ] as const)('opens the participant chat for %s even with a trade id', (type) => {
    for (const humanAdmin of [false, true]) {
      Object.assign(FEATURES, { humanAdmin });
      expect(notificationHref({
        id: 'trade-event', type, tradeId: 'trade-123',
        chatId: 'chat/123', listingId: 'listing-123', createdAt: '',
      })).toBe('/chats/chat%2F123');
    }
  });

  it('falls back to the listing or chats for trade events missing a chat id', () => {
    const notification = {
      id: 'old-trade-event', type: 'TRADE_REJECTED',
      tradeId: 'trade-123', createdAt: '',
    } satisfies NotificationResponse;
    expect(notificationHref({ ...notification, listingId: 'listing-123' }))
      .toBe('/marketplace/listing-123');
    expect(notificationHref(notification)).toBe('/chats');
    expect(notificationHref({ ...notification, tradeId: null })).toBeNull();
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

  it('sends a freed custom box to the claim page with an offer to relink', () => {
    const freed = { id: 'n6', type: 'CUSTOM_MAILBOX_FREED', createdAt: '2026-10-16T00:00:00Z' } satisfies NotificationResponse;

    expect(notificationHref(freed)).toBe('/mailboxes/custom');
    expect(notificationLabel(freed)).toBe('Custom emailingiz bo‘shadi — boshqa akkountingizga ulang');
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

  it('formats labels and href for trade action notifications', () => {
    const n = {
      id: 'n6',
      type: 'TRADE_PROPOSAL_CREATED',
      chatId: 'chat-456',
      tradeId: 'trade-456',
      createdAt: '2026-08-26T00:00:00Z',
    } satisfies NotificationResponse;

    expect(notificationLabel(n)).toBe('Sizga yangi savdo taklifi yuborildi');
    expect(notificationHref(n)).toBe('/chats/chat-456');

    const chatNotification = {
      id: 'n7',
      type: 'TRADE_PROPOSAL_CREATED',
      chatId: 'chat-456',
      createdAt: '2026-08-26T00:00:00Z',
    } satisfies NotificationResponse;

    expect(notificationHref(chatNotification)).toBe('/chats/chat-456');
  });
  /**
   * Silence was the bug: money arrived and the user only found out by opening
   * the wallet and looking.
   */
  it('says how much reached the wallet', () => {
    expect(notificationLabel({
      id: 'n-credited',
      type: 'WALLET_CREDITED',
      amountTiyin: 5_000_000,
      createdAt: '2026-09-11T00:00:00Z',
    } satisfies NotificationResponse)).toBe('Hamyoningiz 50\u00A0000 so\u2018mga to\u2018ldirildi');
  });

  /**
   * A row written before the amount column existed, or by a producer that
   * omitted it. Still worth showing — a vaguer sentence beats a blank row.
   */
  it('still says something when the amount is missing', () => {
    expect(notificationLabel({
      id: 'n-credited-bare',
      type: 'WALLET_CREDITED',
      createdAt: '2026-09-11T00:00:00Z',
    } satisfies NotificationResponse)).toBe('Hamyoningiz to\u2018ldirildi');
  });

  it('sends a credited wallet to the wallet', () => {
    expect(notificationHref({
      id: 'n-credited',
      type: 'WALLET_CREDITED',
      amountTiyin: 100,
      createdAt: '2026-09-11T00:00:00Z',
    } satisfies NotificationResponse)).toBe('/hamyon');
  });
});
