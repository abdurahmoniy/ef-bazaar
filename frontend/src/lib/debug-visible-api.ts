const DEBUG_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEBUG_MARKETPLACE_ROOT = '/api/debug/marketplace';
const DEFAULT_INTERNAL_API_BASE = 'http://nginx/api';

interface DebugEnv {
  DEBUG_VISIBLE_API?: string;
  NEXT_PUBLIC_DEBUG_VISIBLE_API?: string;
}

function normalizeDebugValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function isDebugVisibleApiEnabled(
  env: DebugEnv = {
    DEBUG_VISIBLE_API: process.env.DEBUG_VISIBLE_API,
    NEXT_PUBLIC_DEBUG_VISIBLE_API: process.env.NEXT_PUBLIC_DEBUG_VISIBLE_API,
  },
) {
  return (
    DEBUG_VALUES.has(normalizeDebugValue(env.DEBUG_VISIBLE_API)) ||
    DEBUG_VALUES.has(normalizeDebugValue(env.NEXT_PUBLIC_DEBUG_VISIBLE_API))
  );
}

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

function encodeSegments(path: string | string[]) {
  return normalizeSegments(path).map(encodeURIComponent).join('/');
}

export function buildDebugMarketplaceApiPath(path: string | string[]) {
  return `${DEBUG_MARKETPLACE_ROOT}/${encodeSegments(path)}`;
}

export function buildInternalMarketplaceApiUrl(
  path: string | string[],
  search = '',
  base = process.env.INTERNAL_API_BASE_URL || DEFAULT_INTERNAL_API_BASE,
) {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedSearch = search && !search.startsWith('?') ? `?${search}` : search;

  return `${normalizedBase}/marketplace/${encodeSegments(path)}${normalizedSearch}`;
}
