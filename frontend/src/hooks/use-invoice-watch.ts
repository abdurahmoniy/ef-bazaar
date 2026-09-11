'use client';

import { useEffect, useRef } from 'react';

import { getInvoiceStatus } from '@/lib/payment-client';
import type { InvoiceStatusResponse } from '@/lib/payment-types';

/** How often an open page asks whether the transfer has landed. */
export const POLL_INTERVAL_MS = 4_000;

/**
 * Statuses that can never change again.
 *
 * `EXPIRED` belongs here for a reason that is easy to get wrong: a late
 * transfer does NOT flip an expired invoice to PAID. The sweeper writes
 * EXPIRED, and `markPaidIfPending` only matches PENDING — a payment arriving
 * afterwards becomes an unmatched credit an admin attributes by hand. So
 * polling past expiry would ask a question whose answer can no longer move.
 */
export function isSettled(status: InvoiceStatusResponse['status']): boolean {
  return status !== 'PENDING';
}

interface UseInvoiceWatchOptions {
  /** The invoice to watch, or null when there is nothing to wait for. */
  invoiceId: string | null;
  onPaid: (creditedTiyin: number) => void;
}

/**
 * Asks, every few seconds, whether the transfer has arrived.
 *
 * <p>Before this, nothing on the page ever asked again: a deposit credited
 * seconds after the user left their banking app only appeared on a full reload.
 *
 * <p>Two things beyond the bare interval, both of which matter more than it
 * does:
 *
 * <ul>
 *   <li><b>It stops while the tab is hidden</b> and asks once, immediately, on
 *       the way back. That is the actual shape of this flow — the user leaves
 *       for their banking app and returns — so the return is when the answer
 *       has most likely changed, and the minutes away are when asking is
 *       pure waste.
 *   <li><b>It stops for good once the invoice settles.</b> A page left open on
 *       a finished invoice must not keep asking forever.
 * </ul>
 *
 * <p>A failed poll is ignored rather than surfaced. The next one is four
 * seconds away, and an error banner for a request the user never made would
 * only alarm somebody whose money is fine.
 */
export function useInvoiceWatch({ invoiceId, onPaid }: UseInvoiceWatchOptions): void {
  // Held in a ref rather than listed as a dependency: an inline arrow at the
  // call site changes identity every render, and with it in the dependency
  // list the interval would be torn down and rebuilt on each one.
  const handler = useRef(onPaid);
  handler.current = onPaid;

  useEffect(() => {
    if (!invoiceId || typeof document === 'undefined') return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const poll = async () => {
      if (stopped) return;
      let result: InvoiceStatusResponse;
      try {
        result = await getInvoiceStatus(invoiceId);
      } catch {
        return; // Try again on the next tick.
      }
      if (stopped || !isSettled(result.status)) return;

      // Settled either way: stop asking. Only PAID is news.
      stopped = true;
      stop();
      if (result.status === 'PAID') {
        handler.current(result.creditedTiyin ?? 0);
      }
    };

    const start = () => {
      if (stopped || timer) return;
      timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      // The user is back from their banking app — the single most likely
      // moment for the answer to have changed. Ask now, then resume.
      void poll();
      start();
    };

    if (!document.hidden) {
      void poll();
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [invoiceId]);
}
