import {
  paramToSortId,
  sortIdToParam,
  type ListingSortId,
} from './marketplace-sort';
import type { ListingBrowseParams } from './marketplace-types';

export type MarketplacePlatform = 'MOBILE' | 'STEAM' | 'PLAYSTATION';
export type MarketplaceDivision = '' | '1' | '2' | '3' | '4';
export type MarketplaceExchangeMode =
  | ''
  | 'NONE'
  | 'EXCHANGE_ONLY'
  | 'EXCHANGE_WITH_SURCHARGE'
  | 'BOTH';

export interface MarketplaceFilterDraft {
  platform: MarketplacePlatform;
  minPrice: string;
  maxPrice: string;
  priceNegotiable: boolean;
  includeSold: boolean;
  division: MarketplaceDivision;
  teamStrengthMin: string;
  teamStrengthMax: string;
  androidCoinsMin: string;
  iosCoinsMin: string;
  transferLimitMin: string;
  exchangeMode: MarketplaceExchangeMode;
  googlePlayDisconnected: boolean;
  gameCenterDisconnected: boolean;
  valuablePlayer: { efhubId: number; name: string } | null;
  sort?: ListingSortId;
  query?: string;
}

export type MarketplaceFilterDraftErrorKey =
  | 'platform'
  | 'minPrice'
  | 'maxPrice'
  | 'price'
  | 'division'
  | 'exchangeMode'
  | 'teamStrengthMin'
  | 'teamStrengthMax'
  | 'teamStrength'
  | 'androidCoinsMin'
  | 'iosCoinsMin'
  | 'transferLimitMin';

export type MarketplaceFilterErrors = Partial<
  Record<MarketplaceFilterDraftErrorKey, string>
>;

const PLATFORM_VALUES = new Set<MarketplacePlatform>(['MOBILE', 'STEAM', 'PLAYSTATION']);
const DIVISION_VALUES = new Set<MarketplaceDivision>(['', '1', '2', '3', '4']);
const EXCHANGE_MODE_VALUES = new Set<MarketplaceExchangeMode>([
  '',
  'NONE',
  'EXCHANGE_ONLY',
  'EXCHANGE_WITH_SURCHARGE',
  'BOTH',
]);
const INTEGER_PATTERN = /^-?(0|[1-9]\d*)$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MAX_SAFE_INTEGER = 9007199254740991n;

const OWNED_FILTER_KEYS = [
  'filter',
  'minPrice',
  'maxPrice',
  'priceNegotiable',
  'includeSold',
  'attr.platform',
  'attr.highest_division_level',
  'attr.team_strength.min',
  'attr.team_strength.max',
  'attr.android_coins.min',
  'attr.android_coins.max',
  'attr.ios_coins.min',
  'attr.ios_coins.max',
  'attr.device_transfer_limit.min',
  'attr.device_transfer_limit.max',
  'attr.exchange_mode',
  'attr.has_google_play_link',
  'attr.has_game_center_link',
  'attr.valuable_players_id',
  'attr.valuable_players_name',
] as const;

function validPlatform(value: unknown): value is MarketplacePlatform {
  return typeof value === 'string' && PLATFORM_VALUES.has(value as MarketplacePlatform);
}

function validDivision(value: unknown): value is MarketplaceDivision {
  return typeof value === 'string' && DIVISION_VALUES.has(value as MarketplaceDivision);
}

function validExchangeMode(value: unknown): value is MarketplaceExchangeMode {
  return typeof value === 'string'
    && EXCHANGE_MODE_VALUES.has(value as MarketplaceExchangeMode);
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function attributeText(filters: ListingBrowseParams, key: string) {
  return text(filters.attributes?.[key]);
}

function numericText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value);
}

function integerValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!INTEGER_PATTERN.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function positiveSafeInteger(value: string) {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed <= MAX_SAFE_INTEGER ? Number(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function boundedInteger(value: unknown, minimum?: bigint, maximum?: bigint) {
  const parsed = integerValue(value);
  if (typeof parsed !== 'bigint') return undefined;
  if (minimum !== undefined && parsed < minimum) return undefined;
  if (maximum !== undefined && parsed > maximum) return undefined;
  return parsed;
}

function setInteger(params: URLSearchParams, key: string, value: bigint | undefined) {
  if (value !== undefined) params.set(key, value.toString());
}

/** Returns a new, empty detailed filter draft with Mobile as the implicit platform. */
export function clearMarketplaceFilterDraft(): MarketplaceFilterDraft {
  return {
    platform: 'MOBILE',
    minPrice: '',
    maxPrice: '',
    priceNegotiable: false,
    includeSold: false,
    division: '',
    teamStrengthMin: '',
    teamStrengthMax: '',
    androidCoinsMin: '',
    iosCoinsMin: '',
    transferLimitMin: '',
    exchangeMode: '',
    googlePlayDisconnected: false,
    gameCenterDisconnected: false,
    valuablePlayer: null,
  };
}

/** Hydrates the editable detailed-filter fields from already-normalized browse filters. */
export function filterDraftFromBrowseParams(filters: ListingBrowseParams): MarketplaceFilterDraft {
  const attributes = filters.attributes ?? {};
  const id = positiveSafeInteger(attributeText(filters, 'valuable_players_id'));
  const name = attributeText(filters, 'valuable_players_name');
  const platform = attributes.platform;
  const division = attributeText(filters, 'highest_division_level');
  const exchangeMode = attributeText(filters, 'exchange_mode');
  const sort = filters.sort ? paramToSortId(filters.sort) : undefined;
  const query = filters.q ?? filters.search ?? undefined;

  return {
    ...clearMarketplaceFilterDraft(),
    platform: validPlatform(platform) ? platform : 'MOBILE',
    minPrice: numericText(filters.minPrice),
    maxPrice: numericText(filters.maxPrice),
    priceNegotiable: filters.priceNegotiable === true,
    includeSold: filters.includeSold === true,
    division: validDivision(division) ? division : '',
    teamStrengthMin: attributeText(filters, 'team_strength.min'),
    teamStrengthMax: attributeText(filters, 'team_strength.max'),
    androidCoinsMin: attributeText(filters, 'android_coins.min'),
    iosCoinsMin: attributeText(filters, 'ios_coins.min'),
    transferLimitMin: attributeText(filters, 'device_transfer_limit.min'),
    exchangeMode: validExchangeMode(exchangeMode) ? exchangeMode : '',
    googlePlayDisconnected: attributes.has_google_play_link === 'false',
    gameCenterDisconnected: attributes.has_game_center_link === 'false',
    valuablePlayer: id !== undefined && name ? { efhubId: id, name } : null,
    sort,
    query,
  };
}

/** Validates only the fields that the detailed filter controls. Empty values are valid. */
export function validateMarketplaceFilterDraft(draft: MarketplaceFilterDraft): MarketplaceFilterErrors {
  const errors: MarketplaceFilterErrors = {};
  if (!validPlatform(draft.platform)) errors.platform = 'Platformani tanlang.';

  const validatePrice = (key: 'minPrice' | 'maxPrice') => {
    const value = integerValue(draft[key]);
    if (value === null) errors[key] = 'Butun son kiriting.';
    else if (value !== undefined && value < 0n) {
      errors[key] = 'Narx 0 dan kam bo‘lishi mumkin emas.';
    } else if (value !== undefined && value > MAX_SAFE_INTEGER) {
      errors[key] = 'Son juda katta.';
    }
    return value;
  };
  const minPrice = validatePrice('minPrice');
  const maxPrice = validatePrice('maxPrice');
  if (minPrice !== null && maxPrice !== null
    && minPrice !== undefined && maxPrice !== undefined
    && errors.minPrice === undefined && errors.maxPrice === undefined
    && minPrice >= 0n && maxPrice >= 0n && minPrice > maxPrice) {
    delete errors.minPrice;
    delete errors.maxPrice;
    errors.price = 'Eng kam narx eng yuqori narxdan oshmasligi kerak.';
  }

  if (!validDivision(draft.division)) {
    errors.division = 'Division 1–4 oralig‘ida bo‘lishi kerak.';
  }
  if (!validExchangeMode(draft.exchangeMode)) {
    errors.exchangeMode = 'Obmen turini tanlang.';
  }

  const validateTeamStrength = (key: 'teamStrengthMin' | 'teamStrengthMax') => {
    const value = integerValue(draft[key]);
    if (value === null) errors[key] = 'Butun son kiriting.';
    else if (value !== undefined && value < 1000n) errors[key] = '1000 dan kam bo‘lmasligi kerak.';
    else if (value !== undefined && value > 5000n) errors[key] = '5000 dan oshmasligi kerak.';
    return value;
  };
  const minStrength = validateTeamStrength('teamStrengthMin');
  const maxStrength = validateTeamStrength('teamStrengthMax');
  if (minStrength !== null && maxStrength !== null
    && minStrength !== undefined && maxStrength !== undefined
    && minStrength >= 1000n && minStrength <= 5000n
    && maxStrength >= 1000n && maxStrength <= 5000n
    && minStrength > maxStrength) {
    errors.teamStrength = 'Eng kam kuch eng yuqori kuchdan oshmasligi kerak.';
  }

  for (const key of ['androidCoinsMin', 'iosCoinsMin'] as const) {
    if (integerValue(draft[key]) === null) errors[key] = 'Butun son kiriting.';
  }

  const transferLimit = integerValue(draft.transferLimitMin);
  if (transferLimit === null) {
    errors.transferLimitMin = 'Butun son kiriting.';
  } else if (transferLimit !== undefined && (transferLimit < 0n || transferLimit > 10n)) {
    errors.transferLimitMin = '0 dan 10 gacha son kiriting.';
  }

  return errors;
}

/** Replaces draft-owned public filters while preserving search, matching, view, sorting, and tracking state. */
export function applyMarketplaceFilterDraft(
  current: URLSearchParams,
  draft: MarketplaceFilterDraft,
) {
  const next = new URLSearchParams(current);
  for (const key of OWNED_FILTER_KEYS) next.delete(key);
  next.delete('page');

  if (validPlatform(draft.platform) && draft.platform !== 'MOBILE') {
    next.set('attr.platform', draft.platform);
  }
  const minPrice = boundedInteger(draft.minPrice, 0n, MAX_SAFE_INTEGER);
  const maxPrice = boundedInteger(draft.maxPrice, 0n, MAX_SAFE_INTEGER);
  if (minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice) {
    setInteger(next, 'minPrice', minPrice);
    setInteger(next, 'maxPrice', maxPrice);
  }
  if (draft.priceNegotiable) next.set('priceNegotiable', 'true');
  if (draft.includeSold) next.set('includeSold', 'true');
  if (validDivision(draft.division) && draft.division) {
    next.set('attr.highest_division_level', draft.division);
  }
  const minStrength = boundedInteger(draft.teamStrengthMin, 1000n, 5000n);
  const maxStrength = boundedInteger(draft.teamStrengthMax, 1000n, 5000n);
  if (minStrength === undefined || maxStrength === undefined || minStrength <= maxStrength) {
    setInteger(next, 'attr.team_strength.min', minStrength);
    setInteger(next, 'attr.team_strength.max', maxStrength);
  }
  setInteger(next, 'attr.android_coins.min', boundedInteger(draft.androidCoinsMin));
  setInteger(next, 'attr.ios_coins.min', boundedInteger(draft.iosCoinsMin));
  setInteger(
    next,
    'attr.device_transfer_limit.min',
    boundedInteger(draft.transferLimitMin, 0n, 10n),
  );
  if (validExchangeMode(draft.exchangeMode) && draft.exchangeMode) {
    next.set('attr.exchange_mode', draft.exchangeMode);
  }
  if (draft.googlePlayDisconnected) next.set('attr.has_google_play_link', 'false');
  if (draft.gameCenterDisconnected) next.set('attr.has_game_center_link', 'false');

  const valuableId = draft.valuablePlayer?.efhubId;
  const valuableName = text(draft.valuablePlayer?.name);
  if (valuableId !== undefined && Number.isSafeInteger(valuableId) && valuableId > 0 && valuableName) {
    next.set('attr.valuable_players_id', String(valuableId));
    next.set('attr.valuable_players_name', valuableName);
  }
  if (draft.sort !== undefined) {
    const sortParam = sortIdToParam(draft.sort);
    if (sortParam) next.set('sort', sortParam);
  }
  if (draft.query !== undefined) {
    const q = draft.query.trim();
    if (q) {
      next.set('q', q);
      next.delete('search');
    } else {
      next.delete('q');
      next.delete('search');
    }
  }
  return next;
}
