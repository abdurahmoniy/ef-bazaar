import {
  formatPriceUZS,
  MARKETPLACE_FILTERS,
  parseListingSearchParams,
  PLATFORM_FILTER_OPTIONS,
} from './marketplace-format';
import {
  MARKETPLACE_QUICK_FILTER_CONTROLLED_KEYS,
  marketplaceHref,
  removeMarketplaceParams,
  searchParamsToInput,
} from './marketplace-query';
import type { ListingBrowseParams } from './marketplace-types';
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

function finiteNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function filterValue(filters: ListingBrowseParams, key: string) {
  if (key.startsWith('attr.')) return filters.attributes?.[key.slice('attr.'.length)];
  return filters[key as keyof ListingBrowseParams];
}

function shortcutMatchesEffectiveState(
  defaults: ListingBrowseParams,
  effective: ListingBrowseParams,
  controlledKeys: readonly string[],
) {
  return controlledKeys.every((key) => Object.is(
    filterValue(effective, key),
    filterValue(defaults, key),
  ));
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
    return `${label}: ${formatRangeNumber(minimum)} dan – ${formatRangeNumber(maximum)} gacha`;
  }
  if (minimum !== undefined) return `${label}: ${formatRangeNumber(minimum)} dan`;
  return `${label}: ${formatRangeNumber(maximum as number)} gacha`;
}

const RANGE_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 20,
  useGrouping: true,
});

function formatRangeNumber(value: number) {
  return RANGE_NUMBER_FORMATTER.format(value).replaceAll(',', ' ');
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
  const effective = parseListingSearchParams(searchParamsToInput(params));
  const search = effective.search;
  if (search) {
    items.push(descriptor(params, 'search', 'search', `Qidiruv: ${search}`, ['q', 'search']));
  }

  const selectedShortcut = MARKETPLACE_FILTERS.find((filter) => filter.id === textValue(params, 'filter'));
  const shortcutKeys: readonly string[] = selectedShortcut && selectedShortcut.id !== 'all'
    ? MARKETPLACE_QUICK_FILTER_CONTROLLED_KEYS[selectedShortcut.id]
    : [];
  const shortcutIsEffective = Boolean(
    selectedShortcut
    && selectedShortcut.id !== 'all'
    && shortcutMatchesEffectiveState(selectedShortcut.params, effective, shortcutKeys),
  );
  const explicitKeys = (key: string) => shortcutKeys.includes(key)
    ? [key, 'filter']
    : [key];

  if (selectedShortcut && selectedShortcut.id !== 'all' && shortcutIsEffective) {
    items.push(descriptor(
      params,
      `shortcut:${selectedShortcut.id}`,
      'general',
      selectedShortcut.label,
      ['filter', ...shortcutKeys],
    ));
  }

  const minPrice = effective.minPrice;
  const maxPrice = effective.maxPrice;
  if (minPrice !== undefined || maxPrice !== undefined) {
    items.push(descriptor(
      params,
      'price',
      'general',
      priceLabel(minPrice, maxPrice),
      ['minPrice', 'maxPrice'],
    ));
  }

  const platform = effective.attributes?.platform;
  const platformOption = PLATFORM_FILTER_OPTIONS.find((option) => option.value === platform);
  if (textValue(params, 'attr.platform') && platformOption && platformOption.value !== 'MOBILE') {
    items.push(descriptor(
      params,
      'platform',
      'general',
      `Platforma: ${platformOption.label}`,
      ['attr.platform'],
    ));
  }

  if (effective.priceNegotiable === true
    && !(shortcutIsEffective && shortcutKeys.includes('priceNegotiable'))) {
    items.push(descriptor(
      params,
      'negotiable',
      'general',
      'Savdolashish mumkin',
      explicitKeys('priceNegotiable'),
    ));
  }

  const division = finiteNumber(effective.attributes?.highest_division_level);
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
    const minimum = finiteNumber(effective.attributes?.[`${range.key}.min`]);
    const maximum = finiteNumber(effective.attributes?.[`${range.key}.max`]);
    if (minimum === undefined && maximum === undefined) continue;
    if (shortcutIsEffective && (shortcutKeys.includes(minimumKey) || shortcutKeys.includes(maximumKey))) {
      continue;
    }
    items.push(descriptor(
      params,
      range.key,
      'general',
      rangeLabel(range.label, minimum, maximum),
      [minimumKey, maximumKey],
    ));
  }

  const exchangeMode = effective.attributes?.exchange_mode;
  const exchangeLabel = exchangeMode ? EXCHANGE_LABELS[exchangeMode] : undefined;
  if (exchangeLabel
    && !(shortcutIsEffective && shortcutKeys.includes('attr.exchange_mode'))) {
    items.push(descriptor(
      params,
      'exchange',
      'general',
      exchangeLabel,
      explicitKeys('attr.exchange_mode'),
    ));
  }

  if (effective.attributes?.has_google_play_link === 'false'
    && !(shortcutIsEffective && shortcutKeys.includes('attr.has_google_play_link'))) {
    items.push(descriptor(
      params,
      'google-play',
      'general',
      'Google Play ulanmagan',
      explicitKeys('attr.has_google_play_link'),
    ));
  }
  if (effective.attributes?.has_game_center_link === 'false'
    && !(shortcutIsEffective && shortcutKeys.includes('attr.has_game_center_link'))) {
    items.push(descriptor(
      params,
      'game-center',
      'general',
      'Game Center ulanmagan',
      explicitKeys('attr.has_game_center_link'),
    ));
  }

  const valuableId = finiteNumber(effective.attributes?.valuable_players_id);
  const valuableName = effective.attributes?.valuable_players_name;
  if ((valuableId !== undefined && valuableId > 0) || valuableName) {
    items.push(descriptor(
      params,
      'valuable-player',
      'general',
      valuableName ? `Yulduz: ${valuableName}` : 'Tanlangan o‘yinchi',
      ['attr.valuable_players_id', 'attr.valuable_players_name'],
    ));
  }

  const playerCount = effective.matchCards?.length ?? 0;
  if (playerCount > 0) {
    items.push(descriptor(
      params,
      'player-match',
      'player',
      `${playerCount} o‘yinchi · ${strictnessLabel(effective.matchStrictness ?? 4)}`,
      ['matchCard', 'matchStrictness'],
    ));
  }

  return items;
}
