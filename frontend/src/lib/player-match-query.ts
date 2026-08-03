export type MatchImportance = 'N' | 'P';

export interface PlayerMatchCriterion {
  efhubId: number;
  playerId: string;
  importance: MatchImportance;
  /** Client-only label; not serialized into the public matcher contract. */
  name?: string;
}

export interface PlayerMatchState {
  criteria: PlayerMatchCriterion[];
  strictness: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePlayerMatchValues(
  rawCriteria: readonly string[] | undefined,
  rawStrictness: string | undefined,
): PlayerMatchState {
  const criteria: PlayerMatchCriterion[] = [];
  const seenPlayers = new Set<string>();
  for (const raw of rawCriteria ?? []) {
    const [rawEfhubId, rawPlayerId, rawImportance, ...extra] = raw.split(':');
    const efhubId = Number(rawEfhubId);
    const playerId = rawPlayerId?.toLowerCase();
    if (extra.length || !Number.isSafeInteger(efhubId) || efhubId <= 0
      || !playerId || !UUID.test(playerId)
      || (rawImportance !== 'N' && rawImportance !== 'P')
      || seenPlayers.has(playerId)) continue;
    seenPlayers.add(playerId);
    criteria.push({ efhubId, playerId, importance: rawImportance });
    if (criteria.length === 11) break;
  }
  criteria.sort((left, right) => left.efhubId - right.efhubId);
  const parsedStrictness = Number.parseInt(rawStrictness ?? '4', 10);
  const strictness = Number.isFinite(parsedStrictness)
    ? Math.max(1, Math.min(10, parsedStrictness))
    : 4;
  return { criteria, strictness };
}

export function writePlayerMatch(
  current: URLSearchParams,
  state: PlayerMatchState | undefined,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete('matchCard');
  next.delete('matchStrictness');
  next.delete('attr.dream_team');
  next.delete('attr.dream_team_min_match');
  if (state?.criteria.length) {
    const unique = parsePlayerMatchValues(
      state.criteria.map((criterion) =>
        `${criterion.efhubId}:${criterion.playerId}:${criterion.importance}`),
      String(state.strictness),
    );
    for (const criterion of unique.criteria) {
      next.append('matchCard',
        `${criterion.efhubId}:${criterion.playerId}:${criterion.importance}`);
    }
    next.set('matchStrictness', String(unique.strictness));
  }
  next.delete('page');
  return next;
}

export function strictnessMinimumPercent(strictness: number): number {
  return strictness <= 1 ? 1 : Math.max(20, Math.min(100, strictness * 10));
}

export function strictnessLabel(strictness: number): string {
  if (strictness <= 1) return 'Istalgan moslik';
  if (strictness <= 3) return 'Keng qidiruv';
  if (strictness <= 5) return 'Muvozanatli';
  if (strictness <= 7) return 'Yaqin tarkib';
  if (strictness <= 9) return 'Juda yaqin';
  return 'Aniq maqsad';
}
