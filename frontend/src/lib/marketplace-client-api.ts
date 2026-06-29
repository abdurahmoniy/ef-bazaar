const MARKETPLACE_API_ROOT = '/api/marketplace';

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

export function buildMarketplaceApiPath(path: string | string[], searchParams?: URLSearchParams) {
  const query = searchParams?.toString();
  const suffix = query ? `?${query}` : '';
  return `${MARKETPLACE_API_ROOT}/${normalizeSegments(path).map(encodeURIComponent).join('/')}${suffix}`;
}
