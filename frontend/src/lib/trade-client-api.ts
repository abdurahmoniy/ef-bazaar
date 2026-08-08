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
