import { describe, expect, it } from 'vitest';

import { parsePlayerMatchValues, strictnessLabel, writePlayerMatch } from './player-match-query';

describe('player match query', () => {
  it('parses canonical criteria, priority, and strictness one without truthiness bugs', () => {
    const parsed = parsePlayerMatchValues([
      '202:22222222-2222-4222-8222-222222222222:P',
      '101:11111111-1111-4111-8111-111111111111:N',
    ], '1');

    expect(parsed.strictness).toBe(1);
    expect(parsed.criteria).toEqual([
      { efhubId: 101, playerId: '11111111-1111-4111-8111-111111111111', importance: 'N' },
      { efhubId: 202, playerId: '22222222-2222-4222-8222-222222222222', importance: 'P' },
    ]);
  });

  it('writes repeatable matchCard values while preserving unrelated filters', () => {
    const current = new URLSearchParams('attr.platform=MOBILE&page=3&view=list');
    const next = writePlayerMatch(current, {
      criteria: [{
        efhubId: 101,
        playerId: '11111111-1111-4111-8111-111111111111',
        importance: 'P',
      }],
      strictness: 4,
    });

    expect(next.get('attr.platform')).toBe('MOBILE');
    expect(next.get('view')).toBe('list');
    expect(next.get('page')).toBeNull();
    expect(next.getAll('matchCard')).toEqual([
      '101:11111111-1111-4111-8111-111111111111:P',
    ]);
    expect(next.get('matchStrictness')).toBe('4');
  });

  it('drops malformed and duplicate canonical players and clamps strictness', () => {
    expect(parsePlayerMatchValues([
      'bad',
      '101:11111111-1111-4111-8111-111111111111:N',
      '202:11111111-1111-4111-8111-111111111111:P',
    ], '99')).toEqual({
      criteria: [{
        efhubId: 101,
        playerId: '11111111-1111-4111-8111-111111111111',
        importance: 'N',
      }],
      strictness: 10,
    });
  });

  it.each([
    [1, 'Keng qidiruv'],
    [2, 'Keng qidiruv'],
    [3, 'Moslashuvchan'],
    [4, 'Moslashuvchan'],
    [5, 'Muvozanatli'],
    [6, 'Muvozanatli'],
    [7, 'Aniqroq'],
    [8, 'Aniqroq'],
    [9, 'Juda qat’iy'],
    [10, 'Juda qat’iy'],
  ])('uses the shared five-band label for strictness %i', (strictness, expected) => {
    expect(strictnessLabel(strictness)).toBe(expected);
  });
});
