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
  { id: 'google', label: 'Google linked', params: { hasGooglePlayLink: true } },
  { id: 'division-1-3', label: 'Div 1-3', params: { minDivision: 1, maxDivision: 3 } },
  { id: 'strong', label: '3000+ strength', params: { minTeamStrength: 3000 } },
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

export function divisionLabel(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 9) return 'Division -';
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
  const params: ListingBrowseParams = { ...FILTER_PARAMS[selectedFilter] };

  const page = numberParam(input.page, 0);
  const size = numberParam(input.size, 1);
  const minPrice = numberParam(input.minPrice, 0);
  const maxPrice = numberParam(input.maxPrice, 0);
  const minDivision = numberParam(input.minDivision, 1);
  const maxDivision = numberParam(input.maxDivision, 1);
  const minTeamStrength = numberParam(input.minTeamStrength, 0);
  const hasGooglePlayLink = booleanParam(input.hasGooglePlayLink);
  const priceNegotiable = booleanParam(input.priceNegotiable);
  const search = textParam(input.q) ?? textParam(input.search);
  const valuablePlayer = textParam(input.valuablePlayer);

  if (page !== undefined) params.page = page;
  if (size !== undefined) params.size = size;
  if (minPrice !== undefined) params.minPrice = minPrice;
  if (maxPrice !== undefined) params.maxPrice = maxPrice;
  if (minDivision !== undefined) params.minDivision = minDivision;
  if (maxDivision !== undefined) params.maxDivision = maxDivision;
  if (minTeamStrength !== undefined) params.minTeamStrength = minTeamStrength;
  if (hasGooglePlayLink !== undefined) params.hasGooglePlayLink = hasGooglePlayLink;
  if (priceNegotiable !== undefined) params.priceNegotiable = priceNegotiable;
  if (valuablePlayer) params.valuablePlayer = valuablePlayer;
  if (search) params.search = search;

  return params;
}

export function buildListingSearchParams(input: ListingBrowseParams = {}) {
  const params = new URLSearchParams();

  appendDefined(params, 'page', input.page);
  appendDefined(params, 'size', input.size);
  appendDefined(params, 'sort', input.sort ?? 'createdAt,desc');
  appendDefined(params, 'minPrice', input.minPrice);
  appendDefined(params, 'maxPrice', input.maxPrice);
  appendDefined(params, 'minDivision', input.minDivision);
  appendDefined(params, 'maxDivision', input.maxDivision);
  appendDefined(params, 'minTeamStrength', input.minTeamStrength);
  appendDefined(params, 'hasGooglePlayLink', input.hasGooglePlayLink);
  appendDefined(params, 'priceNegotiable', input.priceNegotiable);
  appendDefined(params, 'valuablePlayer', input.valuablePlayer);
  appendDefined(params, 'search', input.search);

  return params;
}
