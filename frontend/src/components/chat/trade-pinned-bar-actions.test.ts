// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TradeResponse } from '@/lib/trade-types';
import { useTradeContext } from './trade-context';
import { TradePinnedBar } from './trade-pinned-bar';

vi.mock('./trade-context', () => ({ useTradeContext: vi.fn() }));

type Context = ReturnType<typeof useTradeContext>;
let context: Context;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  context = {
    viewerId: 'buyer', isSeller: false, activeTrade: {
      id: 'trade-technical-id', sellerId: 'seller', buyerId: 'buyer',
      state: 'WAITING_EMAIL_CHANGE', priceUzs: 20000,
    },
    setIsDrawerOpen: vi.fn(), setShowAcceptModal: vi.fn(),
    setShowProposeModal: vi.fn(), setStartingNew: vi.fn(),
  } as unknown as Context;
  vi.mocked(useTradeContext).mockImplementation(() => context);
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => { await act(async () => root.unmount()); });

async function render() {
  await act(async () => root.render(createElement(TradePinnedBar)));
}

describe('trade bar next steps', () => {
  it('shows waiting as status and opens details using one native button', async () => {
    await render();
    expect(container.textContent).toContain('Sotuvchi emailni almashtirmoqda');
    expect(container.textContent).toContain('Batafsil');
    expect(container.textContent).not.toContain('Davom etish');
    expect(container.textContent).not.toContain('trade-te');
    const button = container.querySelector('button[aria-label="Savdo tafsilotlari"]')!;
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await act(async () => (button as HTMLButtonElement).click());
    expect(context.setIsDrawerOpen).toHaveBeenCalledWith(true);
  });

  it.each([
    ['WAITING_EMAIL_CHANGE', 'seller', 'Emailni almashtiring'],
    ['WAITING_PASSWORD', 'seller', 'Konami parolini yuboring'],
    ['WAITING_BUYER_VERIFY', 'buyer', 'Akkountni tekshiring'],
    ['WAITING_ADMIN', 'seller', 'Adminni tanlang'],
  ] as const)('shows the next step for %s to %s', async (state, viewerId, label) => {
    context.activeTrade!.state = state;
    context.viewerId = viewerId;
    await render();
    expect(container.textContent).toContain(label);
    expect(container.textContent).toContain('Davom etish');
  });

  it('lets either swap participant see their next action until their step is complete', async () => {
    context.activeTrade!.kind = 'SWAP';
    context.activeTrade!.role = 'BUYER';
    context.activeTrade!.sides = [{ role: 'BUYER', emailChanged: false }] as TradeResponse['sides'];
    await render();
    expect(container.textContent).toContain('Emailni almashtiring');
    expect(container.textContent).toContain('Davom etish');
    context.activeTrade!.sides![0].emailChanged = true;
    await render();
    expect(container.textContent).toContain('Ikkinchi taraf kutilmoqda');
    expect(container.textContent).not.toContain('Davom etish');
  });

  it('stops asking for confirmation after this participant has confirmed', async () => {
    context.activeTrade!.state = 'WAITING_CLOSE_CONFIRM';
    context.activeTrade!.buyerConfirmedAt = '2026-09-14T10:00:00Z';
    await render();
    expect(container.textContent).toContain('Ikkinchi taraf kutilmoqda');
    expect(container.textContent).not.toContain('Davom etish');
  });

  it.each([false, true])('keeps proposal acceptance routing when admin handoff is %s', async (requiresAdminHandoff) => {
    context.activeTrade = null;
    context.requiresAdminHandoff = requiresAdminHandoff;
    context.proposal = { sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', id: 'proposal', priceUzs: 20000, expiresAt: '' };
    await render();
    const label = requiresAdminHandoff ? 'Adminga murojaat' : 'Qabul qilish';
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(label))!;
    await act(async () => button.click());
    expect(requiresAdminHandoff ? context.setIsDrawerOpen : context.setShowAcceptModal).toHaveBeenCalledWith(true);
    expect(requiresAdminHandoff ? context.setShowAcceptModal : context.setIsDrawerOpen).not.toHaveBeenCalled();
  });
});
