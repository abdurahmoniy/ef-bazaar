/**
 * Client-side (browser) helper for building marketplace API URLs.
 *
 * URLs returned are **same-origin, relative paths** targeting the Next.js
 * Route Handler at `/app/api/marketplace/[...path]/route.ts`, which forwards
 * to the internal nginx (`nginx:8080/api/marketplace/...`).
 *
 * Effects of the same-origin routing:
 *  - Browser DevTools shows every backend call as a normal `/api/marketplace/*`
 *    request — status, headers, body, timing.
 *  - The httpOnly `access_token` cookie is sent automatically (no
 *    `credentials: 'include'` cross-origin gymnastics required, though calls
 *    can keep it — it's a no-op for same-origin).
 *  - The `api.efbazaar.uz` subdomain becomes unused from the browser; nginx
 *    still exposes it for external consumers (bots, integrations).
 */

const DEFAULT_BASE_PATH = '/api/marketplace';

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

/**
 * Build a browser-facing marketplace API URL.
 *
 * @param path — path segments after `/api/marketplace/` (e.g. `'v1/listings'`
 *   or `['v1', 'listings', id, 'like']`).
 * @param searchParams — optional URLSearchParams appended as a query string.
 * @param basePath — override for tests; defaults to `/api/marketplace`.
 */
export function buildMarketplaceApiPath(
  path: string | string[],
  searchParams?: URLSearchParams,
  basePath?: string,
) {
  const query = searchParams?.toString();
  const suffix = query ? `?${query}` : '';
  return `${normalizeBasePath(basePath)}/${normalizeSegments(path).map(encodeURIComponent).join('/')}${suffix}`;
}
