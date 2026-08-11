import {
  formatCompactNumber,
  formatPriceUZS,
  MARKETPLACE_FILTERS,
  PLATFORM_FILTER_OPTIONS,
} from './marketplace-format';
import { marketplaceHref, removeMarketplaceParams } from './marketplace-query';
import { parsePlayerMatchValues, strictnessLabel } from './player-match-query';

export type AppliedMarketplaceFilterKind = 'search' | 'general' | 'player';

export interface AppliedMarketplaceFilter {
  id: string;
  kind: AppliedMarketplaceFilterKind;
  label: string;
  keys: string[];
  href: string;
}

const RANGE_FILTERS = [
  { key: 'team_strength', label: 'Team Strength' },
  { key: 'android_coins', label: 'Android coin' },
  { key: 'ios_coins', label: 'iOS coin' },
  { key: 'device_transfer_limit', label: 'Transfer limiti' },
] as const;

const SHORTCUT_KEYS: Record<string, string[]> = {
  negotiable: ['priceNegotiable'],
  clean: ['attr.has_google_play_link', 'attr.has_game_center_link'],
  exchange: ['attr.exchange_mode'],
};

const EXCHANGE_LABELS: Record<string, string> = {
  NONE: "Obmen yo'q",
  EXCHANGE_ONLY: 'Faqat obmen',
  EXCHANGE_WITH_SURCHARGE: 'Obmen + doplata',
  BOTH: 'Obmen yoki doplata',
};

function textValue(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value || undefined;
}

