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
  // Store links (Google Play / Game Center) can't be removed from an account,
  // so a transfer via Konami ID leaves the previous owner with access. "Clean"
  // accounts — no store link — are the safe ones to buy.
  {
    id: 'clean',
    label: 'Toza akkount',
    params: {
      attributes: { has_google_play_link: 'false', has_game_center_link: 'false' },
    },
  },
  // 'division1' and 'strong' used to live here. Both pinned one arbitrary value
  // of a range the sidebar already exposes ("Eng yuqori Division", "Team
  // Strength"), so they duplicated a filter while answering nobody's actual
  // question. The chips that remain are booleans — genuinely awkward to reach
  // in the sidebar, and each one maps to a real buying decision.
  {
    id: 'exchange',
    label: 'Faqat obmen',
    params: { attributes: { exchange_mode: 'EXCHANGE_ONLY' } },
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

// Values + labels mirror the platform attribute definition (R__attribute_definitions.sql).
export const PLATFORM_FILTER_OPTIONS = [
  { value: 'MOBILE', label: 'Mobile' },
  { value: 'STEAM', label: 'Steam' },
  { value: 'PLAYSTATION', label: 'PlayStation' },
] as const;

export const DEFAULT_PLATFORM = 'MOBILE';

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

/**
 * 4-tier division model: 1–3 are exact, 4 covers "4 or higher". Legacy
 * listings created before the enum flip may hold 5–9 — they collapse
 * into the "4+" bucket, mirroring {@code toDivisionLevel}.
 */
export function divisionLabel(value: number | undefined) {
  if (value === undefined || !Number.isInteger(value) || value < 1) {
    return 'Division -';
  }
  return value >= 4 ? 'Division 4+' : `Division ${value}`;
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
  const sort = textParam(input.sort);

  if (page !== undefined) params.page = page;
  if (size !== undefined) params.size = size;
  if (minPrice !== undefined) params.minPrice = minPrice;
  if (maxPrice !== undefined) params.maxPrice = maxPrice;
  if (priceNegotiable !== undefined) params.priceNegotiable = priceNegotiable;
  if (search) params.search = search;
  if (sort) params.sort = sort;

  // Any `attr.<key>` query param is treated as a JSONB equality filter.
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (!rawKey.startsWith(ATTR_PARAM_PREFIX)) continue;
    const attrKey = rawKey.slice(ATTR_PARAM_PREFIX.length);
    const value = textParam(rawValue);
    if (!attrKey || !value) continue;
    params.attributes = { ...(params.attributes ?? {}), [attrKey]: value };
  }

  // The platform filter is required — an omitted attr.platform means the default.
  if (!params.attributes?.platform) {
    params.attributes = { ...(params.attributes ?? {}), platform: DEFAULT_PLATFORM };
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
