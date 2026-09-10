// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { TradeProposalMessageCard } from './trade-proposal-message-card';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TradePanel } from './trade-panel';
import { TradePinnedBar } from './trade-pinned-bar';
import { useTradeContext } from './trade-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('./trade-context', () => ({ useTradeContext: vi.fn() }));

type Context = ReturnType<typeof useTradeContext>;
let context: Context;
beforeEach(() => {
  context = {
    chat: { id: 'chat-1' }, viewerId: 'seller', otherPartyId: 'buyer',
    listing: { id: 'original', mediaMessageIds: [], attributes: { platform: 'MOBILE' } },
    accountRequest: {
      listingId: 'selected', requesterId: 'buyer',
      listing: { id: 'selected', description: 'Steam account', price: 250000, attributes: { platform: 'STEAM' } },
    },
    trades: [], activeTrade: null, lastFinished: null, proposal: null,
    role: 'SELLER', isSeller: true, requiresAdminHandoff: true,
    showPicker: false, showProposeModal: false, isDrawerOpen: false,
    commissionConfig: null,
  } as unknown as Context;
  vi.mocked(useTradeContext).mockImplementation(() => context);
});

const render = () => renderToStaticMarkup(createElement(TradePanel));

describe('trade platform handoff', () => {
  it('opens the admin handoff from a pending proposal message', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    context.isSeller = false;
    context.setIsDrawerOpen = vi.fn();
    context.setShowAcceptModal = vi.fn();
    context.proposal = { id: 'proposal', listingId: 'selected', priceUzs: 250000, expiresAt: '' };
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TradeProposalMessageCard, {
        viewerId: 'buyer', message: {
          id: 'message', chatId: 'chat-1', senderId: 'seller', content: '250000',
          messageType: 'TRADE_PROPOSAL', proposalId: 'proposal', createdAt: '',
        },
      })));
      const button = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Adminga murojaat'))!;
      await act(async () => button.click());
      expect(context.setIsDrawerOpen).toHaveBeenCalledWith(true);
      expect(context.setShowAcceptModal).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it.each(['STEAM', 'PLAYSTATION'])('routes %s to support using the selected listing', (platform) => {
    context.accountRequest!.listing!.attributes!.platform = platform;
    const html = render();
    expect(html).toContain('Kelishdik — adminga murojaat');
    expect(html).toContain('/support?');
    expect(html).toContain('selected');
    expect(html).not.toContain('Taklif yuborish');
    expect(html).not.toContain('100% Kafolatlangan');
    expect(renderToStaticMarkup(createElement(TradePinnedBar))).toContain('Adminga murojaat');
  });

  it('gives the buyer the same handoff after negotiation', () => {
    context.isSeller = false;
    context.role = 'BUYER';
    expect(render()).toContain('Kelishdik — adminga murojaat');
  });

  it('retains the mobile proposal form', () => {
    context.accountRequest!.listing!.attributes!.platform = 'MOBILE';
    context.requiresAdminHandoff = false;
    context.showProposeModal = true;
    const html = render();
    expect(html).toContain('trade-price');
    expect(html).toContain('Taklif yuborish');
    expect(html).not.toContain('Kelishdik — adminga murojaat');
  });

  it('replaces a previously opened Smart modal when the selected account changes', () => {
    context.showProposeModal = true;
    expect(render()).not.toContain('trade-price');
  });

  it('routes old non-mobile proposals to admins without rendering acceptance controls', () => {
    context.proposal = { id: 'proposal', listingId: 'selected', priceUzs: 250000, expiresAt: '', mode: 'SMART' };
    context.showAcceptModal = true;
    context.isSeller = false;
    const html = render();
    expect(html).toContain('Kelishdik — adminga murojaat');
    expect(html).not.toContain('Tasdiqlash');
    expect(html).not.toContain('hamyoningizdan yechilib');
  });

  it('does not infer mobile from a different original listing when the selected account is deleted', () => {
    context.accountRequest!.listing = null;
    expect(render()).toContain('Platformasi aniqlanmagan');
    expect(render()).not.toContain('trade-price');
  });
});
