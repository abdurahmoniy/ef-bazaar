// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TradePanel } from './trade-panel';
import { useTradeContext } from './trade-context';
import type { TradeResponse } from '@/lib/trade-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('./trade-context', () => ({ useTradeContext: vi.fn() }));

type Context = ReturnType<typeof useTradeContext>;
let context: Context;
let container: HTMLDivElement;
let root: Root;
const email = 'trade-7f10a8c2@efbazaar.uz';

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const trade = {
    id: 'e727540c-trade', state: 'WAITING_EMAIL_CHANGE', kind: 'SALE',
    buyerId: 'buyer', sellerId: 'seller', role: 'SELLER', priceUzs: 20000,
    mailboxEmail: email, emailChangeVerificationCode: null,
    stateDeadline: null,
  } as TradeResponse;
  context = {
    chat: { id: 'chat' }, viewerId: 'seller', activeTrade: trade,
    trades: [trade], isSeller: true, role: 'SELLER', isDrawerOpen: true,
    setIsDrawerOpen: vi.fn(), reload: vi.fn(), refreshing: false,
  } as unknown as Context;
  vi.mocked(useTradeContext).mockImplementation(() => context);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = async () => act(async () => root.render(createElement(TradePanel)));
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const buttonWith = (text: string) => Array.from(dialog().querySelectorAll('button'))
  .find((button) => button.textContent?.includes(text))!;

describe('seller proposal trade types', () => {
  function prepareProposal(exchangeMode?: string, fromRequest = false) {
    context.activeTrade = null;
    context.trades = [];
    context.isDrawerOpen = false;
    context.showProposeModal = true;
    context.otherPartyId = 'buyer';
    context.handleProposalCreated = vi.fn();
    context.listing = {
      id: 'listing', description: 'Mobile account', price: 20000, mediaMessageIds: [],
      attributes: { platform: 'MOBILE', exchange_mode: exchangeMode },
    } as unknown as Context['listing'];
    context.accountRequest = fromRequest ? {
      id: 'request', chatId: 'chat', requesterId: 'buyer', listingId: 'listing',
      status: 'OPEN', createdAt: '',
      listing: {
        id: 'listing', description: 'Requested account', price: 20000,
        priceNegotiable: false, coverMessageId: null, exchangeMode,
        attributes: { platform: 'MOBILE' },
      },
    } : null;
  }

  for (const fromRequest of [false, true]) {
    it.each([undefined, 'NONE', 'EXCHANGE_ONLY', 'EXCHANGE_WITH_SURCHARGE', 'BOTH'])(
      `shows all three types for %s (${fromRequest ? 'account request' : 'chat listing'})`,
      async (exchangeMode) => {
        prepareProposal(exchangeMode, fromRequest);
        await render();
        const options = Array.from(dialog().querySelectorAll('[aria-label="Savdo turi"] [role="radio"]'));
        expect(options.map(option => option.textContent)).toEqual(['Sotuv', 'Obmen', 'Obmen + doplata']);
        expect(options[0].getAttribute('aria-checked')).toBe('true');
        await act(async () => (options[1] as HTMLButtonElement).click());
        expect(dialog().querySelector('#trade-price')).toBeNull();
        expect(dialog().querySelector('#swap-surcharge')).toBeNull();
        await act(async () => (options[2] as HTMLButtonElement).click());
        expect(dialog().querySelector('#swap-surcharge')).not.toBeNull();
        await act(async () => (options[0] as HTMLButtonElement).click());
        expect(dialog().querySelector('#trade-price')).not.toBeNull();
      },
    );
  }

  it('sends a swap on a sale-only listing with the seller and buyer preserved', async () => {
    prepareProposal('NONE', true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ proposalId: 'proposal', expiresAt: '' })));
    await render();
    await act(async () => buttonWith('Obmen').click());
    await act(async () => dialog().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(fetch).toHaveBeenCalledWith('/api/trade/v1/trades/proposals', expect.objectContaining({
      body: JSON.stringify({ marketplaceChatId: 'chat', otherPartyUserId: 'buyer', sellerId: 'seller',
        buyerId: 'buyer', amountUzs: 0, mode: 'SMART', kind: 'SWAP', listingId: 'listing' }),
    }));
    expect(context.handleProposalCreated).toHaveBeenCalledWith(
      { proposalId: 'proposal', expiresAt: '' }, 0, 'SMART', undefined, 'SWAP',
    );
  });
});

