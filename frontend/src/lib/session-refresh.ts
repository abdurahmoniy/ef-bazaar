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

const BASE = process.env.INTERNAL_API_BASE_URL || 'http://nginx:8080/api';
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

/**
 * Tokens already issued for a refresh token that has since been rotated away.
 *
 * Sharing the in-flight promise is not enough on its own. A request that was
 * already travelling when the refresh completed still carries the old cookie —
 * the browser only learns the new one from a response it has not received yet.
 * It then asks to refresh a token the backend has just blacklisted, is refused,
 * and the user sees a bare 401 on whatever they clicked. That is how accepting
 * a proposal failed while a four-second poll ran alongside it.
 *
 * Answering those stragglers from here keeps them on the same session. The
 * window is deliberately short: this is a replay of a spent token, and it is
 * only tolerable because it never leaves this process and lasts seconds.
 */
const RECENT_TTL_MS = 30_000;
const recent = new Map<string, { result: RefreshResult; at: number }>();

function rememberedFor(refreshToken: string): RefreshResult | null {
  const hit = recent.get(refreshToken);
  if (!hit) return null;
  if (Date.now() - hit.at > RECENT_TTL_MS) {
    recent.delete(refreshToken);
    return null;
  }
  return hit.result;
}

function remember(refreshToken: string, result: RefreshResult) {
  // Only successes. A failure must stay repeatable — a network blip should not
  // pin the session to "broken" for half a minute.
  if (!result.ok) return;
  recent.set(refreshToken, { result, at: Date.now() });
  // Bounded without a timer: every write sweeps what has expired, and the map
  // only ever holds tokens rotated in the last few seconds.
  for (const [token, entry] of recent) {
    if (Date.now() - entry.at > RECENT_TTL_MS) recent.delete(token);
  }
}

export function refreshSession(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const already = rememberedFor(refreshToken);
  if (already) return Promise.resolve(already);

  const promise = doRefresh(refreshToken, fetchImpl)
    .then((result) => {
      remember(refreshToken, result);
      return result;
    })
    .finally(() => {
      inflight.delete(refreshToken);
    });
  inflight.set(refreshToken, promise);
  return promise;
}

/** Test seam — the maps outlive a single case otherwise. */
export function __resetRefreshCaches() {
  inflight.clear();
  recent.clear();
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
