// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TradeProvider, useTradeContext } from './trade-context';
import { TradePinnedBar } from './trade-pinned-bar';
import { TradePanel } from './trade-panel';
import type { ChatResponse, ListingResponse } from '@/lib/marketplace-types';
import type { AccountRequest } from '@/lib/account-request';
import type { PendingProposalResponse, TradeResponse } from '@/lib/trade-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/payment-client', () => ({ getPublicTradeCommissionConfig: async () => null }));
const chat = { id: 'chat', sellerId: 'seller', buyerId: 'buyer' } as ChatResponse;
const listing = { id: 'listing', sellerId: 'seller', description: 'Mobile account', price: 20000,
  attributes: { platform: 'MOBILE' }, mediaMessageIds: [] } as unknown as ListingResponse;
const offer: PendingProposalResponse = {
  proposalId: 'proposal', sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller',
  listingId: 'listing', marketplaceChatId: 'chat', amountUzs: 20000, expiresAt: '', kind: 'SALE',
};
let pending: PendingProposalResponse | null;
let request: AccountRequest | null;
let trades: TradeResponse[];
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useTradeContext>;
function Probe() { state = useTradeContext(); return null; }
const requestFrom = (requesterId: string): AccountRequest => ({
  id: 'request', chatId: 'chat', requesterId, listingId: 'listing', status: 'OPEN', createdAt: '', listing: null,
});
const buttons = () => Array.from(document.querySelectorAll('button'));
const acceptButtons = () => buttons().filter(button => button.textContent?.includes('Qabul qilish'));
async function mount(viewerId: string, initialPendingProposal: PendingProposalResponse | null = null) {
  await act(async () => root.render(createElement(TradeProvider,
    { chat, listing, viewerId, initialPendingProposal },
    createElement(Fragment, null, createElement(Probe), createElement(TradePinnedBar), createElement(TradePanel)))));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  pending = { ...offer }; request = null; trades = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes('/proposals?')) return pending ? Response.json(pending) : new Response(null, { status: 404 });
    if (path.includes('/account-request')) return Response.json(request);
    return Response.json(trades);
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it.each(['seller', 'buyer'])('hides acceptance from the %s sender before account requests load', viewerId => {
  const html = renderToStaticMarkup(createElement(TradeProvider,
    { chat, listing, viewerId, initialPendingProposal: { ...offer, proposerUserId: viewerId } },
    createElement(TradePinnedBar)));
  expect(html).not.toContain('Qabul qilish');
  expect(html).toContain('Javob kutilmoqda');
});

