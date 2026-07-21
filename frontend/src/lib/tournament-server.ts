import { apiFetch, ApiException } from '@/lib/api';
import type { StandingsRow, Tournament, TournamentMatch } from '@/lib/tournament-types';

/**
 * Server-side (RSC) Chempionat-X o'qishlari. Hammasi fail-soft — turnir servisi
 * yotsa sahifa bo'sh holat bilan ochiladi, 500 bermaydi.
 *
 * Path konvensiyasi: nginx `/api/tournaments/` prefiksini kesadi, shuning uchun
 * `/tournaments/public/tournaments` → chempionat `/api/public/tournaments`.
 */

const PUBLIC_BASE = '/tournaments/public/tournaments';

async function safeList<T>(path: string): Promise<T[]> {
  try {
    return await apiFetch<T[]>(path, { auth: false });
  } catch (error) {
    console.error(`[tournament-server] GET ${path} failed:`, error);
    return [];
  }
}

export async function getJoinableTournaments(): Promise<Tournament[]> {
  return safeList<Tournament>(PUBLIC_BASE);
}

export async function getActiveTournaments(): Promise<Tournament[]> {
  return safeList<Tournament>(`${PUBLIC_BASE}/active`);
}

export async function getTournament(id: string): Promise<Tournament | null> {
  try {
    return await apiFetch<Tournament>(`${PUBLIC_BASE}/${id}`, { auth: false });
  } catch (error) {
    if (error instanceof ApiException && error.status === 404) return null;
    console.error('[tournament-server] getTournament failed:', error);
    return null;
  }
}

export async function getStandings(id: string): Promise<StandingsRow[]> {
  return safeList<StandingsRow>(`${PUBLIC_BASE}/${id}/standings`);
}

export async function getGroupStandings(
  id: string,
): Promise<Record<string, StandingsRow[]> | null> {
  try {
    return await apiFetch<Record<string, StandingsRow[]>>(
      `${PUBLIC_BASE}/${id}/standings/groups`,
      { auth: false },
    );
  } catch (error) {
    if (!(error instanceof ApiException && error.status === 400)) {
      console.error('[tournament-server] getGroupStandings failed:', error);
    }
    return null;
  }
}

export async function getFixtures(id: string): Promise<TournamentMatch[]> {
  return safeList<TournamentMatch>(`${PUBLIC_BASE}/${id}/fixtures`);
}

export async function getBracket(id: string): Promise<TournamentMatch[]> {
  return safeList<TournamentMatch>(`${PUBLIC_BASE}/${id}/bracket`);
}

/**
 * Joriy user qatnashayotgan turnir id'lari (auth talab qiladi; anonimda bo'sh).
 * Chempionat `/api/tournaments/joined` — header-auth orqali.
 */
export async function getJoinedTournamentIds(): Promise<Set<number>> {
  try {
    const joined = await apiFetch<Tournament[]>('/tournaments/tournaments/joined');
    return new Set(joined.map((t) => t.id));
  } catch {
    return new Set();
  }
}
