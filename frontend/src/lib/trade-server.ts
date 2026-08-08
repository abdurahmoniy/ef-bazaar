import 'server-only';

import { apiFetch, ApiException } from './api';
import type {
  CardResponse,
  EscalatedTradeResponse,
  PendingProposalResponse,
  TradeAdminCardResponse,
  TradeAdminProfileResponse,
  TradeAdminRatingResponse,
  TradeAdminSort,
  TradePage,
  TradeMessageResponse,
  TradeResponse,
  TradeStepResponse,
} from './trade-types';

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

/**
 * Every trade the caller is a party to, newest first. Backs the profile's
 * "Savdolarim" tab — until this existed a trade was only reachable through the
 * chat it started in, so an escrow deal with a running deadline could only be
 * found by remembering which thread it belonged to.
 */
export async function getMyTrades(limit = 20, offset = 0): Promise<TradePage> {
  const data = await safeGet<TradePage>(
    `${TRADE_PREFIX}/trades?limit=${limit}&offset=${offset}`,
  );
  return data ?? { items: [], total: 0, limit, offset };
}

/** Cards saved to the caller's profile — used to pre-fill the trade card picker. */
export async function getMyCards(): Promise<CardResponse[]> {
  return (await safeGet<CardResponse[]>(`${TRADE_PREFIX}/cards`)) ?? [];
}

export async function getTradeAdmins(
  q?: string,
  sort: TradeAdminSort = 'DEFAULT',
): Promise<TradeAdminCardResponse[]> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (sort) params.set('sort', sort);
  const query = params.toString();
  return (await safeGet<TradeAdminCardResponse[]>(
    `${TRADE_PREFIX}/trade-admins${query ? `?${query}` : ''}`,
  )) ?? [];
}

export async function getTradeAdminProfile(
  userId: string,
): Promise<TradeAdminProfileResponse | null> {
  return await safeGet<TradeAdminProfileResponse>(
    `${TRADE_PREFIX}/trade-admins/${encodeURIComponent(userId)}`,
  );
}

export async function getTradeAdminRatings(
  userId: string,
): Promise<TradeAdminRatingResponse[]> {
  return (await safeGet<TradeAdminRatingResponse[]>(
    `${TRADE_PREFIX}/trade-admins/${encodeURIComponent(userId)}/ratings`,
  )) ?? [];
}

export async function getMyTradeAdminProfile(): Promise<TradeAdminProfileResponse | null> {
  return await safeGet<TradeAdminProfileResponse>(`${TRADE_PREFIX}/trade-admins/me`);
}

export async function getMyTradeAdminInvitations(): Promise<TradeResponse[]> {
  return (await safeGet<TradeResponse[]>(
    `${TRADE_PREFIX}/trade-admins/me/invitations`,
  )) ?? [];
}

export async function getMyTradeAdminTrades(): Promise<TradeResponse[]> {
  return (await safeGet<TradeResponse[]>(`${TRADE_PREFIX}/trade-admins/me/trades`)) ?? [];
}

export async function getTradeById(id: string): Promise<TradeResponse | null> {
  return await safeGet<TradeResponse>(`${TRADE_PREFIX}/trades/${encodeURIComponent(id)}`);
}

export async function getTradeSteps(id: string): Promise<TradeStepResponse[]> {
  return (await safeGet<TradeStepResponse[]>(
    `${TRADE_PREFIX}/trades/${encodeURIComponent(id)}/steps`,
  )) ?? [];
}

export async function getTradeMessages(
  id: string,
  target?: 'SELLER' | 'BUYER',
): Promise<TradeMessageResponse[]> {
  const params = target ? `?target=${target}` : '';
  return (await safeGet<TradeMessageResponse[]>(
    `${TRADE_PREFIX}/trades/${encodeURIComponent(id)}/messages${params}`,
  )) ?? [];
}

export async function getEscalatedHumanTrades(): Promise<EscalatedTradeResponse[]> {
  return (await safeGet<EscalatedTradeResponse[]>(
    `${TRADE_PREFIX}/admin/trades/escalated`,
  )) ?? [];
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
