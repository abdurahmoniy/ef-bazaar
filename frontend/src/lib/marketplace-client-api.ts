const DEFAULT_API_BASE_URL = 'https://api.efbazaar.chempox.uz';

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

function normalizeApiBaseUrl(apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL) {
  return apiBaseUrl.trim().replace(/\/+$/, '');
}

export function buildMarketplaceApiPath(
  path: string | string[],
  searchParams?: URLSearchParams,
  apiBaseUrl?: string,
) {
  const query = searchParams?.toString();
  const suffix = query ? `?${query}` : '';
  return `${normalizeApiBaseUrl(apiBaseUrl)}/marketplace/${normalizeSegments(path).map(encodeURIComponent).join('/')}${suffix}`;
}
