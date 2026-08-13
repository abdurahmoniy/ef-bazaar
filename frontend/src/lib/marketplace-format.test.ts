import { describe, expect, it } from 'vitest';

import {
  buildListingSearchParams,
  divisionLabel,
  formatCompactNumber,
  formatListingDate,
  formatPriceUZS,
  getSelectedMarketplaceFilter,
  normalizePlayerList,
  parseListingSearchParams,
  searchParamInputToSearchParams,
} from './marketplace-format';

describe('marketplace formatting helpers', () => {
  it('formats listing prices in Uzbek som', () => {
    expect(formatPriceUZS(450000)).toBe("450 000 so'm");
    expect(formatPriceUZS('1250000.99')).toBe("1 250 001 so'm");
  });

  it('formats compact integer metrics with spaces', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(12500)).toBe('12 500');
    // Coin balances can go below zero (spent > owned).
    expect(formatCompactNumber(-12500)).toBe('-12 500');
    expect(formatCompactNumber(-900)).toBe('-900');
  });

  it('formats listing dates in Uzbekistan time', () => {
    expect(formatListingDate('2026-06-29T12:00:00Z')).toBe('29 iyun 17:00');
  });

  it('labels valid and invalid divisions', () => {
    expect(divisionLabel(1)).toBe('Division 1');
    expect(divisionLabel(3)).toBe('Division 3');
    expect(divisionLabel(4)).toBe('Division 4+');
    expect(divisionLabel(9)).toBe('Division 4+');
    expect(divisionLabel(0)).toBe('Division -');
    expect(divisionLabel(undefined)).toBe('Division -');
  });

  it('normalizes valuable player text into a bounded list', () => {
    expect(normalizePlayerList('Messi, Neymar\n Mbappe ,, Epic')).toEqual([
      'Messi',
      'Neymar',
      'Mbappe',
      'Epic',
    ]);
  });

  it('parses search params into listing browse filters', () => {
    const parsed = parseListingSearchParams({
      page: '2',
      q: 'Messi',
      'attr.valuable_players': 'Neymar',
    });

    expect(parsed).toEqual({
      page: 2,
      search: 'Messi',
      attributes: { valuable_players: 'Neymar', platform: 'MOBILE' },
    });
  });

  it('defaults the required platform filter and lets the URL override it', () => {
    expect(parseListingSearchParams({}).attributes).toEqual({ platform: 'MOBILE' });
    expect(parseListingSearchParams({ 'attr.platform': 'STEAM' }).attributes).toEqual({
      platform: 'STEAM',
    });
  });

  it('round-trips attribute range params (attr.<key>.min/.max)', () => {
    const parsed = parseListingSearchParams({
      'attr.team_strength.min': '2000',
      'attr.team_strength.max': '4000',
      'attr.android_coins.min': '',
      'attr.exchange_mode': 'BOTH',
    });

    expect(parsed.attributes).toEqual({
      'team_strength.min': '2000',
      'team_strength.max': '4000',
      exchange_mode: 'BOTH',
      platform: 'MOBILE',
    });

    const rebuilt = buildListingSearchParams(parsed);
    expect(rebuilt.get('attr.team_strength.min')).toBe('2000');
    expect(rebuilt.get('attr.team_strength.max')).toBe('4000');
    expect(rebuilt.get('attr.exchange_mode')).toBe('BOTH');
    expect(rebuilt.has('attr.android_coins.min')).toBe(false);
  });

  it('applies the clean-account filter as attribute equality params', () => {
    const parsed = parseListingSearchParams({ filter: 'clean' });
    expect(parsed.attributes).toEqual({
      has_google_play_link: 'false',
      has_game_center_link: 'false',
      'android_coins.min': '0',
      'ios_coins.min': '0',
      platform: 'MOBILE',
    });
  });

  it('falls back to the all filter for unknown filter ids', () => {
    expect(getSelectedMarketplaceFilter({ filter: 'unknown' })).toBe('all');
  });

  it('builds listing query strings without undefined values', () => {
    const params = buildListingSearchParams({
      page: 1,
      size: 12,
      sort: 'createdAt,desc',
      priceNegotiable: false,
      search: '  Messi  ',
      attributes: { has_google_play_link: 'true', highest_division_level: '7' },
    });

    expect(params.get('page')).toBe('1');
    expect(params.get('size')).toBe('12');
    expect(params.get('sort')).toBe('createdAt,desc');
    expect(params.get('priceNegotiable')).toBe('false');
    expect(params.get('search')).toBe('Messi');
    expect(params.get('attr.has_google_play_link')).toBe('true');
    expect(params.get('attr.highest_division_level')).toBe('7');
    expect(params.has('maxPrice')).toBe(false);
  });

  it('preserves the complete originating marketplace query for detail navigation', () => {
    const params = searchParamInputToSearchParams({
      page: '3',
      q: 'Messi',
      filter: 'clean',
      view: 'list',
      matchCard: ['101:11111111-1111-4111-8111-111111111111:N', '202:22222222-2222-4222-8222-222222222222:P'],
    });

    expect(params.get('page')).toBe('3');
    expect(params.get('q')).toBe('Messi');
    expect(params.get('filter')).toBe('clean');
    expect(params.get('view')).toBe('list');
    expect(params.getAll('matchCard')).toHaveLength(2);
  });
});
