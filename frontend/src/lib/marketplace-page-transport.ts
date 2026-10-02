import { buildMarketplaceApiPath, REC_API_BASE } from './marketplace-client-api';
import type { MarketplaceTransport } from './marketplace-page-loader';

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Brauzer: same-origin `/api/marketplace` va `/api/rec` proxy'lari orqali. `signal` — lenta
 * eskirganda (filtr o'zgardi, timeout) barcha ichki so'rovlarni bekor qilish uchun.
 */
export function createBrowserMarketplaceTransport(signal?: AbortSignal): MarketplaceTransport {
  const common: RequestInit = { credentials: 'include', cache: 'no-store', signal };
  return {
    marketplaceGet: async (path, params) =>
      readJson(await fetch(buildMarketplaceApiPath(path, params), common)),
    marketplacePost: async (path, body) =>
      readJson(await fetch(buildMarketplaceApiPath(path), {
        ...common,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })),
    recGet: async (path, params) =>
      readJson(await fetch(buildMarketplaceApiPath(path, params, REC_API_BASE), common)),
  };
}

export const browserMarketplaceTransport = createBrowserMarketplaceTransport();
