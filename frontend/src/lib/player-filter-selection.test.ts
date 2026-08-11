import { describe, expect, it } from 'vitest';

import { playerMatchSelectionForTab, type PlayerMatchSelection } from './player-filter-selection';
import type { DreamTeam } from './marketplace-types';

const savedTeam = {
  id: 'team-1',
  name: 'Mening jamoam',
  formation: '4-3-3',
  slots: [{
    index: 9,
    position: 'CF',
    w: 3,
    card: {
      efhubId: 101,
      playerId: '11111111-1111-4111-8111-111111111111',
      name: 'Saved player',
    },
  }],
  createdAt: '2026-08-11T00:00:00Z',
  updatedAt: '2026-08-11T00:00:00Z',
} satisfies DreamTeam;

const picked: PlayerMatchSelection[] = [{
  efhubId: 202,
  playerId: '22222222-2222-4222-8222-222222222222',
  name: 'Picked player',
}];

describe('playerMatchSelectionForTab', () => {
  it('uses the singleton saved team automatically on the team tab', () => {
    expect(playerMatchSelectionForTab('team', savedTeam, picked)).toEqual([{
      ...savedTeam.slots[0].card,
      priority: true,
    }]);
  });

  it('uses manual selections on META/search and returns empty without a saved team', () => {
    expect(playerMatchSelectionForTab('meta', savedTeam, picked)).toEqual(picked);
    expect(playerMatchSelectionForTab('search', savedTeam, picked)).toEqual(picked);
    expect(playerMatchSelectionForTab('team', null, picked)).toEqual([]);
  });
});