describe('trade details', () => {
  it('shows the selected historical trade instead of the unrelated active trade', async () => {
    const historical = { ...context.activeTrade!, id: 'historical', state: 'REJECTED', priceUzs: 7000 } as TradeResponse;
    context.trades!.push(historical);
    context.viewedTrade = { id: 'historical', listingId: 'original-listing' };
    await render();
    expect(dialog().textContent).toContain('Savdo rad etildi');
    expect(dialog().textContent).not.toContain('Email o‘zgartirdim');
    expect(dialog().querySelector('a')?.getAttribute('href')).toBe('/marketplace/original-listing');
  });

  it('does not fall back to another trade or listing when a selected trade is missing', async () => {
    context.viewedTrade = { id: 'missing' };
    context.listing = { id: 'unrelated' } as Context['listing'];
    await render();
    expect(dialog().textContent).toContain('Bu taklifga tegishli savdoni yuklab bo‘lmadi');
    expect(dialog().textContent).not.toContain('Email o‘zgartirdim');
    expect(dialog().querySelector('a')).toBeNull();
  });

  it('shows the selected request summary and timeline without leaking the latest trade', async () => {
    context.viewedProposal = { id: 'old-message', chatId: 'chat', senderId: 'buyer', content: '5000',
      createdAt: '2026-09-18T10:05:00Z', proposalId: 'old-proposal', proposalOutcome: 'REJECTED',
      proposalListingId: 'old-listing', messageType: 'TRADE_PROPOSAL' };
    context.proposal = { sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', id: 'current', priceUzs: 999999, expiresAt: '' };
    context.listing = { id: 'current-listing', description: 'Unrelated account' } as Context['listing'];
    await render();
    expect(dialog().textContent).toContain('Rad etilgan');
    expect(dialog().textContent).toContain('15:05');
    expect(dialog().textContent).toContain('Savdo bosqichlari');
    expect(dialog().textContent).not.toContain('Unrelated account');
    expect(dialog().textContent).not.toContain(email);
    expect(dialog().textContent).not.toContain('999');
    expect(buttonWith('Qabul qilish')).toBeUndefined();
    expect(dialog().querySelector('a')?.getAttribute('href')).toBe('/marketplace/old-listing');
  });

  it('opens the linked trade’s controls and timeline rather than the active trade', async () => {
    context.trades!.push({ ...context.activeTrade!, id: 'old-trade', state: 'REJECTED', priceUzs: 5000 });
    context.viewedProposal = { id: 'old-message', chatId: 'chat', senderId: 'seller', content: '5000',
      createdAt: '2026-09-18T10:05:00Z', proposalId: 'old-proposal', proposalOutcome: 'ACCEPTED',
      proposalTradeId: 'old-trade', messageType: 'TRADE_PROPOSAL' };
    await render();
    expect(dialog().textContent).toContain('Qabul qilingan');
    expect(dialog().textContent).toContain('Savdo rad etildi');
    expect(dialog().textContent).not.toContain(email);
  });

  it('keeps legacy accepted requests inspectable without inventing a linked trade', async () => {
    context.viewedProposal = { id: 'old-message', chatId: 'chat', senderId: 'seller', content: '5000',
      createdAt: '2026-09-18T10:05:00Z', proposalOutcome: 'ACCEPTED' };
    await render();
    expect(dialog().textContent).toContain('Bu eski taklifning savdo tafsilotlari mavjud emas');
    expect(dialog().textContent).not.toContain(email);
  });

  it('shows the full current-trade timeline and summary from the pinned window', async () => {
    context.activeTrade!.createdAt = '2026-09-22T08:10:00Z';
    await render();
    expect(dialog().querySelector('[aria-label="Savdo ma’lumotlari"]')).not.toBeNull();
    expect(dialog().querySelectorAll('[data-step]')).toHaveLength(9);
    expect(dialog().querySelector('[data-step="WAITING_PAYMENT"]')?.getAttribute('data-status')).toBe('passed');
    expect(dialog().querySelector('[data-step="WAITING_EMAIL_CHANGE"]')?.getAttribute('data-status')).toBe('current');
    expect(dialog().querySelector('[data-step="SUCCESS"]')?.getAttribute('data-status')).toBe('next');
    expect(dialog().querySelector('[data-step="INITIATED"] time')?.textContent).toContain('13:10');
    expect(dialog().querySelector('[data-step="SENT"] time')).toBeNull();
    expect(dialog().textContent).toContain(email);
    expect(buttonWith('Email o‘zgartirdim')).toBeDefined();
  });

  it('updates the pinned timeline as the trade advances', async () => {
    await render();
    context.activeTrade = { ...context.activeTrade!, state: 'WAITING_PASSWORD' };
    await render();
    expect(dialog().querySelector('[data-step="WAITING_EMAIL_CHANGE"]')?.getAttribute('data-status')).toBe('passed');
    expect(dialog().querySelector('[data-step="WAITING_PASSWORD"]')?.getAttribute('aria-current')).toBe('step');
    expect(buttonWith('Konami parolini yuborish')).toBeDefined();
  });

  it('shows a finished trade’s full timeline and retains the new-trade action', async () => {
    context.lastFinished = { ...context.activeTrade!, state: 'REJECTED' };
    context.activeTrade = null;
    await render();
    expect(dialog().querySelector('[data-step="WAITING_BUYER_VERIFY"]')?.getAttribute('data-status')).toBe('failed');
    expect(dialog().querySelector('[data-step="SUCCESS"]')?.getAttribute('data-status')).toBe('next');
    expect(buttonWith('Yangi savdo boshlash')).toBeDefined();
  });

  it('shows the pending pinned request’s upcoming flow and acceptance action', async () => {
    context.viewerId = 'buyer';
    context.activeTrade = null;
    context.isSeller = false;
    context.proposal = { sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', id: 'pending', priceUzs: 5000, expiresAt: '' };
    await render();
    expect(dialog().querySelector('[data-step="ACCEPTED"]')?.getAttribute('data-status')).toBe('current');
    expect(dialog().querySelector('[data-step="WAITING_PASSWORD"]')?.getAttribute('data-status')).toBe('next');
    expect(buttonWith('Qabul qilish')).toBeDefined();
  });

  function prepareBuyer() {
    Object.assign(context.activeTrade!, {
      state: 'WAITING_BUYER_VERIFY', role: 'BUYER', passwordMessageId: 'password-message',
    });
    context.viewerId = 'buyer';
    context.isSeller = false;
  }

  async function revealPassword(status = 200) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(status === 200
      ? Response.json({ password: 'one-time-secret' })
      : new Response(null, { status })));
    await act(async () => buttonWith("Parolni ko'rsatish").click());
    const nested = document.querySelectorAll('[role="dialog"]')[1];
    const confirm = Array.from(nested.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Ha, ochaman'))!;
    await act(async () => confirm.click());
  }

  it('keeps approve and reject available after revealing and remounting the panel', async () => {
    prepareBuyer();
    await render();
    await revealPassword();
    expect(dialog().textContent).toContain('one-time-secret');
    expect(JSON.stringify(localStorage)).not.toContain('one-time-secret');
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(buttonWith("Parolni ko'rsatish")).toBeUndefined();
    expect(buttonWith('Tasdiqlash').disabled).toBe(false);
    expect(buttonWith('Rad etish').disabled).toBe(false);
    expect(dialog().textContent).not.toContain('one-time-secret');
    expect(dialog().querySelector('[aria-label="Parolni nusxa olish"]')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows decision controls when the one-time password is already unavailable', async () => {
    prepareBuyer();
    await render();
    await revealPassword(410);
    expect(buttonWith("Parolni ko'rsatish")).toBeUndefined();
    expect(buttonWith('Tasdiqlash')).toBeDefined();
    expect(buttonWith('Rad etish')).toBeDefined();
  });

  it('keeps reveal retryable after an ordinary server error', async () => {
    prepareBuyer();
    await render();
    await revealPassword(500);
    expect(buttonWith("Parolni ko'rsatish").disabled).toBe(false);
    expect(buttonWith('Tasdiqlash')).toBeUndefined();
  });

  it('does not reuse revealed credentials or reveal status for a different trade', async () => {
    prepareBuyer();
    await render();
    await revealPassword();
    context.activeTrade = { ...context.activeTrade!, id: 'another-trade', passwordMessageId: 'another-password' };
    await render();
    expect(buttonWith("Parolni ko'rsatish").disabled).toBe(false);
    expect(dialog().textContent).not.toContain('one-time-secret');
  });

  it('preserves the confirmation cooldown after reopening a revealed password', async () => {
    prepareBuyer();
    context.activeTrade!.confirmUnlocksAt = new Date(Date.now() + 60_000).toISOString();
    await render();
    await revealPassword();
    context.isDrawerOpen = false;
    await render();
    context.isDrawerOpen = true;
    await render();
    expect(buttonWith("Parolni ko'rsatish")).toBeUndefined();
    expect(buttonWith('Tasdiqlash').disabled).toBe(true);
    expect(buttonWith('Rad etish').disabled).toBe(false);
  });

  it('keeps swap participants’ one-time reveal states separate', async () => {
    prepareBuyer();
    context.activeTrade!.kind = 'SWAP';
    await render();
    await revealPassword();
    context.viewerId = 'seller';
    context.isSeller = true;
    context.activeTrade = { ...context.activeTrade!, role: 'SELLER', passwordMessageId: 'seller-password' };
    await render();
    expect(buttonWith("Parolni ko'rsatish").disabled).toBe(false);
    expect(dialog().textContent).not.toContain('one-time-secret');
  });

  it('still displays the revealed password and controls when browser storage is blocked', async () => {
    prepareBuyer();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    await render();
    await revealPassword();
    expect(dialog().textContent).toContain('one-time-secret');
    expect(buttonWith('Tasdiqlash').disabled).toBe(false);
    expect(buttonWith('Rad etish').disabled).toBe(false);
  });

  it.each(['active', 'finished', 'proposal', 'no-request'])('keeps the listing link available in the %s state', async (state) => {
    context.listing = { id: 'original-listing' } as NonNullable<Context['listing']>;
    if (state === 'finished') {
      context.lastFinished = { ...context.activeTrade!, state: 'ORPHANED' };
    }
    if (state !== 'active') context.activeTrade = null;
    if (state === 'proposal') context.proposal = { sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', id: 'proposal', listingId: 'offered-listing', priceUzs: 20000, expiresAt: '' };
    if (state === 'no-request') context.role = null;
    await render();
    expect(dialog().querySelector('a')?.getAttribute('href')).toBe(
      `/marketplace/${state === 'proposal' ? 'offered-listing' : 'original-listing'}`,
    );
  });

  it('keeps trade instructions out of the conversation until details are opened', async () => {
    context.isDrawerOpen = false;
    await render();
    expect(container.textContent).toBe('');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    context.isDrawerOpen = true;
    await render();
    expect(dialog().textContent).toContain(email);
    expect(container.textContent).toBe('');
  });

  it('keeps the portaled sheet inside the visible area when a phone keyboard opens', async () => {
    const width = window.innerWidth;
    const original = window.visualViewport;
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    try {
      await render();
      await act(async () => {
        viewport.height = 400;
        viewport.offsetTop = 30;
        viewport.dispatchEvent(new Event('resize'));
      });
      const overlay = dialog().parentElement!;
      expect(overlay.style.top).toBe('30px');
      expect(overlay.style.height).toBe('min(400px, var(--tg-viewport-height, 100dvh))');
      expect(overlay.style.bottom).toBe('auto');
      expect(dialog().style.maxHeight).toBe('100%');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: original });
    }
  });

  it('names the sheet and supports closing it with Escape', async () => {
    await render();
    const labelId = dialog().getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe('Savdo tafsilotlari');
    await act(async () => dialog().dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true,
    })));
    expect(context.setIsDrawerOpen).toHaveBeenCalledWith(false);
  });

  it('copies the complete email and explains why confirmation is unavailable', async () => {
    await render();
    const copy = dialog().querySelector<HTMLButtonElement>('[aria-label="Emailni nusxa olish"]')!;
    expect(copy).not.toBeNull();
    await act(async () => copy.click());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(email);
    expect(dialog().textContent).toContain('Nusxalandi');
    expect(buttonWith('Email o‘zgartirdim').disabled).toBe(true);
    expect(dialog().textContent).toContain('Kod kelgach tasdiqlash tugmasi faollashadi.');
  });

  it('keeps the seller confirmation step after the code arrives', async () => {
    context.activeTrade!.emailChangeVerificationCode = '123456';
    await render();
    expect(buttonWith('Email o‘zgartirdim').disabled).toBe(false);
    await act(async () => buttonWith('Email o‘zgartirdim').click());
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1].textContent).toContain('Ha, tasdiqlayman');
    expect(context.reload).not.toHaveBeenCalled();
  });

  it('closes only the nested confirmation and returns focus to its action', async () => {
    context.activeTrade!.emailChangeVerificationCode = '123456';
    await render();
    const confirm = buttonWith('Email o‘zgartirdim');
    await act(async () => {
      confirm.focus();
      confirm.click();
    });
    const nested = document.querySelectorAll('[role="dialog"]')[1];
    expect(nested).toContain(document.activeElement);
    await act(async () => nested.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true,
    })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(context.setIsDrawerOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(confirm);
  });
});
