// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TradeProposalMessageCard } from './trade-proposal-message-card';
import { useTradeContext } from './trade-context';
import type { MessageResponse } from '@/lib/marketplace-types';

vi.mock('./trade-context', () => ({ useTradeContext: vi.fn() }));
type Context = ReturnType<typeof useTradeContext>;
let context: Context;
let message: MessageResponse;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  context = {
    proposal: null, activeTrade: null, trades: [], listing: null, accountRequest: null,
    isSeller: false, setShowAcceptModal: vi.fn(), setIsDrawerOpen: vi.fn(), openTrade: vi.fn(), openProposal: vi.fn(),
  } as unknown as Context;
  message = { id: 'message', chatId: 'chat', senderId: 'seller', content: '5000',
    proposalId: 'old-proposal', createdAt: '2026-09-18T10:00:00Z', messageType: 'TRADE_PROPOSAL' };
  vi.mocked(useTradeContext).mockImplementation(() => context);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });
const render = async () => act(async () => root.render(createElement(TradeProposalMessageCard, { message, viewerId: 'buyer' })));

it('does not claim an unknown historical proposal is pending or finished', async () => {
  await render();
  expect(container.textContent).toContain('Holati noma’lum');
  expect(container.textContent).not.toContain('Kutilmoqda');
  expect(container.textContent).not.toContain('Ushbu taklif yakunlangan');
});

it('does not attach an unrelated active trade to an old pending card', async () => {
  message.proposalOutcome = 'PENDING';
  context.activeTrade = { id: 'unrelated' } as Context['activeTrade'];
  await render();
  expect(container.textContent).not.toContain('Savdo jarayonini');
  expect(container.textContent).not.toContain('Kutilmoqda');
});

it.each(['ACCEPTED', 'REJECTED', 'EXPIRED'] as const)('preserves %s over stale pending context', async outcome => {
  message.proposalOutcome = outcome;
  context.proposal = { id: 'old-proposal', priceUzs: 5000, expiresAt: '' };
  await render();
  expect(container.textContent).not.toContain('Kutilmoqda');
  expect(container.textContent).not.toContain('Qabul qilish');
});

it('keeps a historical zero-price exchange independent of the current proposal', async () => {
  message.content = '0';
  context.proposal = { id: 'new-proposal', priceUzs: 999999, kind: 'SALE', expiresAt: '' };
  await render();
  expect(container.textContent).toContain('Almashish sharti');
  expect(container.textContent).toContain('Akkount almashish');
  expect(container.textContent).not.toContain('Taklif qilingan summa');
  expect(container.textContent).not.toContain('999');
});

it.each(['', 'broken', '-100'])('does not label invalid amount %s as an exchange', async content => {
  message.content = content;
  await render();
  expect(container.textContent).toContain('Summa ko‘rsatilmagan');
  expect(container.textContent).not.toContain('Akkount almashish');
});

it('does not treat an ID-less old message as the current offer', async () => {
  message.proposalId = null;
  context.proposal = { id: 'new-proposal', priceUzs: 20000, expiresAt: '' };
  await render();
  expect(container.textContent).not.toContain('Qabul qilish');
});

it('does not use a different proposal’s swap type for a historical sale', async () => {
  context.proposal = { id: 'new-proposal', priceUzs: 0, kind: 'SWAP', expiresAt: '' };
  await render();
  expect(container.textContent).toContain('5');
  expect(container.textContent).toContain("so'm");
  expect(container.textContent).not.toContain('Akkount almashish');
});

it('opens the exact accepted trade even when another trade is active', async () => {
  message.proposalOutcome = 'ACCEPTED';
  message.proposalTradeId = 'original-trade';
  message.proposalListingId = 'original-listing';
  context.activeTrade = { id: 'unrelated' } as Context['activeTrade'];
  await render();
  await act(async () => container.querySelector('button')!.click());
  expect(context.openProposal).toHaveBeenCalledWith(message);
  expect(context.openTrade).not.toHaveBeenCalled();
  expect(context.setIsDrawerOpen).not.toHaveBeenCalled();
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/marketplace/original-listing');
});

it('keeps stored surcharge and listing details after the pending proposal is gone', async () => {
  message.proposalKind = 'SWAP_SURCHARGE';
  message.proposalListingId = 'original-listing';
  context.listing = { id: 'different-listing', description: 'Unrelated account' } as Context['listing'];
  await render();
  expect(container.textContent).toContain('Doplata');
  expect(container.textContent).not.toContain('Unrelated account');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/marketplace/original-listing');
});

it('shows expiration consistently even if a pending lookup has not refreshed yet', async () => {
  message.proposalOutcome = 'PENDING';
  message.proposalExpiresAt = '2020-01-01T00:00:00Z';
  context.proposal = { id: 'old-proposal', priceUzs: 5000, expiresAt: message.proposalExpiresAt };
  await render();
  expect(container.textContent).toContain('Muddati tugagan');
  expect(container.textContent).not.toContain('Qabul qilish');
  expect(container.textContent).not.toContain('Kutilmoqda');
});

it('lets only the recipient accept a verified live proposal', async () => {
  context.proposal = { id: 'old-proposal', priceUzs: 5000, expiresAt: '' };
  await render();
  expect(container.textContent).toContain('Qabul qilish');
  message.senderId = 'buyer';
  await render();
  expect(container.textContent).not.toContain('Qabul qilish');
  expect(container.textContent).toContain('Javob kutilmoqda');
});

it.each(['ACCEPTED', 'REJECTED', 'EXPIRED', null] as const)('opens the specific %s request even without a trade link', async outcome => {
  message.proposalOutcome = outcome;
  await render();
  const details = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Batafsil')!;
  await act(async () => details.click());
  expect(context.openProposal).toHaveBeenCalledWith(message);
  expect(context.setIsDrawerOpen).not.toHaveBeenCalled();
});

it('refreshes the selected request when its acceptance arrives in chat', async () => {
  context.viewedProposal = { ...message };
  message = { ...message, proposalOutcome: 'ACCEPTED', proposalTradeId: 'linked-trade' };
  await render();
  expect(context.openProposal).toHaveBeenCalledWith(message);
});
