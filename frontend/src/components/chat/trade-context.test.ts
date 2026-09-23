// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TradeProvider, useTradeContext } from './trade-context';
import type { ChatResponse, MessageResponse } from '@/lib/marketplace-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/payment-client', () => ({ getPublicTradeCommissionConfig: async () => null }));
const chat = { id: 'chat', buyerId: 'buyer', sellerId: 'seller' } as ChatResponse;
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useTradeContext>;
let status: number;
let hidden: boolean;
let online: boolean;
function Probe() { state = useTradeContext(); return null; }
const trade = { id: 'trade', state: 'WAITING_EMAIL_CHANGE', createdAt: '2026-09-19' };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  status = 200; hidden = false; online = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => hidden ? 'hidden' : 'visible');
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (status !== 200) return new Response(null, { status });
    if (path.includes('/proposals?')) return new Response(null, { status: 404 });
    if (path.includes('/account-request')) return Response.json(null);
    return Response.json([trade]);
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(createElement(TradeProvider, { chat, viewerId: 'buyer', listing: null }, createElement(Probe))));
}
it('selects an exact trade and clears that selection when opening the current trade drawer', async () => {
  await mount();
  await act(async () => state.openTrade('old-trade', 'old-listing'));
  expect(state.viewedTrade).toEqual({ id: 'old-trade', listingId: 'old-listing' });
  expect(state.isDrawerOpen).toBe(true);
  await act(async () => state.setIsDrawerOpen(false));
  await act(async () => state.setIsDrawerOpen(true));
  expect(state.viewedTrade).toBeNull();
});
it('preserves the active trade and exposes a retryable error after a service failure', async () => {
  await mount(); expect(state.activeTrade?.id).toBe('trade');
  status = 503;
  await act(async () => state.reload());
  expect(state.activeTrade?.id).toBe('trade');
  expect(state.loadError).toBeTruthy();
  status = 200; await act(async () => state.reload());
  expect(state.loadError).toBeNull();
});
it('treats the proposal endpoint’s documented 404 as absence', async () => {
  await mount();
  expect(state.proposal).toBeNull(); expect(state.loadError).toBeNull();
});
it('pauses all polling while hidden or offline and resumes when available', async () => {
  await mount(); vi.mocked(fetch).mockClear(); hidden = true;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetch).not.toHaveBeenCalled();
  hidden = false; online = false;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetch).not.toHaveBeenCalled();
  online = true; await act(async () => window.dispatchEvent(new Event('online')));
  expect(fetch).toHaveBeenCalled();
});
it('stops automatic requests after a permanent failure until explicit retry', async () => {
  status = 403; await mount(); expect(state.loadError).toBeTruthy();
  vi.mocked(fetch).mockClear();
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); window.dispatchEvent(new Event('online')); });
  expect(fetch).not.toHaveBeenCalled();
  status = 200; await act(async () => state.reload());
  expect(state.activeTrade?.id).toBe('trade'); expect(state.loadError).toBeNull();
});

it('checks empty conversations at a slower cadence without treating expected 404s as failures', async () => {
  vi.mocked(fetch).mockImplementation(async input => {
    const path = String(input);
    if (path.includes('/proposals?')) return new Response(null, { status: 404 });
    return Response.json(path.includes('/account-request') ? null : []);
  });
  await mount(); vi.mocked(fetch).mockClear();
  await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(fetch).toHaveBeenCalledTimes(3); expect(state.loadError).toBeNull();
});

it('keeps the last pending proposal and account selection when their refresh fails', async () => {
  vi.mocked(fetch).mockImplementation(async input => {
    const path = String(input);
    if (path.includes('/proposals?')) return Response.json({ proposalId: 'proposal', amountUzs: 25000 });
    if (path.includes('/account-request')) return Response.json({ id: 'selection' });
    return Response.json([]);
  });
  await mount();
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
  await act(async () => state.reload());
  expect(state.proposal?.id).toBe('proposal'); expect(state.accountRequest?.id).toBe('selection');
  expect(state.loadError).toBeTruthy();
});

it('does not let a pre-create lookup erase a newly created proposal', async () => {
  let finishLookup!: (response: Response) => void;
  const pendingRead = new Promise<Response>(resolve => { finishLookup = resolve; });
  vi.mocked(fetch).mockImplementation(async input => {
    const path = String(input);
    if (path.includes('/proposals?')) return pendingRead;
    return Response.json(path.includes('/account-request') ? null : []);
  });
  await mount();
  await act(async () => state.handleProposalCreated({ proposalId: 'new-proposal', expiresAt: '' }, 25000, 'SMART'));
  await act(async () => { finishLookup(new Response(null, { status: 404 })); });
  expect(state.proposal?.id).toBe('new-proposal');
});

it('does not resurrect an accepted proposal from an old lookup and runs the queued reload', async () => {
  let finishLookup!: (response: Response) => void;
  const pendingRead = new Promise<Response>(resolve => { finishLookup = resolve; });
  let proposalLookups = 0;
  vi.mocked(fetch).mockImplementation(async input => {
    const path = String(input);
    if (path.includes('/proposals?')) return ++proposalLookups === 1 ? pendingRead : new Response(null, { status: 404 });
    return Response.json(path.includes('/account-request') ? null : proposalLookups ? [trade] : []);
  });
  await mount();
  await act(async () => state.handleProposalCreated({ proposalId: 'accepted-proposal', expiresAt: '' }, 25000, 'SMART'));
  await act(async () => state.handleProposalAccepted());
  await act(async () => { finishLookup(Response.json({ proposalId: 'accepted-proposal', amountUzs: 25000 })); });
  expect(state.proposal).toBeNull();
  expect(proposalLookups).toBe(2);
  expect(state.activeTrade?.id).toBe('trade');
});

it('selects each request independently and clears the selection for current-trade navigation', async () => {
  await mount();
  const first = { id: 'first', chatId: 'chat', senderId: 'seller', content: '5000', createdAt: '' } as MessageResponse;
  const second = { ...first, id: 'second', content: '9000' };
  await act(async () => state.openProposal(first));
  expect(state.viewedProposal).toEqual(first);
  expect(state.isDrawerOpen).toBe(true);
  await act(async () => state.openProposal(second));
  expect(state.viewedProposal).toEqual(second);
  await act(async () => state.openTrade('trade'));
  expect(state.viewedProposal).toBeNull();
  await act(async () => state.openProposal(first));
  await act(async () => state.setIsDrawerOpen(false));
  expect(state.viewedProposal).toBeNull();
});
