import 'server-only';

import { apiFetch, ApiException } from './api';
import type { FetchResult } from './marketplace-server';
import type { SmartTradeDetail, SmartTradeRow } from './smart-trade-admin-types';

/**
 * SSR reads for "Faol savdolar". `/trade/v1/admin/smart-trades` lands on
 * trade-service's `/api/v1/admin/smart-trades` through internal nginx, the
 * same hop `mailbox-admin-server.ts` uses.
 */
const PREFIX = '/trade/v1/admin/smart-trades';

async function safeFetch<T>(path: string): Promise<FetchResult<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path) };
  } catch (error) {
    if (error instanceof ApiException) {
      console.error(`[smart-trade-admin-server] ${path} → ${error.status} ${error.code ?? ''}`);
      return {
        ok: false,
        error: {
          path,
          status: error.status,
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[smart-trade-admin-server] ${path} → network error:`, message);
    return { ok: false, error: { path, status: 0, message, networkError: true } };
  }
}

export async function getActiveSmartTrades(): Promise<FetchResult<SmartTradeRow[]>> {
  return safeFetch<SmartTradeRow[]>(PREFIX);
}

export async function getSmartTrade(id: string): Promise<FetchResult<SmartTradeDetail>> {
  return safeFetch<SmartTradeDetail>(`${PREFIX}/${encodeURIComponent(id)}`);
}
