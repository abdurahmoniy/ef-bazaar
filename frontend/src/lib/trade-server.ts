import 'server-only';

import { apiFetch, ApiException } from './api';
import type { CardResponse, PendingProposalResponse, TradeResponse } from './trade-types';

/**
 * trade-service is exposed at `/api/v1/...` in nginx (no service prefix like
 * `/marketplace/`), so we call the raw path via `apiFetch`, which prepends
 * INTERNAL_API_BASE_URL (`http://nginx:8080/api`).
 */
const TRADE_PREFIX = '/trade/v1';

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch (error) {
    if (error instanceof ApiException) {
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        return null;
      }
      console.error(
        `[trade-server] ${path} → ${error.status} ${error.code ?? ''}: ${error.message}`,
      );
      return null;
    }
    console.error(`[trade-server] ${path} → network error:`, error);
    return null;
  }
}

/**
 * Trades in the given marketplace chat where the caller is a participant.
 * Newest first; the chat panel typically only shows the most recent.
 * Returns [] when the endpoint is unreachable or the caller isn't part of
 * any trade in this chat.
 */
export async function getTradesByChat(chatId: string): Promise<TradeResponse[]> {
  const encoded = encodeURIComponent(chatId);
  const data = await safeGet<TradeResponse[]>(`${TRADE_PREFIX}/trades?chatId=${encoded}`);
  return data ?? [];
}

/** Cards saved to the caller's profile — used to pre-fill the trade card picker. */
export async function getMyCards(): Promise<CardResponse[]> {
  return (await safeGet<CardResponse[]>(`${TRADE_PREFIX}/cards`)) ?? [];
}

/**
 * Look up the pending proposal for a marketplace chat. Server-side because
 * proposals live only in Redis with a 10-minute TTL and the buyer's browser
 * has no other source for them — without this the buyer would never see a
 * seller's proposal after a page refresh.
 *
 * Returns null when no proposal exists or the caller isn't a participant
 * (backend returns 404 in both cases so existence isn't leaked).
 */
export async function getPendingProposal(
  chatId: string,
): Promise<PendingProposalResponse | null> {
  const encoded = encodeURIComponent(chatId);
  return await safeGet<PendingProposalResponse>(
    `${TRADE_PREFIX}/trades/proposals?chatId=${encoded}`,
  );
}
