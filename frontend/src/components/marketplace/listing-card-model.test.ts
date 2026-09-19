import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildListingCardModel } from './listing-card-model';
import { attributeCardList, type ListingResponse } from '@/lib/marketplace-types';

const messiId = '11111111-1111-4111-8111-111111111111';
const neymarId = '22222222-2222-4222-8222-222222222222';

function listing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    sellerId: 'seller-1',
    description: 'Rare account',
    price: 500000,
    priceNegotiable: true,
    mediaMessageIds: [],
    status: 'ACTIVE',
    forwardCount: 0,
    likeCount: 2,
    likedByMe: false,
    createdAt: '2026-08-11T00:00:00Z',
    updatedAt: '2026-08-11T00:00:00Z',
    attributes: {},
    ...overrides,
  };
}

describe('listing card model', () => {
  it('normalizes snake and camel META tiers from attached card snapshots', () => {
    const cards = attributeCardList(listing({
      attributes: {
        valuable_players: [
          { efhub_id: 101, name: 'Messi', meta_tier: 'META' },
          { efhubId: 202, name: 'Neymar', metaTier: 'NORMAL' },
          { efhub_id: 303, name: 'Mbappé', meta_tier: 'UNKNOWN' },
        ],
      },
    }), 'valuable_players');

    expect(cards.map((card) => card.metaTier)).toEqual(['META', 'NORMAL', undefined]);
  });

  it('preserves catalogue META tiers through listing form edit and submit snapshots', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/marketplace/listing-form.tsx'),
      'utf8',
    );

    expect(source).toMatch(/metaTier:\s*metaTierRaw === 'META' \|\| metaTierRaw === 'NORMAL'/);
    expect(source).toContain("payload.meta_tier = card.metaTier");
  });

  it('reports META only when an attached valuable card is genuinely META', () => {
    expect(buildListingCardModel(listing({
      attributes: {
        valuable_players: [
          { efhub_id: 101, name: 'Messi', card_type: 'BIGTIME', meta_tier: 'META' },
        ],
      },
    }), []).hasMetaCard).toBe(true);

    expect(buildListingCardModel(listing({
      description: 'META account',
      attributes: {
        valuable_players: [
          { efhub_id: 101, name: 'Messi', card_type: 'BIGTIME', meta_tier: 'NORMAL' },
        ],
        meta_tier: 'META',
      },
    }), []).hasMetaCard).toBe(false);
  });

  it('derives exact and alternate names through efhub and canonical player identity', () => {
    const model = buildListingCardModel(listing({
      matchPercent: 58,
      matchDetails: {
        percent: 58,
        exactCount: 1,
        alternateCount: 1,
        missingCount: 1,
        selectedCount: 3,
        strictness: 5,
        exactEfhubIds: [101],
        alternateEfhubIds: [202],
        missingEfhubIds: [303],
        priorityEfhubIds: [],
        earnedWeight: 1.75,
        possibleWeight: 3,
      },
      attributes: {
        valuable_players: [
          { efhub_id: 101, player_id: messiId, name: 'Lionel Messi' },
          { efhub_id: 999, player_id: neymarId, name: 'Neymar Jr' },
          {
            efhub_id: 404,
            player_id: '44444444-4444-4444-8444-444444444444',
            name: 'Mbappé',
          },
        ],
      },
    }), [
      { efhubId: 101, playerId: messiId, importance: 'N' },
      { efhubId: 202, playerId: neymarId, importance: 'N' },
      {
        efhubId: 303,
        playerId: '33333333-3333-4333-8333-333333333333',
        importance: 'N',
      },
    ]);

    expect(model.matchLabel).toBe('2/3 mos · 58%');
    expect(model.playerNames).toEqual(['Lionel Messi', 'Neymar Jr']);
    expect(model.playerRemainder).toBe(1);
  });

  it('promotes matched players before unmatched valuable cards without inventing names', () => {
    const model = buildListingCardModel(listing({
      matchDetails: {
        percent: 50,
        exactCount: 1,
        alternateCount: 0,
        missingCount: 1,
        selectedCount: 2,
        strictness: 4,
        exactEfhubIds: [202],
        alternateEfhubIds: [],
        missingEfhubIds: [303],
        priorityEfhubIds: [],
        earnedWeight: 1,
        possibleWeight: 2,
      },
      attributes: {
        valuable_players: [
          { efhub_id: 101, player_id: messiId, name: 'Lionel Messi' },
          { efhub_id: 202, player_id: neymarId, name: 'Neymar Jr' },
          { efhub_id: 303, name: '   ' },
        ],
      },
    }), [{ efhubId: 202, playerId: neymarId, importance: 'P' }]);

    expect(model.playerNames).toEqual(['Neymar Jr', 'Lionel Messi']);
    expect(model.playerRemainder).toBe(0);
  });

  it('falls back to valuable names and condenses transfer risks', () => {
    const model = buildListingCardModel(listing({
      attributes: {
        valuable_players: [
          { efhub_id: 101, name: 'Messi' },
          { efhub_id: 202, name: 'Neymar' },
          { efhub_id: 303, name: 'Mbappé' },
        ],
        has_google_play_link: true,
        has_game_center_link: true,
        device_transfer_limit: 2,
      },
    }), []);

    expect(model.playerNames).toEqual(['Messi', 'Neymar']);
    expect(model.playerRemainder).toBe(1);
    expect(model.safety).toEqual({ tone: 'warning', label: '3 ta transfer xavfi' });
  });

  it('shows positive safety only when every relevant value is explicitly safe', () => {
    expect(buildListingCardModel(listing(), []).safety).toBeNull();
    expect(buildListingCardModel(listing({
      attributes: {
        has_google_play_link: null,
        has_game_center_link: false,
        device_transfer_limit: 7,
      },
    }), []).safety).toBeNull();
    expect(buildListingCardModel(listing({
      attributes: {
        has_google_play_link: false,
        has_game_center_link: false,
        device_transfer_limit: 7,
      },
    }), []).safety).toEqual({ tone: 'safe', label: 'Transfer xavfsiz' });
  });

  it('keeps non-zero platform coin balances on feed cards', () => {
    expect(buildListingCardModel(listing({
      attributes: { android_coins: 125, ios_coins: -900 },
    }), [])).toMatchObject({
      androidCoins: 125,
      iosCoins: -900,
    });

    expect(buildListingCardModel(listing({
      attributes: { android_coins: 0, ios_coins: 75 },
    }), [])).toMatchObject({
      androidCoins: undefined,
      iosCoins: 75,
    });
  });

  it('does not call missing service-link answers clean', () => {
    expect(buildListingCardModel(listing({ attributes: {} }), []).clean).toBe(false);
    expect(buildListingCardModel(listing({ attributes: { has_google_play_link: false } }), []).clean).toBe(false);
  });

  it('determines clean accounts based on links and coin balances', () => {
    expect(buildListingCardModel(listing({
      attributes: {
        has_google_play_link: false,
        has_game_center_link: false,
        android_coins: 100,
      },
    }), []).clean).toBe(true);

    expect(buildListingCardModel(listing({
      attributes: {
        has_google_play_link: true,
        has_game_center_link: false,
      },
    }), []).clean).toBe(false);

    expect(buildListingCardModel(listing({
      attributes: {
        has_google_play_link: false,
        has_game_center_link: true,
      },
    }), []).clean).toBe(false);

    expect(buildListingCardModel(listing({
      attributes: {
        has_google_play_link: false,
        has_game_center_link: false,
        ios_coins: -500,
      },
    }), []).clean).toBe(false);
  });
});
