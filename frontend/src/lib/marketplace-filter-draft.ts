import type { ListingBrowseParams } from './marketplace-types';

export type MarketplacePlatform = 'MOBILE' | 'STEAM' | 'PLAYSTATION';

export interface MarketplaceFilterDraft {
  platform: MarketplacePlatform;
  minPrice: string;
  maxPrice: string;
  priceNegotiable: boolean;
  division: string;
  teamStrengthMin: string;
  teamStrengthMax: string;
  androidCoinsMin: string;
  iosCoinsMin: string;
  transferLimitMin: string;
  exchangeMode: string;
  googlePlayDisconnected: boolean;
  gameCenterDisconnected: boolean;
  valuablePlayer: { efhubId: number; name: string } | null;
}

export type MarketplaceFilterDraftErrorKey =
  | 'platform'
  | 'minPrice'
  | 'maxPrice'
  | 'price'
  | 'division'
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

const OWNED_FILTER_KEYS = [
  'filter',
  'minPrice',
  'maxPrice',
  'priceNegotiable',
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

function integerValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
}

function positiveSafeInteger(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function setIfPresent(params: URLSearchParams, key: string, value: string) {
  const normalized = value.trim();
  if (normalized) params.set(key, normalized);
}

/** Returns a new, empty detailed filter draft with Mobile as the implicit platform. */
export function clearMarketplaceFilterDraft(): MarketplaceFilterDraft {
  return {
    platform: 'MOBILE',
    minPrice: '',
    maxPrice: '',
    priceNegotiable: false,
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

  return {
    ...clearMarketplaceFilterDraft(),
    platform: validPlatform(platform) ? platform : 'MOBILE',
    minPrice: numericText(filters.minPrice),
    maxPrice: numericText(filters.maxPrice),
    priceNegotiable: filters.priceNegotiable === true,
    division: attributeText(filters, 'highest_division_level'),
    teamStrengthMin: attributeText(filters, 'team_strength.min'),
    teamStrengthMax: attributeText(filters, 'team_strength.max'),
    androidCoinsMin: attributeText(filters, 'android_coins.min'),
    iosCoinsMin: attributeText(filters, 'ios_coins.min'),
    transferLimitMin: attributeText(filters, 'device_transfer_limit.min'),
    exchangeMode: attributeText(filters, 'exchange_mode'),
    googlePlayDisconnected: attributes.has_google_play_link === 'false',
    gameCenterDisconnected: attributes.has_game_center_link === 'false',
    valuablePlayer: id !== undefined && name ? { efhubId: id, name } : null,
  };
}

/** Validates only the fields that the detailed filter controls. Empty values are valid. */
export function validateMarketplaceFilterDraft(draft: MarketplaceFilterDraft): MarketplaceFilterErrors {
  const errors: MarketplaceFilterErrors = {};
  if (!validPlatform(draft.platform)) errors.platform = 'Platformani tanlang.';

  const validatePrice = (key: 'minPrice' | 'maxPrice') => {
    const value = integerValue(draft[key]);
    if (value === null) errors[key] = 'Butun son kiriting.';
    else if (value !== undefined && value < 0) {
      errors[key] = 'Narx 0 dan kam bo‘lishi mumkin emas.';
    }
    return value;
  };
  const minPrice = validatePrice('minPrice');
  const maxPrice = validatePrice('maxPrice');
  if (minPrice !== null && maxPrice !== null
    && minPrice !== undefined && maxPrice !== undefined
    && minPrice >= 0 && maxPrice >= 0 && minPrice > maxPrice) {
    delete errors.minPrice;
    delete errors.maxPrice;
    errors.price = 'Eng kam narx eng yuqori narxdan oshmasligi kerak.';
  }

  const division = integerValue(draft.division);
  if (division === null || (division !== undefined && (division < 1 || division > 4))) {
    errors.division = 'Division 1–4 oralig‘ida bo‘lishi kerak.';
  }

  const validateTeamStrength = (key: 'teamStrengthMin' | 'teamStrengthMax') => {
    const value = integerValue(draft[key]);
    if (value === null) errors[key] = 'Butun son kiriting.';
    else if (value !== undefined && value < 1000) errors[key] = '1000 dan kam bo‘lmasligi kerak.';
    else if (value !== undefined && value > 5000) errors[key] = '5000 dan oshmasligi kerak.';
    return value;
  };
  const minStrength = validateTeamStrength('teamStrengthMin');
  const maxStrength = validateTeamStrength('teamStrengthMax');
  if (minStrength !== null && maxStrength !== null
    && minStrength !== undefined && maxStrength !== undefined
    && minStrength >= 1000 && minStrength <= 5000
    && maxStrength >= 1000 && maxStrength <= 5000
    && minStrength > maxStrength) {
    errors.teamStrength = 'Eng kam kuch eng yuqori kuchdan oshmasligi kerak.';
  }

  for (const key of ['androidCoinsMin', 'iosCoinsMin'] as const) {
    if (integerValue(draft[key]) === null) errors[key] = 'Butun son kiriting.';
  }

  const transferLimit = integerValue(draft.transferLimitMin);
  if (transferLimit === null || (transferLimit !== undefined && (transferLimit < 0 || transferLimit > 10))) {
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
  setIfPresent(next, 'minPrice', draft.minPrice);
  setIfPresent(next, 'maxPrice', draft.maxPrice);
  if (draft.priceNegotiable) next.set('priceNegotiable', 'true');
  setIfPresent(next, 'attr.highest_division_level', draft.division);
  setIfPresent(next, 'attr.team_strength.min', draft.teamStrengthMin);
  setIfPresent(next, 'attr.team_strength.max', draft.teamStrengthMax);
  setIfPresent(next, 'attr.android_coins.min', draft.androidCoinsMin);
  setIfPresent(next, 'attr.ios_coins.min', draft.iosCoinsMin);
  setIfPresent(next, 'attr.device_transfer_limit.min', draft.transferLimitMin);
  setIfPresent(next, 'attr.exchange_mode', draft.exchangeMode);
  if (draft.googlePlayDisconnected) next.set('attr.has_google_play_link', 'false');
  if (draft.gameCenterDisconnected) next.set('attr.has_game_center_link', 'false');

  const valuableId = draft.valuablePlayer?.efhubId;
  const valuableName = draft.valuablePlayer?.name.trim();
  if (valuableId !== undefined && Number.isSafeInteger(valuableId) && valuableId > 0 && valuableName) {
    next.set('attr.valuable_players_id', String(valuableId));
    next.set('attr.valuable_players_name', valuableName);
  }
  return next;
}
