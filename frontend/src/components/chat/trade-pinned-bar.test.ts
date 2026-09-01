import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { TradeProvider } from './trade-context';
import { TradePinnedBar } from './trade-pinned-bar';
import type { ChatResponse } from '@/lib/marketplace-types';

const mockChat: ChatResponse = {
  id: 'chat-1',
  listingId: 'listing-1',
  sellerId: 'user-seller',
  buyerId: 'user-buyer',
  important: false,
  messageCount: 5,
  createdAt: '2026-08-20T10:00:00Z',
};

describe('TradePinnedBar', () => {
  it('renders pending proposal in pinned bar when proposal exists', () => {
    const html = renderToStaticMarkup(
      createElement(
        TradeProvider,
        {
          chat: mockChat,
          viewerId: 'user-buyer',
          listing: null,
          initialPendingProposal: {
            proposalId: 'p-1',
            marketplaceChatId: 'chat-1',
            sellerId: 'user-seller',
            buyerId: 'user-buyer',
            proposerUserId: 'user-seller',
            amountUzs: 500000,
            listingId: 'listing-1',
            expiresAt: '2026-08-20T12:00:00Z',
          },
        },
        createElement(TradePinnedBar),
      ),
    );

    expect(html).toContain('Savdo taklifi');
    expect(html).toContain('500');
    expect(html).toContain('Qabul qilish');
    expect(html).toContain('Batafsil');
  });

  it('renders nothing when no trade or proposal yet on initial load', () => {
    const html = renderToStaticMarkup(
      createElement(
        TradeProvider,
        {
          chat: mockChat,
          viewerId: 'user-buyer',
          listing: null,
          initialPendingProposal: null,
        },
        createElement(TradePinnedBar),
      ),
    );

    expect(html).toBeDefined();
  });
});
