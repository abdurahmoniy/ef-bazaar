import type { ListingBrowseParams } from './marketplace-types';

export type SearchParamInput = Record<string, string | string[] | undefined>;

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

export const MARKETPLACE_FILTERS = [
  { id: 'all', label: 'Barchasi', params: {} },
  { id: 'negotiable', label: 'Savdolashish', params: { priceNegotiable: true } },
  {
    id: 'google',
    label: 'Google linked',
    params: { attributes: { has_google_play_link: 'true' } },
  },
] as const satisfies readonly {
  id: string;
  label: string;
  params: ListingBrowseParams;
}[];

export type MarketplaceFilterId = (typeof MARKETPLACE_FILTERS)[number]['id'];

const FILTER_PARAMS = MARKETPLACE_FILTERS.reduce(
  (acc, filter) => {
    acc[filter.id] = filter.params;
    return acc;
  },
  {} as Record<MarketplaceFilterId, ListingBrowseParams>,
);

const ATTR_PARAM_PREFIX = 'attr.';

function isMarketplaceFilterId(value: string): value is MarketplaceFilterId {
  return value in FILTER_PARAMS;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function textParam(value: string | string[] | undefined) {
  const text = firstParam(value)?.trim();
  return text ? text : undefined;
}

function numberParam(value: string | string[] | undefined, min = 0) {
  const text = textParam(value);
  if (!text) return undefined;

  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < min) return undefined;

  return Math.trunc(parsed);
}

function booleanParam(value: string | string[] | undefined) {
  const text = textParam(value);
  if (text === 'true') return true;
  if (text === 'false') return false;
  return undefined;
}

function formatInteger(value: number) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function appendDefined(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null || value === '') return;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
    return;
  }
  params.set(key, String(value));
}

export function formatPriceUZS(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0 so'm";
  return `${formatInteger(numeric)} so'm`;
}

export function formatCompactNumber(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return formatInteger(numeric);
}

export function formatListingDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';

  const uzDate = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const day = String(uzDate.getUTCDate()).padStart(2, '0');
  const month = UZ_MONTHS[uzDate.getUTCMonth()];
  const hour = String(uzDate.getUTCHours()).padStart(2, '0');
  const minute = String(uzDate.getUTCMinutes()).padStart(2, '0');

  return `${day} ${month} ${hour}:${minute}`;
}

export function divisionLabel(value: number | undefined) {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 9) {
    return 'Division -';
  }
  return `Division ${value}`;
}

export function normalizePlayerList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function getSelectedMarketplaceFilter(input: SearchParamInput = {}): MarketplaceFilterId {
  const filter = textParam(input.filter);
  return filter && isMarketplaceFilterId(filter) ? filter : 'all';
}

export function parseListingSearchParams(input: SearchParamInput = {}): ListingBrowseParams {
  const selectedFilter = getSelectedMarketplaceFilter(input);
  const base = FILTER_PARAMS[selectedFilter];
  const params: ListingBrowseParams = {
    ...base,
    attributes: base.attributes ? { ...base.attributes } : undefined,
  };

  const page = numberParam(input.page, 0);
  const size = numberParam(input.size, 1);
  const minPrice = numberParam(input.minPrice, 0);
  const maxPrice = numberParam(input.maxPrice, 0);
  const priceNegotiable = booleanParam(input.priceNegotiable);
  const search = textParam(input.q) ?? textParam(input.search);

  if (page !== undefined) params.page = page;
  if (size !== undefined) params.size = size;
  if (minPrice !== undefined) params.minPrice = minPrice;
  if (maxPrice !== undefined) params.maxPrice = maxPrice;
  if (priceNegotiable !== undefined) params.priceNegotiable = priceNegotiable;
  if (search) params.search = search;

  // Any `attr.<key>` query param is treated as a JSONB equality filter.
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (!rawKey.startsWith(ATTR_PARAM_PREFIX)) continue;
    const attrKey = rawKey.slice(ATTR_PARAM_PREFIX.length);
    const value = textParam(rawValue);
    if (!attrKey || !value) continue;
    params.attributes = { ...(params.attributes ?? {}), [attrKey]: value };
  }

  if (params.attributes && Object.keys(params.attributes).length === 0) {
    delete params.attributes;
  }
  return params;
}

export function buildListingSearchParams(input: ListingBrowseParams = {}) {
  const params = new URLSearchParams();

  appendDefined(params, 'page', input.page);
  appendDefined(params, 'size', input.size);
  appendDefined(params, 'sort', input.sort ?? 'createdAt,desc');
  appendDefined(params, 'minPrice', input.minPrice);
  appendDefined(params, 'maxPrice', input.maxPrice);
  appendDefined(params, 'priceNegotiable', input.priceNegotiable);
  appendDefined(params, 'search', input.search);

  if (input.attributes) {
    for (const [key, value] of Object.entries(input.attributes)) {
      appendDefined(params, `${ATTR_PARAM_PREFIX}${key}`, value);
    }
  }

  return params;
}
