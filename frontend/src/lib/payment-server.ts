import 'server-only';

import { apiFetch, ApiException } from './api';
import type {
  InvoiceResponse,
  WalletEntryResponse,
  WalletResponse,
} from './payment-types';

/**
 * payment-service through internal nginx. `/payment/` is stripped there, so
 * `/payment/v1/payments/wallet` lands on payment-service's
 * `/api/v1/payments/wallet` — the same hop the browser proxy route uses.
 */
const PREFIX = '/payment/v1/payments';

function report(path: string, error: unknown): null {
  if (error instanceof ApiException) {
    // Never interpolate a response body here: an invoice payload carries the
    // full PAN and this line goes to the server log.
    console.error(`[payment-server] ${path} → ${error.status} ${error.code ?? ''}`);
    return null;
  }
  console.error(`[payment-server] ${path} → network error:`, error);
  return null;
}

export async function getWallet(): Promise<WalletResponse | null> {
  try {
    return await apiFetch<WalletResponse>(`${PREFIX}/wallet`);
  } catch (error) {
    return report(`${PREFIX}/wallet`, error);
  }
}

/**
 * The caller's live invoice, or null when there is none.
 *
 * `GET /invoices/active` answers **204 No Content** when nothing is pending —
 * `apiFetch` turns that into `undefined` rather than throwing, so the `??`
 * below is the branch that actually fires. A 404 would throw and is handled
 * as "no invoice" too.
 */
export async function getActiveInvoiceSSR(): Promise<InvoiceResponse | null> {
  const path = `${PREFIX}/invoices/active`;
  try {
    return (await apiFetch<InvoiceResponse | undefined>(path)) ?? null;
  } catch (error) {
    if (error instanceof ApiException && error.status === 404) return null;
    return report(path, error);
  }
}

/** Newest first. Empty when the endpoint is unreachable — the page still renders. */
export async function getWalletHistorySSR(limit = 50): Promise<WalletEntryResponse[]> {
  const path = `${PREFIX}/wallet/transactions?limit=${limit}`;
  try {
    return await apiFetch<WalletEntryResponse[]>(path);
  } catch (error) {
    return report(path, error) ?? [];
  }
}
