'use client';

import type {
  InvoiceResponse,
  WalletEntryResponse,
  WalletResponse,
} from './payment-types';

/**
 * Browser-side payment calls. They go through the same-origin proxy route at
 * `/api/payment/[...path]`, which attaches the httpOnly access_token cookie.
 */
const BASE = '/api/payment/v1/payments';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) {
    return null as T;
  }
  if (!res.ok) {
    // ProblemDetail carries `detail`; the proxy's own 502 carries `message`.
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `So'rov bajarilmadi (${res.status})`);
  }
  return (await res.json()) as T;
}

export function getWallet(): Promise<WalletResponse> {
  return call<WalletResponse>('/wallet');
}

export function getWalletHistory(limit = 50): Promise<WalletEntryResponse[]> {
  return call<WalletEntryResponse[]>(`/wallet/transactions?limit=${limit}`);
}

export function getActiveInvoice(): Promise<InvoiceResponse | null> {
  return call<InvoiceResponse | null>('/invoices/active');
}

export function createInvoice(amountUzs: number): Promise<InvoiceResponse> {
  return call<InvoiceResponse>('/invoices', {
    method: 'POST',
    body: JSON.stringify({ amountUzs }),
  });
}
