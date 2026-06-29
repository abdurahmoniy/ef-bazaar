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
      filter: 'division-1-3',
      page: '2',
      q: 'Messi',
      valuablePlayer: 'Neymar',
    });

    expect(parsed).toEqual({
      minDivision: 1,
      maxDivision: 3,
      page: 2,
      search: 'Messi',
      valuablePlayer: 'Neymar',
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
      hasGooglePlayLink: true,
      priceNegotiable: false,
      minTeamStrength: 3000,
      search: '  Messi  ',
    });

    expect(params.get('page')).toBe('1');
    expect(params.get('size')).toBe('12');
    expect(params.get('sort')).toBe('createdAt,desc');
    expect(params.get('hasGooglePlayLink')).toBe('true');
    expect(params.get('priceNegotiable')).toBe('false');
    expect(params.get('minTeamStrength')).toBe('3000');
    expect(params.get('search')).toBe('Messi');
    expect(params.has('maxPrice')).toBe(false);
  });
});