function finiteNumber(params: URLSearchParams, key: string) {
  const value = textValue(params, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nonNegativeNumber(params: URLSearchParams, key: string) {
  const value = finiteNumber(params, key);
  return value === undefined || value < 0 ? undefined : value;
}

function descriptor(
  params: URLSearchParams,
  id: string,
  kind: AppliedMarketplaceFilterKind,
  label: string,
  keys: string[],
): AppliedMarketplaceFilter {
  return {
    id,
    kind,
    label,
    keys,
    href: marketplaceHref(removeMarketplaceParams(params, keys)),
  };
}

function rangeLabel(label: string, minimum: number | undefined, maximum: number | undefined) {
  if (minimum !== undefined && maximum !== undefined) {
    return `${label}: ${formatCompactNumber(minimum)} dan – ${formatCompactNumber(maximum)} gacha`;
  }
  if (minimum !== undefined) return `${label}: ${formatCompactNumber(minimum)} dan`;
  return `${label}: ${formatCompactNumber(maximum as number)} gacha`;
}

function priceLabel(minimum: number | undefined, maximum: number | undefined) {
  if (minimum !== undefined && maximum !== undefined) {
    return `Narx: ${formatPriceUZS(minimum).replace(" so'm", '')}–${formatPriceUZS(maximum)}`;
  }
  if (minimum !== undefined) return `Narx: ${formatPriceUZS(minimum)} dan`;
  return `Narx: ${formatPriceUZS(maximum as number)} gacha`;
}

export function playerAppliedFilterCount(params: URLSearchParams) {
  return parsePlayerMatchValues(
    params.getAll('matchCard'),
    textValue(params, 'matchStrictness'),
  ).criteria.length;
}

export function generalAppliedFilterCount(items: readonly AppliedMarketplaceFilter[]) {
  return items.filter((item) => item.kind === 'general').length;
}

export function buildAppliedMarketplaceFilters(params: URLSearchParams) {
  const items: AppliedMarketplaceFilter[] = [];
  const search = textValue(params, 'q') ?? textValue(params, 'search');
  if (search) {
    items.push(descriptor(params, 'search', 'search', `Qidiruv: ${search}`, ['q', 'search']));
  }

  const selectedShortcut = MARKETPLACE_FILTERS.find((filter) => filter.id === textValue(params, 'filter'));
  const shortcutKeys = selectedShortcut && selectedShortcut.id !== 'all'
    ? SHORTCUT_KEYS[selectedShortcut.id] ?? []
    : [];
  if (selectedShortcut && selectedShortcut.id !== 'all') {
    items.push(descriptor(
      params,
      `shortcut:${selectedShortcut.id}`,
      'general',
      selectedShortcut.label,
      ['filter', ...shortcutKeys],
    ));
  }

  const minPrice = nonNegativeNumber(params, 'minPrice');
  const maxPrice = nonNegativeNumber(params, 'maxPrice');
  if (minPrice !== undefined || maxPrice !== undefined) {
    items.push(descriptor(
      params,
      'price',
      'general',
      priceLabel(minPrice, maxPrice),
      ['minPrice', 'maxPrice'],
    ));
  }

  const platform = textValue(params, 'attr.platform');
  const platformOption = PLATFORM_FILTER_OPTIONS.find((option) => option.value === platform);
  if (platformOption && platformOption.value !== 'MOBILE') {
    items.push(descriptor(
      params,
      'platform',
      'general',
      `Platforma: ${platformOption.label}`,
      ['attr.platform'],
    ));
  }

  if (params.get('priceNegotiable') === 'true' && !shortcutKeys.includes('priceNegotiable')) {
    items.push(descriptor(
      params,
      'negotiable',
      'general',
      'Savdolashish mumkin',
      ['priceNegotiable'],
    ));
  }

  const division = finiteNumber(params, 'attr.highest_division_level');
  if (division !== undefined && Number.isInteger(division) && division >= 1) {
    items.push(descriptor(
      params,
      'division',
      'general',
      division >= 4 ? 'Division 4+' : `Division ${division}`,
      ['attr.highest_division_level'],
    ));
  }

  for (const range of RANGE_FILTERS) {
    const minimumKey = `attr.${range.key}.min`;
    const maximumKey = `attr.${range.key}.max`;
    const minimum = finiteNumber(params, minimumKey);
    const maximum = finiteNumber(params, maximumKey);
    if (minimum === undefined && maximum === undefined) continue;
    items.push(descriptor(
      params,
      range.key,
      'general',
      rangeLabel(range.label, minimum, maximum),
      [minimumKey, maximumKey],
    ));
  }

  const exchangeMode = textValue(params, 'attr.exchange_mode');
  const exchangeLabel = exchangeMode ? EXCHANGE_LABELS[exchangeMode] : undefined;
  if (exchangeLabel && !shortcutKeys.includes('attr.exchange_mode')) {
    items.push(descriptor(
      params,
      'exchange',
      'general',
      exchangeLabel,
      ['attr.exchange_mode'],
    ));
  }

  if (params.get('attr.has_google_play_link') === 'false'
    && !shortcutKeys.includes('attr.has_google_play_link')) {
    items.push(descriptor(
      params,
      'google-play',
      'general',
      'Google Play ulanmagan',
      ['attr.has_google_play_link'],
    ));
  }
  if (params.get('attr.has_game_center_link') === 'false'
    && !shortcutKeys.includes('attr.has_game_center_link')) {
    items.push(descriptor(
      params,
      'game-center',
      'general',
      'Game Center ulanmagan',
      ['attr.has_game_center_link'],
    ));
  }

  const valuableId = finiteNumber(params, 'attr.valuable_players_id');
  const valuableName = textValue(params, 'attr.valuable_players_name');
  if ((valuableId !== undefined && valuableId > 0) || valuableName) {
    items.push(descriptor(
      params,
      'valuable-player',
      'general',
      valuableName ? `Yulduz: ${valuableName}` : 'Tanlangan o‘yinchi',
      ['attr.valuable_players_id', 'attr.valuable_players_name'],
    ));
  }

  const playerCount = playerAppliedFilterCount(params);
  if (playerCount > 0) {
    const strictness = parsePlayerMatchValues(
      params.getAll('matchCard'),
      textValue(params, 'matchStrictness'),
    ).strictness;
    items.push(descriptor(
      params,
      'player-match',
      'player',
      `${playerCount} o‘yinchi · ${strictnessLabel(strictness)}`,
      ['matchCard', 'matchStrictness'],
    ));
  }

  return items;
}
