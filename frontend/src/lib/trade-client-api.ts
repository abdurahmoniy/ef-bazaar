import type {
  SellerRatingResponse,
  SellerRatingSummaryResponse,
} from './trade-types';

const DEFAULT_BASE_PATH = '/api/trade';

function normalizeSegments(path: string | string[]) {
  const segments = Array.isArray(path) ? path : path.split('/');
  const normalized = segments.map((segment) => segment.trim()).filter(Boolean);

  if (
    normalized.length === 0 ||
    normalized.some((segment) => segment === '.' || segment === '..' || segment.includes('/'))
  ) {
    throw new Error('Invalid API path');
  }

  return normalized;
}

function normalizeBasePath(basePath = DEFAULT_BASE_PATH) {
  return basePath.trim().replace(/\/+$/, '');
}

export function buildTradeApiPath(
  path: string | string[],
  searchParams?: URLSearchParams,
  basePath?: string,
) {
  const query = searchParams?.toString();
  const suffix = query ? `?${query}` : '';
  return `${normalizeBasePath(basePath)}/${normalizeSegments(path).map(encodeURIComponent).join('/')}${suffix}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
  } catch {
    // ignore non-json error responses
  }
  return response.status === 401 || response.status === 403
    ? 'Kirish talab qilinadi'
    : "So'rov bajarilmadi";
}

export async function postSellerRating(
  tradeId: string,
  stars: number,
  comment?: string,
): Promise<{ ok: true; data: SellerRatingResponse } | { ok: false; error: string }> {
  try {
    const response = await fetch(
      buildTradeApiPath(['v1', 'trades', tradeId, 'seller-rating']),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ stars, comment: comment?.trim() || undefined }),
      },
    );
    if (!response.ok) {
      return { ok: false, error: await readErrorMessage(response) };
    }
    const data = (await response.json()) as SellerRatingResponse;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Tarmoq xatosi',
    };
  }
}

export async function fetchTradeSellerRating(
  tradeId: string,
): Promise<{ ok: true; data: SellerRatingResponse | null } | { ok: false; error: string }> {
  try {
    const response = await fetch(
      buildTradeApiPath(['v1', 'trades', tradeId, 'seller-rating']),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    if (response.status === 204 || response.status === 404) {
      return { ok: true, data: null };
    }
    if (!response.ok) {
      return { ok: false, error: await readErrorMessage(response) };
    }
    const data = (await response.json()) as SellerRatingResponse;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Tarmoq xatosi',
    };
  }
}

export async function fetchSellerRatingSummary(
  sellerId: string,
): Promise<SellerRatingSummaryResponse | null> {
  try {
    const response = await fetch(
      buildTradeApiPath(['v1', 'sellers', sellerId, 'rating-summary']),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as SellerRatingSummaryResponse;
  } catch {
    return null;
  }
}
