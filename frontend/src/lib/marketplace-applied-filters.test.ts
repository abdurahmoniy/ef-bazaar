import { describe, expect, it } from 'vitest';

import {
  buildAppliedMarketplaceFilters,
  generalAppliedFilterCount,
  playerAppliedFilterCount,
} from './marketplace-applied-filters';

const MESSI_CARD = '101:11111111-1111-4111-8111-111111111111:N';

describe('applied marketplace filters', () => {
  it('describes a combined marketplace query in a stable buyer-facing order', () => {
    const params = new URLSearchParams();
    params.set('q', '  Messi  ');
    params.set('minPrice', '100000');
    params.set('maxPrice', '500000');
    params.set('priceNegotiable', 'true');
    params.set('attr.highest_division_level', '2');
    params.set('attr.team_strength.min', '3000');
    params.set('attr.android_coins.min', '-100');
    params.set('attr.device_transfer_limit.min', '4');
    params.set('attr.exchange_mode', 'BOTH');
    params.set('attr.has_google_play_link', 'false');
    params.set('attr.valuable_players_id', '89138556575063');
    params.set('attr.valuable_players_name', 'Lionel Messi');
    params.append('matchCard', MESSI_CARD);
    params.set('matchStrictness', '6');

    const items = buildAppliedMarketplaceFilters(params);

    expect(items.map((item) => item.label)).toEqual([
      'Qidiruv: Messi',
      "Narx: 100 000–500 000 so'm",
      'Savdolashish mumkin',
      'Division 2',
      'Team Strength: 3 000 dan',
      'Android coin: -100 dan',
      'Transfer limiti: 4 dan',
      'Obmen yoki doplata',
      'Google Play ulanmagan',
      'Yulduz: Lionel Messi',
      '1 o‘yinchi · Muvozanatli',
    ]);
    expect(generalAppliedFilterCount(items)).toBe(9);
    expect(playerAppliedFilterCount(params)).toBe(1);
  });

  it('keeps unrelated state while removing either a search or a shortcut', () => {
    const params = new URLSearchParams('filter=clean&view=grid&page=4&q=Messi');
    const items = buildAppliedMarketplaceFilters(params);

    expect(items.map((item) => item.label)).toEqual(['Qidiruv: Messi', 'Toza akkount']);
    expect(items[0]?.href).toBe('/marketplace?filter=clean&view=grid');
    expect(items[1]?.href).toBe('/marketplace?view=grid&q=Messi');
  });

  it('falls back to the legacy search key and removes both search spellings', () => {
    const items = buildAppliedMarketplaceFilters(
      new URLSearchParams('search=Ronaldo&q=%20&page=3&view=grid'),
    );

    expect(items[0]).toMatchObject({
      kind: 'search',
      label: 'Qidiruv: Ronaldo',
      href: '/marketplace?view=grid',
    });
  });

  it('shows explicit platform only, groups both range ends, and retains negative bounds', () => {
    const params = new URLSearchParams();
    params.set('attr.platform', 'STEAM');
    params.set('attr.team_strength.min', '-20');
    params.set('attr.team_strength.max', '3000');
    params.set('attr.android_coins.min', '-100');
    params.set('attr.android_coins.max', '0');
    params.set('attr.ios_coins.min', '-1');
    params.set('attr.ios_coins.max', '500');
    params.set('attr.device_transfer_limit.min', '-2');
    params.set('attr.device_transfer_limit.max', '8');

    expect(buildAppliedMarketplaceFilters(params).map((item) => item.label)).toEqual([
      'Platforma: Steam',
      'Team Strength: -20 dan – 3 000 gacha',
      'Android coin: -100 dan – 0 gacha',
      'iOS coin: -1 dan – 500 gacha',
      'Transfer limiti: -2 dan – 8 gacha',
    ]);
    expect(buildAppliedMarketplaceFilters(new URLSearchParams()).map((item) => item.label)).toEqual([]);
    expect(buildAppliedMarketplaceFilters(new URLSearchParams('attr.platform=MOBILE'))).toEqual([]);
  });

  it('suppresses shortcut-controlled duplicates and safely ignores invalid public values', () => {
    const params = new URLSearchParams();
    params.set('filter', 'all');
    params.set('priceNegotiable', 'true');
    params.set('attr.exchange_mode', 'NOPE');
    params.set('attr.has_google_play_link', 'false');
    params.set('attr.has_game_center_link', 'false');
    params.set('attr.valuable_players_id', 'not-a-number');
    params.set('attr.valuable_players_name', '   ');
    params.append('matchCard', 'not-a-card');
    params.set('matchStrictness', 'not-a-number');

    expect(buildAppliedMarketplaceFilters(params).map((item) => item.label)).toEqual([
      'Savdolashish mumkin',
      'Google Play ulanmagan',
      'Game Center ulanmagan',
    ]);
    expect(playerAppliedFilterCount(params)).toBe(0);

    const clean = new URLSearchParams(
      'filter=clean&attr.has_google_play_link=false&attr.has_game_center_link=false&page=3&view=list&tag=one&tag=two',
    );
    const [cleanItem] = buildAppliedMarketplaceFilters(clean);
    expect(cleanItem?.label).toBe('Toza akkount');
    expect(cleanItem?.href).toBe('/marketplace?view=list&tag=one&tag=two');
  });

  it('falls back safely for iOS, Game Center, and valuable-player criteria', () => {
    const params = new URLSearchParams();
    params.set('attr.has_game_center_link', 'false');
    params.set('attr.valuable_players_id', '42');
    params.set('attr.ios_coins.max', '250');

    expect(buildAppliedMarketplaceFilters(params).map((item) => item.label)).toEqual([
      'iOS coin: 250 gacha',
      'Game Center ulanmagan',
      'Tanlangan o‘yinchi',
    ]);
  });

  it('removes only a chip’s criteria, resets page, and preserves repeated unrelated values', () => {
    const params = new URLSearchParams(
      `q=Messi&page=4&attr.team_strength.min=3000&attr.team_strength.max=4000&matchCard=${encodeURIComponent(MESSI_CARD)}&matchCard=bad&view=grid&tag=one&tag=two`,
    );
    const items = buildAppliedMarketplaceFilters(params);
    const strength = items.find((item) => item.label.startsWith('Team Strength'));
    const players = items.find((item) => item.kind === 'player');

    expect(strength?.href).toBe(
      `/marketplace?q=Messi&matchCard=${encodeURIComponent(MESSI_CARD)}&matchCard=bad&view=grid&tag=one&tag=two`,
    );
    expect(players?.href).toBe('/marketplace?q=Messi&attr.team_strength.min=3000&attr.team_strength.max=4000&view=grid&tag=one&tag=two');
  });
});
