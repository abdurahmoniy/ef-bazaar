import type { AttachedPlayerCard, DreamTeam } from './marketplace-types';

export type PlayerFilterTab = 'meta' | 'search' | 'team';

export interface PlayerMatchSelection extends AttachedPlayerCard {
  priority?: boolean;
}

export function playerMatchSelectionForTab(
  tab: PlayerFilterTab,
  team: DreamTeam | null,
  picked: PlayerMatchSelection[],
): PlayerMatchSelection[] {
  if (tab !== 'team') return picked;
  if (!team) return [];
  return team.slots.flatMap((slot) => slot.card?.playerId ? [{
    ...slot.card,
    priority: (slot.w ?? 1) >= 3,
  }] : []);
}