it('keeps a seller’s pending role and waiting state when the account request is missing or reversed', async () => {
  await mount('seller');
  expect(state.role).toBe('SELLER');
  expect(state.proposal).toMatchObject({ sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller' });
  request = requestFrom('seller');
  await act(async () => state.reload());
  expect(state.role).toBe('SELLER');
  await act(async () => { state.setIsDrawerOpen(true); state.setShowAcceptModal(true); });
  expect(acceptButtons()).toHaveLength(0);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('Taklifni qabul qilish');
});

it('lets the actual recipient accept even if the next account request assigns them as seller', async () => {
  request = requestFrom('seller');
  await mount('buyer');
  expect(state.role).toBe('BUYER');
  expect(acceptButtons()).toHaveLength(1);
  await act(async () => acceptButtons()[0].click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Taklifni qabul qilish');
});

it('lets a seller accept a buyer-initiated proposal, but never lets the proposer accept', async () => {
  pending = { ...offer, proposerUserId: 'buyer' };
  request = requestFrom('buyer');
  await mount('seller');
  expect(state.role).toBe('SELLER');
  expect(acceptButtons()).toHaveLength(1);
  await act(async () => acceptButtons()[0].click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Taklifni qabul qilish');
});

it('records the local sender and participants immediately and preserves them through refresh', async () => {
  pending = null; request = requestFrom('buyer');
  await mount('seller');
  await act(async () => state.handleProposalCreated({ proposalId: 'proposal', expiresAt: '' }, 20000, 'SMART'));
  expect(state.proposal).toMatchObject({ sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller' });
  expect(acceptButtons()).toHaveLength(0);
  pending = { ...offer }; request = requestFrom('seller');
  await act(async () => state.reload());
  expect(state.role).toBe('SELLER');
  expect(acceptButtons()).toHaveLength(0);
});

it('switches roles for the next proposal in the same chat using its participants', async () => {
  await mount('seller');
  expect(state.role).toBe('SELLER');
  pending = { ...offer, proposalId: 'next', sellerId: 'buyer', buyerId: 'seller', proposerUserId: 'buyer' };
  await act(async () => state.reload());
  expect(state.role).toBe('BUYER');
  expect(acceptButtons()).toHaveLength(1);
});

it('uses active trade participants for the role label and swap progress when the response role is stale', async () => {
  pending = null; request = requestFrom('seller');
  trades = [{ id: 'trade', sellerId: 'seller', buyerId: 'buyer', role: 'BUYER', kind: 'SWAP',
    state: 'WAITING_EMAIL_CHANGE', priceUzs: 0, createdAt: '', mailboxEmail: 'trade@example.com',
    sides: [{ role: 'SELLER', emailChanged: true }, { role: 'BUYER', emailChanged: false }],
  } as TradeResponse];
  await mount('seller');
  expect(state.role).toBe('SELLER');
  await act(async () => state.setIsDrawerOpen(true));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('Sizning qismingiz bajarildi');
  expect(dialog.textContent).not.toContain('Email o‘zgartirdim');
  expect(dialog.textContent).not.toContain('Xaridor');
});

it.each(['seller', 'buyer'])('uses the new contact after a completed trade for the %s view', async viewerId => {
  pending = null;
  request = { ...requestFrom('buyer'), createdAt: '2026-09-24T10:00:00Z', listing: { ...listing, price: 20000, coverMessageId: null } };
  trades = [{ id: 'old-trade', sellerId: 'buyer', buyerId: 'seller', state: 'SUCCESS',
    createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-21T10:00:00Z',
    priceUzs: 20000, kind: 'SALE',
  } as TradeResponse];
  await mount(viewerId);
  expect(state.role).toBe(viewerId === 'seller' ? 'SELLER' : 'BUYER');
  expect(container.textContent).not.toContain('Oxirgi savdo:');
  const propose = buttons().find(button => button.textContent === 'Taklif yuborish');
  if (viewerId === 'seller') {
    expect(propose).toBeDefined();
    await act(async () => propose!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Taklif yuborish');
  } else {
    expect(propose).toBeUndefined();
    expect(container.textContent).toContain('Taklif kutilmoqda');
  }
});

it('keeps the completed trade visible when the contact belongs to that trade', async () => {
  pending = null;
  request = { ...requestFrom('buyer'), createdAt: '2026-09-20T09:00:00Z', listing: { ...listing, price: 20000, coverMessageId: null } };
  trades = [{ id: 'old-trade', sellerId: 'seller', buyerId: 'buyer', state: 'SUCCESS',
    createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-21T10:00:00Z', priceUzs: 20000,
  } as TradeResponse];
  await mount('seller');
  expect(container.textContent).toContain('Oxirgi savdo:');
  expect(buttons().some(button => button.textContent === 'Taklif yuborish')).toBe(false);
});

it.each([false, true])('does not turn contact during a trade into a new negotiation (timestamp missing: %s)', async missingTimestamp => {
  pending = null;
  request = { ...requestFrom('buyer'), createdAt: '2026-09-20T12:00:00Z',
    listing: { ...listing, price: 20000, coverMessageId: null } };
  trades = [{ id: 'old-trade', sellerId: 'seller', buyerId: 'buyer', state: 'SUCCESS',
    createdAt: '2026-09-20T10:00:00Z', updatedAt: missingTimestamp ? undefined : '2026-09-21T10:00:00Z',
    priceUzs: 20000,
  } as TradeResponse];
  await mount('seller');
  expect(container.textContent).toContain('Oxirgi savdo:');
  expect(buttons().some(button => button.textContent === 'Taklif yuborish')).toBe(false);
});

it.each(['seller', 'buyer'])('does not pin cleared trade history when the %s reopens the same chat', async viewerId => {
  pending = null;
  request = { ...requestFrom('buyer'), createdAt: '2026-09-24T10:00:00Z',
    listing: { ...listing, price: 20000, coverMessageId: null } };
  trades = [{ id: 'cleared-trade', sellerId: 'buyer', buyerId: 'seller', state: 'REJECTED',
    createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-24T11:00:00Z', priceUzs: 12345,
  } as TradeResponse];
  await act(async () => root.render(createElement(TradeProvider,
    { chat: { ...chat, clearedAt: '2026-09-24T09:00:00Z' }, listing, viewerId },
    createElement(Fragment, null, createElement(Probe), createElement(TradePinnedBar), createElement(TradePanel)))));
  expect(state.lastFinished).toBeNull();
  expect(state.trades).toEqual([]);
  expect(container.textContent).not.toContain('Oxirgi savdo:');
  await act(async () => state.setIsDrawerOpen(true));
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('12 345');
  expect(state.role).toBe(viewerId === 'seller' ? 'SELLER' : 'BUYER');
});

it.each(['WAITING_EMAIL_CHANGE', 'SUCCESS'] as const)('keeps a new %s trade after the chat was cleared', async tradeState => {
  pending = null;
  trades = [{ id: 'new-trade', sellerId: 'seller', buyerId: 'buyer', state: tradeState,
    createdAt: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T11:00:00Z', priceUzs: 20000,
  } as TradeResponse];
  await act(async () => root.render(createElement(TradeProvider,
    { chat: { ...chat, clearedAt: '2026-09-24T09:00:00Z' }, listing, viewerId: 'seller' },
    createElement(Probe))));
  expect(state.trades?.map(trade => trade.id)).toEqual(['new-trade']);
  expect((state.activeTrade ?? state.lastFinished)?.id).toBe('new-trade');
});
