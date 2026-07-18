/**
 * Access token muddati tugaganda refresh token orqali yangi juftlik olish.
 *
 * Proxy (middleware) qatlamidan chaqiriladi — Server Component'lar cookie yoza
 * olmaydi, shuning uchun refresh faqat shu yerda bo'ladi.
 *
 * Backend refresh'da ROTATSIYA qiladi: eski refresh token darhol blacklist'ga
 * tushadi. Parallel so'rovlar (masalan, Next.js link prefetch) bitta tokenni
 * ikki marta ishlatsa, ikkinchisi 401 olib user'ni bekorga logout qilardi —
 * shuning uchun bir xil token uchun in-flight promise'ni bo'lishamiz.
 */

const BASE = process.env.INTERNAL_API_BASE_URL || 'http://nginx/api';
const REFRESH_TIMEOUT_MS = 5_000;

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export type RefreshResult =
  | { ok: true; tokens: RefreshedTokens }
  /**
   * definitive=true — token yaroqsiz (blacklist, muddati o'tgan, user o'chgan):
   * cookie'larni tozalash kerak. definitive=false — vaqtinchalik xato (tarmoq,
   * 5xx): cookie'larga tegilmaydi, keyingi so'rovda qayta uriniladi.
   */
  | { ok: false; definitive: boolean };

const inflight = new Map<string, Promise<RefreshResult>>();

export function refreshSession(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const promise = doRefresh(refreshToken, fetchImpl).finally(() => {
    inflight.delete(refreshToken);
  });
  inflight.set(refreshToken, promise);
  return promise;
}

async function doRefresh(
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/auth/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, definitive: false };
  }

  if (!res.ok) {
    return { ok: false, definitive: res.status >= 400 && res.status < 500 };
  }

  let tokens: RefreshedTokens;
  try {
    tokens = (await res.json()) as RefreshedTokens;
  } catch {
    return { ok: false, definitive: false };
  }

  if (!tokens?.accessToken || !tokens?.refreshToken) {
    return { ok: false, definitive: false };
  }
  return { ok: true, tokens };
}
