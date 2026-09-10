'use client';

import type { PlatformCardCreateRequest } from './platform-card-draft';
import type {
  ObservationResponse,
  PaymentAnalyticsOverview,
  PlatformCardResponse,
  TradeCommissionConfig,
  UpdateTradeCommissionConfigRequest,
  UserbotStatusResponse,
} from './payment-types';

/**
 * Browser-side admin payment calls. Same hop as `payment-client.ts`: the
 * same-origin proxy at `/api/payment/[...path]` attaches the httpOnly
 * access_token cookie, nginx strips `/payment/`, payment-service sees
 * `/api/v1/admin/payments/...` and its `@PreAuthorize("hasAuthority('ROLE_ADMIN')")`
 * is the authority on who may call these.
 */
const BASE = '/api/payment/v1/admin/payments';

/**
 * Carries the HTTP status alongside the message. It extends `Error`, so the
 * callers that only read `.message` are unaffected — but the unmatched queue
 * has to tell a 409 (somebody else already handled that row, so it is simply
 * gone) apart from a real failure, and a bare `Error` cannot say which it was.
 */
export class PaymentAdminError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PaymentAdminError';
    this.status = status;
  }
}

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
    throw new PaymentAdminError(
      res.status,
      body.detail || body.message || `So'rov bajarilmadi (${res.status})`,
    );
  }
  // deactivate / activate / reorder answer 200 with an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export function listPlatformCards(): Promise<PlatformCardResponse[]> {
  return call<PlatformCardResponse[]>('/cards');
}

/**
 * The one call that carries a full PAN. `req` goes straight out — do not log
 * it, do not put it in an Error, do not keep a copy.
 */
export function createPlatformCard(
  req: PlatformCardCreateRequest,
): Promise<PlatformCardResponse> {
  return call<PlatformCardResponse>('/cards', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function deactivateCard(id: string): Promise<void> {
  return call<void>(`/cards/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
}

export function activateCard(id: string): Promise<void> {
  return call<void>(`/cards/${encodeURIComponent(id)}/activate`, { method: 'POST' });
}

/** Must be every active card, in the wanted order — the backend rejects a subset. */
export function reorderCards(ids: string[]): Promise<void> {
  return call<void>('/cards/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedIds: ids }),
  });
}

/**
 * Removes a card that never took a payment. A card with history answers 409 —
 * the caller shows that message rather than retrying, because deactivating is
 * the operation for that one and the backend will keep refusing this.
 */
export function deletePlatformCard(id: string): Promise<void> {
  return call<void>(`/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getPaymentAnalytics(): Promise<PaymentAnalyticsOverview> {
  return call<PaymentAnalyticsOverview>('/analytics/overview');
}

export function listUnmatched(): Promise<ObservationResponse[]> {
  return call<ObservationResponse[]>('/observations/unmatched');
}

/** `note` is mandatory: an admin crediting a wallet by hand must say why. */
export function resolveObservation(
  id: string,
  userId: string,
  note: string,
): Promise<ObservationResponse> {
  return call<ObservationResponse>(`/observations/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ userId, note }),
  });
}

export function ignoreObservation(id: string, note?: string): Promise<ObservationResponse> {
  return call<ObservationResponse>(`/observations/${encodeURIComponent(id)}/ignore`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? null }),
  });
}

export function getUserbotStatus(): Promise<UserbotStatusResponse> {
  return call<UserbotStatusResponse>('/userbot');
}

export function getTradeCommissionConfig(): Promise<TradeCommissionConfig> {
  return call<TradeCommissionConfig>('/commission');
}

export function updateTradeCommissionConfig(
  req: UpdateTradeCommissionConfigRequest
): Promise<TradeCommissionConfig> {
  return call<TradeCommissionConfig>('/commission', {
    method: 'PUT',
    body: JSON.stringify(req),
  });
}

/**
 * Qo'lda hal qilingan tushumlar tarixi.
 *
 * <p>Biriktirish qaytarib bo'lmaydi, ya'ni "buni kim qildi" degan savol
 * keyinroq albatta chiqadi va u paytda javob tayyor turishi kerak.
 */
export function listResolvedObservations(): Promise<ObservationResponse[]> {
  return call<ObservationResponse[]>('/observations/resolved');
}
