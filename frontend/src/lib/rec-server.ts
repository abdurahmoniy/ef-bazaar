import 'server-only';

import { apiFetch, ApiException } from './api';
import type { FetchResult } from './marketplace-server';
import type { CardInterestCounts, DreamTeam, MatchDetails } from './marketplace-types';

const REC_PREFIX = '/rec/';

type RecInit = { method?: 'GET' | 'POST'; body?: unknown };

/** recommendation-service'ga server tomondan so'rov. `path` — `v1/...`. Xato → throw. */
export function recFetch<T>(path: string, init?: RecInit): Promise<T> {
  return apiFetch<T>(`${REC_PREFIX}${path}`, init);
}

export async function getDreamTeams(): Promise<FetchResult<DreamTeam[]>> {
  const path = 'v1/dream-teams';
  try {
    return { ok: true, data: await recFetch<DreamTeam[]>(path) };
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, error: { path, status: error.status, code: error.code, message: error.message } };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { path, status: 0, code: 'network_error', message, networkError: true } };
  }
}

/** E'lon sahifasidagi "nega mos" izohi. Xato yoki projection'da yo'q e'lon → null (sahifa izohsiz). */
export async function getListingMatch(
  id: string,
  matchCards: string[] | undefined,
  matchStrictness: number | undefined,
): Promise<MatchDetails | null> {
  if (!matchCards?.length) return null;
  const params = new URLSearchParams();
  for (const criterion of matchCards) params.append('matchCard', criterion);
  params.set('matchStrictness', String(matchStrictness ?? 4));
  try {
    return await recFetch<MatchDetails>(`v1/match/${encodeURIComponent(id)}?${params.toString()}`);
  } catch {
    return null;
  }
}

/** Admin kartalar sahifasi: 7/30 kunlik talab. rec o'chiq bo'lsa bo'sh xarita — sahifa nol bilan ochiladi. */
export async function getCardInterestCounts(efhubIds: number[]): Promise<CardInterestCounts> {
  const ids = [...new Set(efhubIds)];
  if (ids.length === 0) return {};
  const params = new URLSearchParams();
  for (const id of ids) params.append('ids', String(id));
  try {
    return await recFetch<CardInterestCounts>(`v1/card-interest/counts?${params.toString()}`);
  } catch {
    return {};
  }
}
