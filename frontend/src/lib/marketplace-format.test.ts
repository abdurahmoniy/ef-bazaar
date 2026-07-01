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
} from './marketplace-format';

describe('marketplace formatting helpers', () => {
  it('formats listing prices in Uzbek som', () => {
    expect(formatPriceUZS(450000)).toBe("450 000 so'm");
    expect(formatPriceUZS('1250000.99')).toBe("1 250 001 so'm");
  });

  it('formats compact integer metrics with spaces', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(12500)).toBe('12 500');
  });

  it('formats listing dates in Uzbekistan time', () => {
    expect(formatListingDate('2026-06-29T12:00:00Z')).toBe('29 iyun 17:00');
  });

  it('labels valid and invalid divisions', () => {
    expect(divisionLabel(1)).toBe('Division 1');
    expect(divisionLabel(9)).toBe('Division 9');
    expect(divisionLabel(15)).toBe('Division -');
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
      attributes: { valuable_players: 'Neymar' },
    });
  });

  it('applies the google-linked filter as an attribute equality param', () => {
    const parsed = parseListingSearchParams({ filter: 'google' });
    expect(parsed.attributes).toEqual({ has_google_play_link: 'true' });
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
});
