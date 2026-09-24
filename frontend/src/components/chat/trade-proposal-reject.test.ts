import { socketFixture } from '@/test/chat-socket-fixture';
// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TradeProvider, useTradeContext } from './trade-context';
import { TradePanel } from './trade-panel';
import { TradePinnedBar } from './trade-pinned-bar';
import { TradeProposalMessageCard } from './trade-proposal-message-card';
import type { ChatResponse, ListingResponse, MessageResponse } from '@/lib/marketplace-types';
import type { PendingProposalResponse } from '@/lib/trade-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/payment-client', () => ({ getPublicTradeCommissionConfig: async () => null }));
const chat = { id: 'chat', sellerId: 'seller', buyerId: 'buyer' } as ChatResponse;
const listing: ListingResponse = {
  id: 'listing', sellerId: 'seller', price: 25000, description: 'Account',
  attributes: { platform: 'MOBILE' }, priceNegotiable: true, mediaMessageIds: [],
  status: 'ACTIVE', forwardCount: 0, likeCount: 0, createdAt: '', updatedAt: '',
};
let pending: PendingProposalResponse | null;
let message: MessageResponse;
let state: ReturnType<typeof useTradeContext>;
let root: Root;
let container: HTMLDivElement;
let rejectStatus: number;
function Probe() { state = useTradeContext(); return null; }
const button = (text: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text);
const rejectCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/reject'));
async function mount(viewerId = 'buyer') {
  await act(async () => root.render(createElement(TradeProvider, { chat, listing, viewerId },
    createElement(Fragment, null, createElement(Probe), createElement(TradePinnedBar),
      createElement(TradeProposalMessageCard, { message, viewerId }), createElement(TradePanel)))));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  rejectStatus = 204;
  pending = { proposalId: 'proposal', sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller',
    amountUzs: 25000, marketplaceChatId: 'chat', listingId: 'listing', expiresAt: '' };
  message = { id: 'message', chatId: 'chat', senderId: 'seller', content: '25000', proposalId: 'proposal',
    proposalOutcome: 'PENDING', messageType: 'TRADE_PROPOSAL', createdAt: '2026-09-24T10:00:00Z' };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith('/reject')) {
      if (rejectStatus === 204) { pending = null; return new Response(null, { status: 204 }); }
      return Response.json({ detail: 'Taklifni rad etib bo‘lmadi' }, { status: rejectStatus });
    }
    if (path.includes('/proposals?')) return pending ? Response.json(pending) : new Response(null, { status: 404 });
    return Response.json(path.includes('/account-request') ? null : []);
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['message', 'details', 'panel', 'bar'])('rejects the exact proposal from %s only after confirmation', async surface => {
  await mount();
  if (surface === 'details') await act(async () => state.openProposal(message));
  if (surface === 'panel') await act(async () => state.setIsDrawerOpen(true));
  const scope = surface === 'details' || surface === 'panel' ? document.querySelector('[role="dialog"]')!
    : surface === 'message' ? container.querySelector('time')!.parentElement! : container;
  expect(button('Rad etish', scope)).toBeDefined();
  await act(async () => button('Rad etish', scope)!.click());
  expect(rejectCalls()).toHaveLength(0);
  await act(async () => button('Ha, rad etaman')!.click());
  expect(rejectCalls()).toHaveLength(1);
  expect(rejectCalls()[0]).toEqual(['/api/trade/v1/trades/proposals/proposal/reject', expect.objectContaining({ method: 'POST', credentials: 'include' })]);
  expect(state.proposal).toBeNull();
  expect(container.textContent).toContain('Rad etilgan');
  expect(container.textContent).not.toContain('Holati noma’lum');
  expect(button('Rad etish')).toBeUndefined();
});
it('can cancel confirmation without changing the offer', async () => {
  await mount();
  await act(async () => button('Rad etish')!.click());
  await act(async () => button('Bekor qilish')!.click());
  expect(rejectCalls()).toHaveLength(0);
  expect(state.proposal?.id).toBe('proposal');
});
it.each(['seller', 'outsider', 'buyer-sender', 'expired', 'historical', 'accepted'])('does not offer rejection for %s', async scenario => {
  if (scenario === 'buyer-sender') pending!.proposerUserId = 'buyer';
  if (scenario === 'expired') { pending!.expiresAt = '2026-01-01T00:00:00Z'; message.proposalOutcome = 'EXPIRED'; }
  if (scenario === 'historical') { pending = null; message.proposalOutcome = null; }
  if (scenario === 'accepted') { pending = null; message.proposalOutcome = 'ACCEPTED'; }
  await mount(scenario === 'seller' || scenario === 'outsider' ? scenario : 'buyer');
  expect(button('Rad etish')).toBeUndefined();
});
it('keeps the proposal and displays the server error when rejection fails', async () => {
  rejectStatus = 503;
  await mount();
  await act(async () => button('Rad etish')!.click());
  await act(async () => button('Ha, rad etaman')!.click());
  expect(state.proposal?.id).toBe('proposal');
  expect(document.body.textContent).toContain('Taklifni rad etib bo‘lmadi');
  expect(container.textContent).not.toContain('Rad etilgan');
});

it('can reject the current offer from the bar while viewing an old offer', async () => {
  await mount();
  await act(async () => state.openProposal({ ...message, id: 'old-message', proposalId: 'old', proposalOutcome: 'EXPIRED' }));
  await act(async () => button('Rad etish', container)!.click());
  await act(async () => button('Ha, rad etaman')!.click());
  expect(rejectCalls()).toHaveLength(1);
  expect(state.proposal).toBeNull();
});
it('does not apply confirmation to a replacement offer', async () => {
  await mount();
  await act(async () => button('Rad etish')!.click());
  await act(async () => state.setProposal(current => ({ ...current!, id: 'new-proposal' })));
  expect(button('Ha, rad etaman')).toBeUndefined();
  expect(rejectCalls()).toHaveLength(0);
  expect(state.proposal?.id).toBe('new-proposal');
});
it('keeps the proposal when the connection fails', async () => {
  await mount();
  vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
  await act(async () => button('Rad etish')!.click());
  await act(async () => button('Ha, rad etaman')!.click());
  expect(state.proposal?.id).toBe('proposal');
  expect(document.body.textContent).toContain('Qayta urinib ko‘ring.');
});

vi.mock('@/lib/chat-socket', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chat-socket')>(),
  getChatSocket: () => socketFixture,
  closeOtherChatSockets: () => {},
}));
