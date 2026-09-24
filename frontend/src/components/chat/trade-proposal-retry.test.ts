import { socketFixture } from '@/test/chat-socket-fixture';
// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TradeProvider, useTradeContext } from './trade-context';
import { TradePanel } from './trade-panel';
import { TradeProposalMessageCard } from './trade-proposal-message-card';
import type { ChatResponse, ListingResponse, MessageResponse } from '@/lib/marketplace-types';
import type { AccountRequest } from '@/lib/account-request';
import type { PendingProposalResponse, TradeResponse } from '@/lib/trade-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/payment-client', () => ({ getPublicTradeCommissionConfig: async () => null }));
const chat = { id: 'chat', sellerId: 'seller', buyerId: 'buyer' } as ChatResponse;
const listing = { id: 'listing', sellerId: 'seller', description: 'Mobile account', price: 25000,
  attributes: { platform: 'MOBILE' }, mediaMessageIds: [] } as unknown as ListingResponse;
let message: MessageResponse;
let request: AccountRequest;
let pending: PendingProposalResponse | null;
let trades: TradeResponse[];
let state: ReturnType<typeof useTradeContext>;
let root: Root;
let container: HTMLDivElement;
function Probe() { state = useTradeContext(); return null; }
const retryButton = (scope: ParentNode = document) => Array.from(scope.querySelectorAll('button'))
  .find(button => button.textContent?.includes('Qayta taklif yuborish'));
async function mount(viewerId = 'seller') {
  await act(async () => root.render(createElement(TradeProvider, { chat, listing, viewerId },
    createElement(Fragment, null, createElement(Probe), createElement(TradeProposalMessageCard, { message, viewerId }), createElement(TradePanel)))));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  message = { id: 'message', chatId: 'chat', senderId: 'seller', content: '25000', proposalId: 'expired',
    proposalKind: 'SALE', proposalListingId: 'listing', proposalOutcome: 'EXPIRED',
    createdAt: '2026-09-23T10:00:00Z', messageType: 'TRADE_PROPOSAL' };
  request = { id: 'request', chatId: 'chat', requesterId: 'buyer', listingId: 'listing', status: 'OPEN', createdAt: '', listing: null };
  pending = null; trades = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes('/proposals?')) return pending ? Response.json(pending) : new Response(null, { status: 404 });
    if (path.includes('/account-request')) return Response.json(request);
    return Response.json(trades);
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['message', 'details'])('opens a new proposal from the expired %s without sending automatically', async surface => {
  trades = [{ id: 'previous-trade', state: 'SUCCESS', sellerId: 'seller', buyerId: 'buyer', createdAt: '' } as TradeResponse];
  await mount();
  if (surface === 'details') await act(async () => state.openProposal(message));
  const scope = surface === 'details' ? document.querySelector('[role="dialog"]')! : container;
  expect(retryButton(scope)).toBeDefined();
  vi.mocked(fetch).mockClear();
  await act(async () => retryButton(scope)!.click());
  expect(state.startingNew).toBe(true);
  expect(state.viewedProposal).toBeNull();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelector('#trade-price')).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Muddati tugagan');
});

it('allows retry when the matching pending snapshot has expired before the next poll', async () => {
  pending = { proposalId: 'expired', sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller',
    amountUzs: 25000, marketplaceChatId: 'chat', listingId: 'listing', expiresAt: '2026-01-01T00:00:00Z' };
  message.proposalOutcome = 'PENDING';
  await mount();
  await act(async () => retryButton()!.click());
  expect(state.proposal).toBeNull();
  expect(document.querySelector('#trade-price')).not.toBeNull();
});

it('does not offer the recipient a resend action', async () => {
  await mount('buyer');
  expect(retryButton()).toBeUndefined();
});

it.each(['UNKNOWN', 'ACCEPTED', 'REJECTED', 'different-listing', 'reversed-roles', 'active-trade', 'new-proposal'])(
  'does not restart an expired offer in the %s case', async scenario => {
    if (scenario === 'UNKNOWN') message.proposalOutcome = null;
    if (scenario === 'ACCEPTED' || scenario === 'REJECTED') message.proposalOutcome = scenario;
    if (scenario === 'different-listing') message.proposalListingId = 'older-listing';
    if (scenario === 'reversed-roles') request.requesterId = 'seller';
    if (scenario === 'active-trade') trades = [{ id: 'active', state: 'WAITING_PASSWORD', createdAt: '' } as TradeResponse];
    if (scenario === 'new-proposal') pending = { proposalId: 'new', sellerId: 'seller', buyerId: 'buyer',
      proposerUserId: 'seller', amountUzs: 25000, marketplaceChatId: 'chat', listingId: 'listing', expiresAt: '' };
    await mount();
    expect(retryButton()).toBeUndefined();
  },
);

vi.mock('@/lib/chat-socket', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chat-socket')>(),
  getChatSocket: () => socketFixture,
  closeOtherChatSockets: () => {},
}));
