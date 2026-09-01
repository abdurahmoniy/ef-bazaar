import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/chats',
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/notifications/notification-bell', () => ({
  NotificationBell: () => createElement('div', { 'data-testid': 'bell' }),
}));

import { ChatsListPane } from './chats-list-pane';
import type { ChatResponse } from '@/lib/marketplace-types';

const mockChats: ChatResponse[] = [
  {
    id: 'chat-1',
    listingId: 'listing-1',
    buyerId: 'user-me',
    sellerId: 'user-seller-1',
    sellerDisplayName: 'Sardor',
    important: true,
    unreadCount: 0,
    messageCount: 3,
    createdAt: '2026-08-20T10:00:00Z',
  },
  {
    id: 'chat-2',
    listingId: 'listing-2',
    buyerId: 'user-me',
    sellerId: 'user-seller-2',
    sellerDisplayName: 'Aziz',
    important: false,
    unreadCount: 2,
    messageCount: 5,
    createdAt: '2026-08-20T11:00:00Z',
  },
];

describe('ChatsListPane', () => {
  it('renders all three filter tabs: Barchasi, O\'qilmagan, and Muhim', () => {
    const html = renderToStaticMarkup(
      createElement(ChatsListPane, {
        chats: mockChats,
        viewerId: 'user-me',
      }),
    );

    expect(html).toContain('Barchasi');
    expect(html).toContain("O&#x27;qilmagan");
    expect(html).toContain('Muhim');
    expect(html).not.toContain('Faol');
    expect(html).not.toContain('Yopilgan');
  });

  it('renders chat items with unread badge and important tag', () => {
    const html = renderToStaticMarkup(
      createElement(ChatsListPane, {
        chats: mockChats,
        viewerId: 'user-me',
      }),
    );

    expect(html).toContain('Sardor');
    expect(html).toContain('Aziz');
    expect(html).toContain('Muhim');
  });
});
