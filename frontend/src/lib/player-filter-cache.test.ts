import { describe, expect, it } from 'vitest';

import {
  mergeCachedPlayerSelections,
  parsePlayerFilterCache,
  serializePlayerFilterCache,
} from './player-filter-cache';

const playerId = '11111111-1111-4111-8111-111111111111';

describe('player filter presentation cache', () => {
  it('round-trips at most eleven valid rich card snapshots', () => {
    const cards = Array.from({ length: 12 }, (_, index) => ({
      efhubId: index + 1,
      playerId: index === 11
        ? '22222222-2222-4222-8222-222222222222'
        : playerId.replace(/^11/, String(index + 10).padStart(2, '0')),
      name: `Player ${index + 1}`,
      priority: index === 0,
      maxOverallRating: 100 + index,
      cardType: 'EPIC',
      imageUrl: `/player-${index + 1}.png`,
    }));

    const parsed = parsePlayerFilterCache(serializePlayerFilterCache(cards));

    expect(parsed).toHaveLength(11);
    expect(parsed[0]).toEqual(cards[0]);
    expect(parsed.at(-1)).toEqual(cards[10]);
  });

  it('prefers the exact edition and limits canonical fallback to the player name', () => {
    const cached = [
      {
        efhubId: 101,
        playerId,
        name: 'Lionel Messi',
        priority: true,
        maxOverallRating: 106,
        cardType: 'EPIC',
        imageUrl: '/messi-epic.png',
      },
      {
        efhubId: 202,
        playerId,
        name: 'Lionel Messi',
        priority: false,
        maxOverallRating: 99,
        cardType: 'STANDARD',
        imageUrl: '/messi-standard.png',
      },
    ];

    expect(parsePlayerFilterCache(serializePlayerFilterCache(cached))).toEqual(cached);
    expect(mergeCachedPlayerSelections([
      { efhubId: 202, playerId, importance: 'P' },
    ], cached)[0]).toMatchObject({
      efhubId: 202,
      playerId,
      name: 'Lionel Messi',
      priority: true,
      maxOverallRating: 99,
      cardType: 'STANDARD',
      imageUrl: '/messi-standard.png',
    });
    expect(mergeCachedPlayerSelections([
      { efhubId: 303, playerId, importance: 'N' },
    ], cached)[0]).toEqual({
      efhubId: 303,
      playerId,
      name: 'Lionel Messi',
      priority: false,
    });
  });

  it('ignores unsafe records and uses neutral copy without a session snapshot', () => {
    const mixed = JSON.stringify([
      null,
      { efhubId: 0, playerId, name: 'Zero' },
      { efhubId: 101, playerId: 'not-a-uuid', name: 'Bad identity' },
      { efhubId: 102, playerId, name: '' },
      { efhubId: 103, playerId, name: 'Valid', maxOverallRating: '106' },
    ]);

    expect(parsePlayerFilterCache(mixed)).toEqual([
      { efhubId: 103, playerId, name: 'Valid' },
    ]);
    expect(mergeCachedPlayerSelections([
      { efhubId: 101, playerId, importance: 'N' },
    ], [])[0].name).toBe('Tanlangan karta');
    expect(parsePlayerFilterCache('{bad json')).toEqual([]);
    expect(parsePlayerFilterCache('{}')).toEqual([]);
  });
});
