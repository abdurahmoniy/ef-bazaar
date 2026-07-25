import type { StandingsRow, TournamentMatch, TournamentTeam } from '@/lib/tournament-types';

/**
 * Turnir sana/format helperlari.
 *
 * <p>Chempionat-X `LocalDateTime` ni zonasiz yuboradi (`2026-06-22T08:37:10.16`),
 * ya'ni qiymat allaqachon mahalliy vaqt. `new Date(...)` uni mahalliy deb o'qiydi,
 * shuning uchun `getUTCDate()` bilan formatlash UTC+5'da bir kun orqaga surib
 * qo'yardi — mahalliy getterlar ishlatiladi.
 */

const MONTHS_UZ = [
  'yan',
  'fev',
  'mar',
  'apr',
  'may',
  'iyn',
  'iyl',
  'avg',
  'sen',
  'okt',
  'noy',
  'dek',
];

function parse(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTournamentDate(value: string | null): string | null {
  const date = parse(value);
  if (!date) return null;
  return `${date.getDate()}-${MONTHS_UZ[date.getMonth()]}, ${date.getFullYear()}`;
}

export function formatMatchTime(value: string | null): string | null {
  const date = parse(value);
  if (!date) return null;
  return `${date.getDate()}-${MONTHS_UZ[date.getMonth()]}, ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

export function relativeStart(value: string | null): string | null {
  const date = parse(value);
  if (!date) return null;
  const diffMs = date.getTime() - Date.now();
  const absMin = Math.abs(diffMs) / 60000;
  if (absMin < 60) {
    const mins = Math.round(absMin);
    return diffMs >= 0 ? `${mins} daq keyin` : `${mins} daq oldin`;
  }
  const hours = absMin / 60;
  if (hours < 24) {
    const h = Math.round(hours);
    return diffMs >= 0 ? `${h} soat keyin` : `${h} soat oldin`;
  }
  const days = Math.round(hours / 24);
  return diffMs >= 0 ? `${days} kun keyin` : `${days} kun oldin`;
}

/** Chempionat `MatchState` — faqat live indikator uchun kerakli darajada. */
export const MATCH_STATE_LABELS: Record<string, string> = {
  CREATED: 'Rejalashtirilgan',
  SCHEDULED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Ketmoqda',
  LIVE: 'Ketmoqda',
  FINISHED: 'Yakunlandi',
  CANCELLED: 'Bekor qilindi',
};

export function isLiveMatch(match: TournamentMatch): boolean {
  return match.state === 'IN_PROGRESS' || match.state === 'LIVE';
}

/**
 * Ishtirokchilar ro'yxati fixtures'dan yig'iladi — Chempionat public API'da
 * `/{id}/teams` endpoint yo'q (404), lekin har bir jamoa fixtures ichida
 * o'z `user` ma'lumoti bilan keladi.
 */
export interface ParticipantRow {
  team: TournamentTeam;
  standing: StandingsRow | null;
}

export function deriveParticipants(
  matches: TournamentMatch[],
  standings: StandingsRow[],
): ParticipantRow[] {
  const byId = new Map<number, TournamentTeam>();
  for (const match of matches) {
    for (const team of [match.homeTeam, match.awayTeam]) {
      if (team && !byId.has(team.id)) byId.set(team.id, team);
    }
  }
  const standingByTeam = new Map(standings.map((row) => [row.teamId, row]));
  return [...byId.values()]
    .map((team) => ({ team, standing: standingByTeam.get(team.id) ?? null }))
    .sort((a, b) => {
      const pa = a.standing?.position;
      const pb = b.standing?.position;
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return a.team.name.localeCompare(b.team.name);
    });
}

export function teamOwnerLabel(team: TournamentTeam | null): string | null {
  const user = team?.user;
  if (!user) return null;
  const name = user.firstName ?? user.username;
  if (!name) return null;
  // Chempionat firstName'larda emoji bo'lishi mumkin — o'zi qoladi, trim yetarli.
  return name.trim() || null;
}
