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
import { TradeProposalMessageCard } from './trade-proposal-message-card';
import type { ChatResponse, MessageResponse } from '@/lib/marketplace-types';

const mockChat: ChatResponse = {
  id: 'chat-1',
  listingId: 'listing-1',
  sellerId: 'user-seller',
  buyerId: 'user-buyer',
  important: false,
  messageCount: 5,
  createdAt: '2026-08-20T10:00:00Z',
};

describe('TradeProposalMessageCard', () => {
  it('renders interactive trade proposal card for pending proposal', () => {
    const proposalMessage: MessageResponse = {
      id: 'msg-1',
      chatId: 'chat-1',
      senderId: 'user-seller',
      content: '230000',
      messageType: 'TRADE_PROPOSAL',
      proposalId: 'p-1',
      proposalOutcome: 'PENDING',
      createdAt: '2026-08-20T10:05:00Z',
    };

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
            amountUzs: 230000,
            listingId: 'listing-1',
            expiresAt: '2026-08-20T12:00:00Z',
          },
        },
        createElement(TradeProposalMessageCard, {
          message: proposalMessage,
          viewerId: 'user-buyer',
        }),
      ),
    );

    expect(html).toContain('SAVDO TAKLIFI');
    expect(html).toContain('230');
    expect(html).toContain('Qabul qilish');
    expect(html).toContain('Batafsil');
  });

  it('renders accepted state badge when outcome is ACCEPTED', () => {
    const proposalMessage: MessageResponse = {
      id: 'msg-2',
      chatId: 'chat-1',
      senderId: 'user-seller',
      content: '230000',
      messageType: 'TRADE_PROPOSAL',
      proposalId: 'p-1',
      proposalOutcome: 'ACCEPTED',
      createdAt: '2026-08-20T10:05:00Z',
    };

    const html = renderToStaticMarkup(
      createElement(
        TradeProvider,
        {
          chat: mockChat,
          viewerId: 'user-buyer',
          listing: null,
          initialPendingProposal: null,
        },
        createElement(TradeProposalMessageCard, {
          message: proposalMessage,
          viewerId: 'user-buyer',
        }),
      ),
    );

    expect(html).toContain('SAVDO TAKLIFI');
    expect(html).toContain('Qabul qilingan');
  });
});
