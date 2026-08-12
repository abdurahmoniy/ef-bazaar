import type { PlayerMatchSelection } from './player-filter-selection';
import type { PlayerMatchCriterion } from './player-match-query';

export const PLAYER_FILTER_CACHE_KEY = 'efbazaar:player-filter-cards:v1';

const MAX_PLAYER_SELECTIONS = 11;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const optionalStrings = [
  'cardType',
  'playingStyle',
  'position',
  'imageUrl',
] as const;

const optionalRatings = ['overallRating', 'maxOverallRating'] as const;

export function serializePlayerFilterCache(cards: PlayerMatchSelection[]): string {
  return JSON.stringify(cards.slice(0, MAX_PLAYER_SELECTIONS));
}

export function parsePlayerFilterCache(raw: string | null): PlayerMatchSelection[] {
  if (!raw) return [];

  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];

    return value.flatMap((candidate): PlayerMatchSelection[] => {
      if (!candidate || typeof candidate !== 'object') return [];
      const item = candidate as Record<string, unknown>;
      if (!Number.isSafeInteger(item.efhubId) || (item.efhubId as number) <= 0
        || typeof item.playerId !== 'string' || !UUID.test(item.playerId)
        || typeof item.name !== 'string' || item.name.trim().length === 0) {
        return [];
      }

      const card: PlayerMatchSelection = {
        efhubId: item.efhubId as number,
        playerId: item.playerId,
        name: item.name,
      };
      if (typeof item.priority === 'boolean') card.priority = item.priority;
      for (const key of optionalStrings) {
        if (typeof item[key] === 'string' && item[key].trim()) card[key] = item[key];
      }
      for (const key of optionalRatings) {
        if (typeof item[key] === 'number' && Number.isFinite(item[key])) card[key] = item[key];
      }
      return [card];
    }).slice(0, MAX_PLAYER_SELECTIONS);
  } catch {
    return [];
  }
}

export function mergeCachedPlayerSelections(
  criteria: PlayerMatchCriterion[],
  cached: PlayerMatchSelection[],
): PlayerMatchSelection[] {
  return criteria.slice(0, MAX_PLAYER_SELECTIONS).map((criterion) => {
    const exact = cached.find((card) => card.efhubId === criterion.efhubId);
    const canonical = exact
      ? undefined
      : cached.find((card) => card.playerId === criterion.playerId);
    const snapshot = exact
      ? exact
      : canonical
        ? { name: canonical.name }
        : undefined;

    return {
      ...snapshot,
      efhubId: criterion.efhubId,
      playerId: criterion.playerId,
      name: snapshot?.name ?? 'Tanlangan karta',
      priority: criterion.importance === 'P',
    };
  });
}
