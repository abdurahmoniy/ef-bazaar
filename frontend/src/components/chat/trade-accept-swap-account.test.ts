// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TradePanel } from './trade-panel';
import { useTradeContext } from './trade-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./trade-context', () => ({ useTradeContext: vi.fn() }));
vi.mock('./swap-account-picker', () => ({
  SWAP_OTHER: 'OTHER',
  SwapAccountPicker: ({ onChange }: { onChange: (v: string) => void }) =>
    createElement('div', null,
      createElement('button', { type: 'button', onClick: () => onChange('acc-1') }, 'pick-acc'),
      createElement('button', { type: 'button', onClick: () => onChange('OTHER') }, 'pick-other')),
}));

let context: ReturnType<typeof useTradeContext>;
let root: Root;
let container: HTMLDivElement;
const button = (label: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
const calls = (suffix: string) => vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith(suffix) && init?.method === 'POST');
const acceptBody = () => JSON.parse(String(calls('/accept')[0][1]!.body));
const render = () => act(async () => root.render(createElement(TradePanel)));
const click = (label: string) => act(async () => { expect(button(label)).toBeDefined(); button(label)!.click(); });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  context = {
    chat: { id: 'chat' }, viewerId: 'buyer', trades: [], activeTrade: null, isDrawerOpen: false,
    proposal: { id: 'offer', sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', listingId: 'listing',
      priceUzs: 0, kind: 'SWAP', mode: 'SMART', expiresAt: new Date(Date.now() + 600000).toISOString() },
    listing: { id: 'listing', attributes: { platform: 'MOBILE' } }, showAcceptModal: true,
    setShowAcceptModal: vi.fn(), handleProposalAccepted: vi.fn(),
  } as unknown as ReturnType<typeof useTradeContext>;
  vi.mocked(useTradeContext).mockImplementation(() => context);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/accept')) return Response.json({ id: 'trade' });
    if (url.endsWith('/wallet')) return Response.json({ availableTiyin: 100000000 });
    if (url.endsWith('/invoices/active')) return new Response(null, { status: 204 });
    throw new Error('Unexpected request: ' + url);
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('blocks accepting a seller swap until an account or Other is picked', async () => {
  await render();
  expect(button('Tasdiqlash')!.disabled).toBe(true);
});

it('sends the picked account id', async () => {
  await render();
  await click('pick-acc');
  await click('Tasdiqlash');
  expect(acceptBody()).toEqual({ giveAccountId: 'acc-1' });
});

it('sends no account for Other', async () => {
  await render();
  await click('pick-other');
  await click('Tasdiqlash');
  expect(acceptBody()).toEqual({});
});

it('does not show the picker on a sale', async () => {
  context.proposal = { ...context.proposal!, kind: 'SALE', priceUzs: 50000 };
  await render();
  expect(button('pick-acc')).toBeUndefined();
});
