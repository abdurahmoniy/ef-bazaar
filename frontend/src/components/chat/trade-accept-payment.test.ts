// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TradePanel } from './trade-panel';
import { useTradeContext } from './trade-context';
import type { InvoiceResponse, InvoiceStatus } from '@/lib/payment-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./trade-context', () => ({ useTradeContext: vi.fn() }));
let context: ReturnType<typeof useTradeContext>;
let root: Root;
let container: HTMLDivElement;
let available: number;
let invoice: InvoiceResponse | null;
let status: InvoiceStatus;
let walletFails: boolean;
let invoiceFails: boolean;
let acceptError: string | null;
const button = (label: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(label));
const text = () => document.body.textContent!.replace(/\s/g, ' ');
const calls = (suffix: string, method = 'POST') => vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith(suffix) && (init?.method ?? 'GET') === method);
const render = () => act(async () => root.render(createElement(TradePanel)));
const click = (label: string) => act(async () => { expect(button(label)).toBeDefined(); button(label)!.click(); });
function makeInvoice(amount = 15000): InvoiceResponse {
  return { id: 'invoice', pan: '8600000000000000', holderName: 'Test Card', cardExpiry: '12/30',
    requestedTiyin: amount * 100, transferTiyin: amount * 100 + 100, expiresAt: new Date(Date.now() + 600000).toISOString(), status: 'PENDING' };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  available = 1000000; invoice = null; status = 'PENDING'; walletFails = false; invoiceFails = false; acceptError = null;
  context = {
    chat: { id: 'chat' }, viewerId: 'buyer', trades: [], activeTrade: null, isDrawerOpen: false,
    proposal: { id: 'offer', sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', listingId: 'listing',
      priceUzs: 25000, kind: 'SALE', mode: 'SMART', expiresAt: new Date(Date.now() + 600000).toISOString() },
    listing: { id: 'listing', attributes: { platform: 'MOBILE' } }, showAcceptModal: true,
    setShowAcceptModal: vi.fn(), handleProposalAccepted: vi.fn(),
  } as unknown as ReturnType<typeof useTradeContext>;
  vi.mocked(useTradeContext).mockImplementation(() => context);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/wallet')) return walletFails ? new Response(null, { status: 503 }) : Response.json({ availableTiyin: available });
    if (url.endsWith('/invoices/active')) return invoice ? Response.json(invoice) : new Response(null, { status: 204 });
    if (url.endsWith('/invoices') && init?.method === 'POST') {
      if (invoiceFails) return Response.json({ detail: 'To‘ldirish vaqtincha ishlamayapti' }, { status: 503 });
      invoice = makeInvoice(JSON.parse(init.body as string).amountUzs);
      return Response.json(invoice);
    }
    if (url.endsWith('/status')) return Response.json({ id: 'invoice', status, creditedTiyin: 1500000 });
    if (url.endsWith('/accept')) return acceptError ? Response.json({ detail: acceptError }, { status: 409 }) : Response.json({ id: 'trade' });
    throw new Error('Unexpected request: ' + url);
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows amount, balance and shortfall without creating an invoice or accepting', async () => {
  await render();
  expect(text()).toContain('Savdo summasi'); expect(text()).toContain('Hamyoningizda'); expect(text()).toContain('Yetishmayapti');
  expect(text()).toContain('25 000'); expect(text()).toContain('10 000'); expect(text()).toContain('15 000');
  expect(button('to‘ldirish')).toBeDefined();
  expect(calls('/invoices')).toHaveLength(0); expect(calls('/accept')).toHaveLength(0);
});
it('funded buyers explicitly pay and start without any invoice', async () => {
  available = 2500000;
  await render();
  await click('to‘lash va boshlash');
  expect(calls('/accept')).toHaveLength(1); expect(calls('/invoices')).toHaveLength(0);
  expect(context.handleProposalAccepted).toHaveBeenCalledOnce();
});
it('creates only the shortfall on an explicit top-up click and stays in chat', async () => {
  await render();
  const href = window.location.href;
  await click('to‘ldirish');
  expect(JSON.parse(calls('/invoices')[0][1]!.body as string)).toEqual({ amountUzs: 15000 });
  expect(text()).toContain('Quyidagi kartaga o‘tkazing'); expect(text()).toContain('15 001');
  expect(window.location.href).toBe(href); expect(calls('/accept')).toHaveLength(0);
});
it('returns to explicit trade confirmation after payment is credited', async () => {
  await render(); await click('to‘ldirish');
  available = 2500000; status = 'PAID'; invoice = null;
  await act(async () => { vi.advanceTimersByTime(4000); });
  expect(text()).toContain('Hamyon to‘ldirildi');
  expect(button('to‘lash va boshlash')).toBeDefined();
  expect(calls('/accept')).toHaveLength(0);
  await click('to‘lash va boshlash'); expect(calls('/accept')).toHaveLength(1);
});
it('recovers an existing invoice without creating another one', async () => {
  invoice = makeInvoice();
  await render();
  expect(text()).toContain('Quyidagi kartaga o‘tkazing');
  expect(calls('/invoices')).toHaveLength(0);
});
it('refreshes the balance when returning from a banking app', async () => {
  await render(); available = 2500000;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(button('to‘lash va boshlash')).toBeDefined(); expect(calls('/accept')).toHaveLength(0);
});
it('blocks payment while wallet is unavailable and supports retry', async () => {
  walletFails = true; await render();
  expect(text()).toContain('Hamyon holatini');
  expect(button('to‘lash va boshlash')).toBeUndefined(); expect(button('to‘ldirish')).toBeUndefined();
  walletFails = false; await click('Qayta urinish'); expect(button('to‘ldirish')).toBeDefined();
});
it('displays invoice creation errors inside the dialog', async () => {
  invoiceFails = true; await render(); await click('to‘ldirish');
  expect(text()).toContain('To‘ldirish vaqtincha ishlamayapti'); expect(calls('/accept')).toHaveLength(0);
});
it('refreshes a stale balance after insufficient-funds rejection without creating an invoice', async () => {
  available = 2500000; await render(); available = 1000000; acceptError = 'Mablag‘ yetarli emas';
  await click('to‘lash va boshlash');
  expect(button('to‘ldirish')).toBeDefined(); expect(calls('/invoices')).toHaveLength(0);
});
it('explains the deposit minimum when the shortfall is less than 1000', async () => {
  available = 2499900; await render();
  expect(text()).toContain('Eng kam to‘ldirish');
  await click('to‘ldirish');
  expect(JSON.parse(calls('/invoices')[0][1]!.body as string)).toEqual({ amountUzs: 1000 });
});
it('blocks top-up and acceptance when the offer expires while open', async () => {
  context.proposal!.expiresAt = new Date(Date.now() + 1000).toISOString();
  await render(); await act(async () => { vi.advanceTimersByTime(1001); });
  expect(text()).toContain('Taklif muddati tugagan');
  expect(button('to‘ldirish')).toBeUndefined(); expect(button('to‘lash va boshlash')).toBeUndefined();
});
it.each(['HUMAN', 'SWAP', 'SELLER'])('does not ask for a buyer wallet payment in %s flow', async mode => {
  if (mode === 'HUMAN') { context.proposal!.mode = 'HUMAN'; context.proposal!.adminId = 'admin'; }
  if (mode === 'SWAP') { context.proposal!.kind = 'SWAP'; context.proposal!.priceUzs = 0; }
  if (mode === 'SELLER') { context.viewerId = 'seller'; context.proposal!.proposerUserId = 'buyer'; }
  await render();
  expect(calls('/wallet', 'GET')).toHaveLength(0); expect(button('to‘ldirish')).toBeUndefined();
  await click('Tasdiqlash'); expect(calls('/accept')).toHaveLength(1);
});
it('keeps transfer instructions when polling removes an expired offer', async () => {
  await render(); await click('to‘ldirish');
  context.proposal = null;
  await render();
  expect(text()).toContain('Quyidagi kartaga o‘tkazing');
  expect(text()).toContain('Taklif endi faol emas');
  expect(button('to‘lash va boshlash')).toBeUndefined();
});
it('does not switch the payment dialog to a replacement offer', async () => {
  await render(); await click('to‘ldirish');
  context.proposal = { ...context.proposal!, id: 'replacement', priceUzs: 50000 };
  await render();
  expect(text()).toContain('Quyidagi kartaga o‘tkazing');
  expect(text()).toContain('Taklif endi faol emas');
  expect(text()).not.toContain('50 000');
});
it('requires reviewing the new shortfall if the wallet changed before top-up', async () => {
  await render(); available = 0; await click('to‘ldirish');
  expect(calls('/invoices')).toHaveLength(0);
  expect(button('to‘ldirish')?.textContent).toContain('25 000');
  await click('to‘ldirish');
  expect(JSON.parse(calls('/invoices')[0][1]!.body as string)).toEqual({ amountUzs: 25000 });
});
it('does not charge automatically when a deposit arrives just before top-up', async () => {
  await render(); available = 2500000; await click('to‘ldirish');
  expect(calls('/invoices')).toHaveLength(0); expect(calls('/accept')).toHaveLength(0);
  expect(button('to‘lash va boshlash')).toBeDefined();
});
it('makes one invoice request for repeated clicks', async () => {
  await render();
  await act(async () => { button('to‘ldirish')!.click(); button('to‘ldirish')!.click(); });
  expect(calls('/invoices')).toHaveLength(1);
});
it('still requires a fresh balance after a successful invoice payment', async () => {
  await render(); await click('to‘ldirish');
  walletFails = true; status = 'PAID'; invoice = null;
  await act(async () => { vi.advanceTimersByTime(4000); });
  expect(button('to‘lash va boshlash')).toBeUndefined(); expect(calls('/accept')).toHaveLength(0);
  walletFails = false; available = 2500000; await click('Qayta urinish');
  expect(button('to‘lash va boshlash')).toBeDefined();
});
it('does not let a stale invoice lookup hide the newly created transfer', async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let finishLookup!: (response: Response) => void;
  let lookups = 0;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).endsWith('/active') && ++lookups === 1) return new Promise(resolve => { finishLookup = resolve; });
    return original(input, init);
  });
  await render(); await click('to‘ldirish');
  await act(async () => finishLookup(new Response(null, { status: 204 })));
  expect(text()).toContain('Quyidagi kartaga o‘tkazing');
  expect(calls('/invoices')).toHaveLength(1);
});
it('lets the buyer close the dialog without creating an invoice or accepting', async () => {
  await render(); await click('Yopish');
  expect(context.setShowAcceptModal).toHaveBeenCalledWith(false);
  expect(calls('/invoices')).toHaveLength(0); expect(calls('/accept')).toHaveLength(0);
});
