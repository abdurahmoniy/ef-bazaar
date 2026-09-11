// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POLL_INTERVAL_MS, isSettled, useInvoiceWatch } from './use-invoice-watch';

const clientMocks = vi.hoisted(() => ({ getInvoiceStatus: vi.fn() }));
vi.mock('@/lib/payment-client', () => clientMocks);

const INVOICE = '11111111-1111-4111-8111-111111111111';

let container: HTMLDivElement;
let root: Root;
let hidden = false;

function Probe({ invoiceId, onPaid }: { invoiceId: string | null; onPaid: (n: number) => void }) {
  useInvoiceWatch({ invoiceId, onPaid });
  return null;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  clientMocks.getInvoiceStatus.mockReset();
  clientMocks.getInvoiceStatus.mockResolvedValue({ id: INVOICE, status: 'PENDING' });
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function render(invoiceId: string | null, onPaid = vi.fn()) {
  await act(async () => root.render(createElement(Probe, { invoiceId, onPaid })));
  return onPaid;
}

/** Advance the clock and let the awaited fetch settle. */
async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

describe('isSettled', () => {
  it('treats anything but PENDING as final', () => {
    expect(isSettled('PENDING')).toBe(false);
    expect(isSettled('PAID')).toBe(true);
    expect(isSettled('CANCELLED')).toBe(true);
  });

  /**
   * EXPIRED is final, and this is the subtle one: a late transfer does NOT
   * flip an expired invoice to PAID. The sweeper writes EXPIRED and
   * markPaidIfPending only matches PENDING, so polling past expiry asks a
   * question whose answer can no longer move.
   */
  it('treats EXPIRED as final too', () => {
    expect(isSettled('EXPIRED')).toBe(true);
  });
});

describe('useInvoiceWatch', () => {
  it('asks immediately rather than waiting out the first interval', async () => {
    await render(INVOICE);
    await act(async () => {});

    expect(clientMocks.getInvoiceStatus).toHaveBeenCalledWith(INVOICE);
    expect(clientMocks.getInvoiceStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps asking while the invoice is pending', async () => {
    await render(INVOICE);
    await tick(POLL_INTERVAL_MS * 3);

    expect(clientMocks.getInvoiceStatus.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('reports what reached the wallet once it is paid', async () => {
    clientMocks.getInvoiceStatus.mockResolvedValue({
      id: INVOICE, status: 'PAID', creditedTiyin: 10_000_000,
    });
    const onPaid = await render(INVOICE);
    await act(async () => {});

    expect(onPaid).toHaveBeenCalledWith(10_000_000);
  });

  it('stops asking once the invoice has settled', async () => {
    clientMocks.getInvoiceStatus.mockResolvedValue({
      id: INVOICE, status: 'PAID', creditedTiyin: 500,
    });
    await render(INVOICE);
    await act(async () => {});
    const afterSettle = clientMocks.getInvoiceStatus.mock.calls.length;

    await tick(POLL_INTERVAL_MS * 5);

    expect(clientMocks.getInvoiceStatus.mock.calls.length).toBe(afterSettle);
  });

  it('says nothing when the invoice expires instead of being paid', async () => {
    clientMocks.getInvoiceStatus.mockResolvedValue({ id: INVOICE, status: 'EXPIRED' });
    const onPaid = await render(INVOICE);
    await tick(POLL_INTERVAL_MS * 3);

    expect(onPaid).not.toHaveBeenCalled();
  });

  it('asks nothing at all without an invoice to wait for', async () => {
    await render(null);
    await tick(POLL_INTERVAL_MS * 3);

    expect(clientMocks.getInvoiceStatus).not.toHaveBeenCalled();
  });

  /** A failed poll is the next poll's problem, not the user's. */
  it('survives a failed poll and asks again', async () => {
    clientMocks.getInvoiceStatus
      .mockRejectedValueOnce(new Error('tarmoq'))
      .mockResolvedValue({ id: INVOICE, status: 'PAID', creditedTiyin: 700 });
    const onPaid = await render(INVOICE);
    await act(async () => {});
    expect(onPaid).not.toHaveBeenCalled();

    await tick(POLL_INTERVAL_MS);

    expect(onPaid).toHaveBeenCalledWith(700);
  });

  it('stops asking while the tab is hidden', async () => {
    await render(INVOICE);
    await act(async () => {});
    const beforeHiding = clientMocks.getInvoiceStatus.mock.calls.length;

    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await tick(POLL_INTERVAL_MS * 5);

    expect(clientMocks.getInvoiceStatus.mock.calls.length).toBe(beforeHiding);
  });

  /**
   * The shape of this flow: the user leaves for their banking app and comes
   * back. The moment they return is when the answer has most likely changed,
   * so it is asked at once rather than up to four seconds later.
   */
  it('asks at once when the user comes back to the tab', async () => {
    await render(INVOICE);
    await act(async () => {});
    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const beforeReturning = clientMocks.getInvoiceStatus.mock.calls.length;

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {});

    expect(clientMocks.getInvoiceStatus.mock.calls.length).toBe(beforeReturning + 1);
  });

  it('asks nothing more once the page is gone', async () => {
    await render(INVOICE);
    await act(async () => {});
    await act(async () => root.unmount());
    const afterUnmount = clientMocks.getInvoiceStatus.mock.calls.length;

    await tick(POLL_INTERVAL_MS * 5);

    expect(clientMocks.getInvoiceStatus.mock.calls.length).toBe(afterUnmount);
    // The unmount above already ran; give afterEach a live root to unmount.
    root = createRoot(container);
  });
});
