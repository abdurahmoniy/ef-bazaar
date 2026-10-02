import 'server-only';

import { apiFetch } from './api';
import {
  loadMarketplacePage,
  MarketplaceLoadError,
  type MarketplaceMode,
  type MarketplacePageRequest,
  type MarketplacePageResult,
  type MarketplaceTransport,
} from './marketplace-page-loader';

function withQuery(path: string, params?: URLSearchParams) {
  const query = params?.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * rec chaqiruvlari chegaralangan: sekin rec (o'lik emas) login qilgan har foydalanuvchining default
 * sahifasini nginx'ning 60 s timeout'igacha ushlab turmasin — muddat o'tsa yuklovchi Katta bozorga o'tadi.
 */
export const REC_TIMEOUT_MS = 2500;

export const serverMarketplaceTransport: MarketplaceTransport = {
  marketplaceGet: (path, params) => apiFetch(withQuery(`/marketplace/${path}`, params)),
  marketplacePost: (path, body) => apiFetch(`/marketplace/${path}`, { method: 'POST', body }),
  recGet: (path, params) =>
    apiFetch(withQuery(`/rec/${path}`, params), { signal: AbortSignal.timeout(REC_TIMEOUT_MS) }),
};

export type MarketplacePageLoad =
  | { ok: true; data: MarketplacePageResult }
  | { ok: false; mode: MarketplaceMode };

export async function loadMarketplacePageResult(request: MarketplacePageRequest): Promise<MarketplacePageLoad> {
  try {
    return { ok: true, data: await loadMarketplacePage(serverMarketplaceTransport, request) };
  } catch (error) {
    const mode = error instanceof MarketplaceLoadError ? error.mode : 'market';
    console.error(`[marketplace-page] ${mode} failed:`, error instanceof Error ? error.cause ?? error.message : error);
    return { ok: false, mode };
  }
}
