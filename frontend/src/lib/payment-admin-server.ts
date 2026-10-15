import 'server-only';

import { apiFetch, ApiException } from './api';
import type { WithdrawalTicket } from './withdrawal';
import type { PlanEntitlementRow, PlanPriceRow } from './plans-admin';
import type {
  CardMovement,
  ObservationResponse,
  PaymentAnalyticsOverview,
  PlatformCardResponse,
  TradeCommissionConfig,
  UserbotStatusResponse,
} from './payment-types';

/**
 * payment-service admin reads through internal nginx. `/payment/` is stripped
 * there, so `/payment/v1/admin/payments/cards` lands on payment-service's
 * `/api/v1/admin/payments/cards` — the same hop the browser proxy route uses.
 *
 * Every read returns `null` on failure rather than throwing: the admin page
 * renders its own message instead of a Next error boundary.
 */
const PREFIX = '/payment/v1/admin/payments';

function report(path: string, error: unknown): null {
  if (error instanceof ApiException) {
    // Status and code only. Payment response bodies are not safe to interpolate
    // into a server log — see payment-server.ts.
    console.error(`[payment-admin-server] ${path} → ${error.status} ${error.code ?? ''}`);
    return null;
  }
  console.error(`[payment-admin-server] ${path} → network error:`, error);
  return null;
}

/** Every card, active and deactivated, in `display_order`. Masked PANs only. */
export async function listPlatformCardsSSR(): Promise<PlatformCardResponse[] | null> {
  const path = `${PREFIX}/cards`;
  try {
    return await apiFetch<PlatformCardResponse[]>(path);
  } catch (error) {
    return report(path, error);
  }
}

/**
 * The finance dashboard's figures. Server-rendered so the page arrives with its
 * numbers already on it — an admin opening this screen is looking for one
 * total, not waiting for a spinner.
 */
export async function getPaymentAnalyticsSSR(): Promise<PaymentAnalyticsOverview | null> {
  const path = `${PREFIX}/analytics/overview`;
  try {
    return await apiFetch<PaymentAnalyticsOverview>(path);
  } catch (error) {
    return report(path, error);
  }
}

/**
 * The first page of card movements, server-rendered so the history is on the
 * page when it arrives. The client re-reads it when an admin picks a card.
 */
export async function listCardHistorySSR(): Promise<CardMovement[] | null> {
  const path = `${PREFIX}/cards/history`;
  try {
    return await apiFetch<CardMovement[]>(path);
  } catch (error) {
    return report(path, error);
  }
}

export async function listUnmatchedSSR(): Promise<ObservationResponse[] | null> {
  const path = `${PREFIX}/observations/unmatched`;
  try {
    return await apiFetch<ObservationResponse[]>(path);
  } catch (error) {
    return report(path, error);
  }
}

/**
 * The payout queue, oldest first.
 *
 * Lives under a different prefix from the rest of this file: withdrawals are
 * their own admin surface (`/admin/withdrawals`), not part of the card rail.
 */
export async function listWithdrawalsSSR(): Promise<WithdrawalTicket[] | null> {
  const path = '/payment/v1/admin/withdrawals';
  try {
    return await apiFetch<WithdrawalTicket[]>(path);
  } catch (error) {
    return report(path, error);
  }
}

export async function getUserbotStatusSSR(): Promise<UserbotStatusResponse | null> {
  const path = `${PREFIX}/userbot`;
  try {
    return await apiFetch<UserbotStatusResponse>(path);
  } catch (error) {
    return report(path, error);
  }
}

export async function getTradeCommissionConfigSSR(): Promise<TradeCommissionConfig | null> {
  const path = `${PREFIX}/commission`;
  try {
    return await apiFetch<TradeCommissionConfig>(path);
  } catch (error) {
    return report(path, error);
  }
}

export async function getPlanPricesSSR(): Promise<PlanPriceRow[] | null> {
  const path = '/payment/v1/admin/plans/prices';
  try {
    return await apiFetch<PlanPriceRow[]>(path);
  } catch (error) {
    return report(path, error);
  }
}

export async function getPlanEntitlementsSSR(): Promise<PlanEntitlementRow[] | null> {
  const path = '/payment/v1/admin/plans/entitlements';
  try {
    return await apiFetch<PlanEntitlementRow[]>(path);
  } catch (error) {
    return report(path, error);
  }
}
