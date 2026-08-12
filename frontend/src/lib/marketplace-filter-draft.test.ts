import { describe, expect, it } from 'vitest';

import {
  applyMarketplaceFilterDraft,
  clearMarketplaceFilterDraft,
  filterDraftFromBrowseParams,
  validateMarketplaceFilterDraft,
  type MarketplaceFilterDraft,
} from './marketplace-filter-draft';

const MESSI_CARD = '101:11111111-1111-4111-8111-111111111111:N';
const NEYMAR_CARD = '202:22222222-2222-4222-8222-222222222222:P';

function draft(overrides: Partial<MarketplaceFilterDraft> = {}): MarketplaceFilterDraft {
  return { ...clearMarketplaceFilterDraft(), ...overrides };
}

describe('marketplace filter draft', () => {
  it('hydrates normalized browse filters and clears to the Mobile baseline', () => {
    const hydrated = filterDraftFromBrowseParams({
      minPrice: 100_000,
      priceNegotiable: true,
      attributes: {
        platform: 'STEAM',
        'team_strength.min': '3200',
        has_google_play_link: 'false',
        valuable_players_id: '101',
        valuable_players_name: ' Lionel Messi ',
      },
    });

    expect(hydrated).toEqual(draft({
      platform: 'STEAM',
      minPrice: '100000',
      priceNegotiable: true,
      teamStrengthMin: '3200',
      googlePlayDisconnected: true,
      valuablePlayer: { efhubId: 101, name: 'Lionel Messi' },
    }));
    expect(clearMarketplaceFilterDraft()).toEqual({
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
    });
  });

  it('returns the exact validation errors for an invalid detailed filter', () => {
    expect(validateMarketplaceFilterDraft(draft({
      minPrice: '-1',
      maxPrice: '100',
      division: '8',
      teamStrengthMin: '4100',
      teamStrengthMax: '3000',
      androidCoinsMin: '1.5',
      transferLimitMin: '11',
    }))).toEqual({
      minPrice: 'Narx 0 dan kam bo‘lishi mumkin emas.',
      division: 'Division 1–4 oralig‘ida bo‘lishi kerak.',
      teamStrength: 'Eng kam kuch eng yuqori kuchdan oshmasligi kerak.',
      androidCoinsMin: 'Butun son kiriting.',
      transferLimitMin: '0 dan 10 gacha son kiriting.',
    });
  });

  it('validates each numeric boundary without throwing on non-finite values', () => {
    expect(validateMarketplaceFilterDraft(draft({ platform: 'WEB' as never }))).toEqual({
      platform: 'Platformani tanlang.',
    });
    expect(validateMarketplaceFilterDraft(draft({ minPrice: '10.5' }))).toEqual({
      minPrice: 'Butun son kiriting.',
    });
    expect(validateMarketplaceFilterDraft(draft({ maxPrice: 'Infinity' }))).toEqual({
      maxPrice: 'Butun son kiriting.',
    });
    expect(validateMarketplaceFilterDraft(draft({ minPrice: 'NaN' }))).toEqual({
      minPrice: 'Butun son kiriting.',
    });
    expect(validateMarketplaceFilterDraft(draft({ minPrice: '100', maxPrice: '99' }))).toEqual({
      price: 'Eng kam narx eng yuqori narxdan oshmasligi kerak.',
    });
    expect(validateMarketplaceFilterDraft(draft({ teamStrengthMin: '900' }))).toEqual({
      teamStrengthMin: '1000 dan kam bo‘lmasligi kerak.',
    });
    expect(validateMarketplaceFilterDraft(draft({ teamStrengthMax: '5001' }))).toEqual({
      teamStrengthMax: '5000 dan oshmasligi kerak.',
    });
    expect(validateMarketplaceFilterDraft(draft({ androidCoinsMin: '-4', iosCoinsMin: '-5' }))).toEqual({});
    expect(validateMarketplaceFilterDraft(draft({ iosCoinsMin: '3.1' }))).toEqual({
      iosCoinsMin: 'Butun son kiriting.',
    });
    expect(validateMarketplaceFilterDraft(draft({ transferLimitMin: '0' }))).toEqual({});
    expect(validateMarketplaceFilterDraft(draft({ transferLimitMin: '10' }))).toEqual({});
  });

  it('preserves strength bound errors instead of replacing them with a reversal error', () => {
    expect(validateMarketplaceFilterDraft(draft({
      teamStrengthMin: '6000',
      teamStrengthMax: '5500',
    }))).toEqual({
      teamStrengthMin: '5000 dan oshmasligi kerak.',
      teamStrengthMax: '5000 dan oshmasligi kerak.',
    });
  });

  it('uses only the group error when valid strength bounds are reversed', () => {
    expect(validateMarketplaceFilterDraft(draft({
      teamStrengthMin: '4100',
      teamStrengthMax: '3000',
    }))).toEqual({
      teamStrength: 'Eng kam kuch eng yuqori kuchdan oshmasligi kerak.',
    });
  });

  it('ignores invalid platform and valuable-player values while hydrating', () => {
    expect(filterDraftFromBrowseParams({
      attributes: {
        platform: 'web',
        valuable_players_id: '1.5',
        valuable_players_name: ' Messi ',
      },
    })).toEqual(draft());
    expect(filterDraftFromBrowseParams({
      attributes: {
        valuable_players_id: '101',
        valuable_players_name: '   ',
      },
    }).valuablePlayer).toBeNull();
  });

  it('applies a clean detailed draft without mutating or discarding unrelated criteria', () => {
    const current = new URLSearchParams();
    current.set('q', 'Messi');
    current.set('search', 'legacy');
    current.set('filter', 'clean');
    current.set('page', '4');
    current.set('sort', 'price,asc');
    current.set('view', 'grid');
    current.set('attr.team_strength.min', '2000');
    current.set('attr.android_coins.min', '500');
    current.append('matchCard', MESSI_CARD);
    current.append('matchCard', NEYMAR_CARD);
    current.append('tracking', 'one');
    current.append('tracking', 'two');

    const next = applyMarketplaceFilterDraft(current, draft({
      minPrice: '100000',
      maxPrice: '200000',
      priceNegotiable: true,
      division: '2',
      teamStrengthMin: '3000',
      teamStrengthMax: '4000',
      androidCoinsMin: '-100',
      iosCoinsMin: '250',
      transferLimitMin: '4',
      exchangeMode: 'BOTH',
      googlePlayDisconnected: true,
      gameCenterDisconnected: true,
      valuablePlayer: { efhubId: 101, name: 'Messi' },
    }));

    expect(next.get('filter')).toBeNull();
    expect(next.get('page')).toBeNull();
    expect(next.get('attr.platform')).toBeNull();
    expect(next.get('minPrice')).toBe('100000');
    expect(next.get('maxPrice')).toBe('200000');
    expect(next.get('priceNegotiable')).toBe('true');
    expect(next.get('attr.highest_division_level')).toBe('2');
    expect(next.get('attr.team_strength.min')).toBe('3000');
    expect(next.get('attr.team_strength.max')).toBe('4000');
    expect(next.get('attr.android_coins.min')).toBe('-100');
    expect(next.get('attr.ios_coins.min')).toBe('250');
    expect(next.get('attr.device_transfer_limit.min')).toBe('4');
    expect(next.get('attr.exchange_mode')).toBe('BOTH');
    expect(next.get('attr.has_google_play_link')).toBe('false');
    expect(next.get('attr.has_game_center_link')).toBe('false');
    expect(next.get('attr.valuable_players_id')).toBe('101');
    expect(next.get('attr.valuable_players_name')).toBe('Messi');
    expect(next.get('q')).toBe('Messi');
    expect(next.get('search')).toBe('legacy');
    expect(next.get('sort')).toBe('price,asc');
    expect(next.get('view')).toBe('grid');
    expect(next.getAll('matchCard')).toEqual([MESSI_CARD, NEYMAR_CARD]);
    expect(next.getAll('tracking')).toEqual(['one', 'two']);
    expect(current.get('filter')).toBe('clean');
    expect(current.get('page')).toBe('4');
    expect(current.get('attr.team_strength.min')).toBe('2000');
  });

  it('removes stale owned values and only serializes a complete valuable player', () => {
    const current = new URLSearchParams(
      'q=Messi&sort=price%2Casc&view=grid&attr.platform=PLAYSTATION&minPrice=1&maxPrice=2&priceNegotiable=true&attr.highest_division_level=4&attr.team_strength.min=1000&attr.team_strength.max=2000&attr.android_coins.min=3&attr.android_coins.max=10&attr.ios_coins.min=4&attr.ios_coins.max=20&attr.device_transfer_limit.min=5&attr.device_transfer_limit.max=6&attr.exchange_mode=BOTH&attr.has_google_play_link=false&attr.has_game_center_link=false&attr.valuable_players_id=101&attr.valuable_players_name=Messi&matchCard=101%3A11111111-1111-4111-8111-111111111111%3AN&tracking=one&tracking=two',
    );
    const next = applyMarketplaceFilterDraft(current, draft({
      valuablePlayer: { efhubId: 0, name: 'Messi' },
    }));

    for (const key of [
      'attr.platform', 'minPrice', 'maxPrice', 'priceNegotiable',
      'attr.highest_division_level', 'attr.team_strength.min', 'attr.team_strength.max',
      'attr.android_coins.min', 'attr.android_coins.max',
      'attr.ios_coins.min', 'attr.ios_coins.max',
      'attr.device_transfer_limit.min', 'attr.device_transfer_limit.max',
      'attr.exchange_mode', 'attr.has_google_play_link', 'attr.has_game_center_link',
      'attr.valuable_players_id', 'attr.valuable_players_name',
    ]) expect(next.has(key)).toBe(false);
    expect(next.get('q')).toBe('Messi');
    expect(next.get('sort')).toBe('price,asc');
    expect(next.get('view')).toBe('grid');
    expect(next.getAll('matchCard')).toEqual([MESSI_CARD]);
    expect(next.getAll('tracking')).toEqual(['one', 'two']);
  });
});
