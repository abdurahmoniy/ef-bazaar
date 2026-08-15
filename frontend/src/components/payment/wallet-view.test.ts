// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletView } from './wallet-view';
import type {
  InvoiceResponse,
  WalletEntryResponse,
  WalletResponse,
} from '@/lib/payment-types';

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
const clientMocks = vi.hoisted(() => ({
  createInvoice: vi.fn(),
  getWalletHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerMocks.refresh }),
}));

vi.mock('@/lib/payment-client', () => ({
  createInvoice: clientMocks.createInvoice,
  getWalletHistory: clientMocks.getWalletHistory,
}));

const NOW = '2026-08-13T09:00:00Z';
const PAN = '9860123456789012';
const PAN_ON_SCREEN = '9860 1234 5678 9012';

const wallet: WalletResponse = {
  availableTiyin: 0,
  heldTiyin: 0,
  withdrawPendingTiyin: 0,
  lifetimeDepositedTiyin: 0,
  lifetimeEarnedTiyin: 0,
};

function invoice(overrides: Partial<InvoiceResponse> = {}): InvoiceResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    pan: PAN,
    holderName: 'EFBAZAAR MCHJ',
    cardExpiry: '12/29',
    requestedTiyin: 10_000_000,
    transferTiyin: 10_000_000,
    // Two seconds of runway, so a single advance crosses zero.
    expiresAt: '2026-08-13T09:00:02Z',
    status: 'PENDING',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  routerMocks.refresh.mockReset();
  clientMocks.createInvoice.mockReset();
  clientMocks.getWalletHistory.mockReset().mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderView(
  initialInvoice: InvoiceResponse | null,
  history: WalletEntryResponse[] = [],
) {
  await act(async () => {
    root.render(createElement(WalletView, { wallet, initialInvoice, history }));
  });
}

async function runOutTheClock() {
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
}

function text() {
  return container.textContent ?? '';
}

function buttonLabelled(label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.includes(label),
  );
}

describe('WalletView — the invoice past its deadline', () => {
  it('keeps the card number on screen after the countdown reaches zero', async () => {
    await renderView(invoice());
    expect(text()).toContain(PAN_ON_SCREEN);

    await runOutTheClock();

    // A user who was in their banking app at T+15:00 comes back to a page that
    // still tells them where the money was supposed to go. Hiding it is how a
    // second transfer gets sent.
    expect(text()).toContain(PAN_ON_SCREEN);
    expect(text()).toContain('00:00');
    expect(text()).toContain('Muddat tugadi');
  });

  it('does not swap in the top-up form on its own', async () => {
    await renderView(invoice());
    await runOutTheClock();

    // The backend still holds the PENDING row for up to one sweeper pass, so a
    // preset tapped here answers a bare 409.
    expect(text()).not.toContain('Hamyonni to‘ldirish');
  });

  it('still refreshes the server data, so a late deposit shows up', async () => {
    await renderView(invoice());
    await runOutTheClock();

    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it('offers a new request only once the invoice is dead', async () => {
    await renderView(invoice());
    expect(buttonLabelled('Yangi so‘rov')).toBeUndefined();

    await runOutTheClock();

    expect(buttonLabelled('Yangi so‘rov')).toBeDefined();
  });

  it('hands the top-up form back when the user asks for it', async () => {
    await renderView(invoice());
    await runOutTheClock();

    await act(async () => {
      buttonLabelled('Yangi so‘rov')!.click();
    });

    expect(text()).toContain('Hamyonni to‘ldirish');
    expect(text()).not.toContain(PAN_ON_SCREEN);
  });

  it('starts on the top-up form when there is no invoice at all', async () => {
    await renderView(null);
    expect(text()).toContain('Hamyonni to‘ldirish');
  });
});

describe('WalletView — history', () => {
  function entry(overrides: Partial<WalletEntryResponse> = {}): WalletEntryResponse {
    return {
      transactionId: '22222222-2222-4222-8222-222222222222',
      account: 'USER_AVAILABLE',
      amountTiyin: -10_000_000,
      kind: 'DEPOSIT',
      createdAt: '2026-08-13T08:00:00Z',
      ...overrides,
    };
  }

  it('renders two entries of one transaction without colliding React keys', async () => {
    // WalletEntryResponse is one row per ledger entry and carries no entry id,
    // so the transaction id alone is not unique.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});

    await renderView(null, [entry(), entry({ amountTiyin: -5_000_000 })]);

    const collisions = warn.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('same key')),
    );
    expect(collisions).toEqual([]);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});
