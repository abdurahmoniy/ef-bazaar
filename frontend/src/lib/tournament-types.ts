/**
 * Chempionat-X public API javob turlari.
 * Manba: PublicTournamentController (+ TeamController join flow) — Chempionat-X repo.
 */

export type TournamentType = 'LEAGUE' | 'PLAYOFF' | 'GROUPS_PLAYOFF';

export type TournamentStatus =
  | 'CREATED'
  | 'REGISTRATION'
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'CANCELLED';

export interface TournamentUser {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface Tournament {
  id: number;
  name: string;
  description: string | null;
  type: TournamentType;
  status: TournamentStatus;
  isActive: boolean | null;
  maxParticipants: number | null;
  numberOfRounds: number | null;
  numberOfGroups: number | null;
  createdBy: TournamentUser | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
}

export interface TournamentTeam {
  id: number;
  name: string;
  tournamentId: number;
  user: TournamentUser | null;
  withdrawn: boolean | null;
}

export interface TournamentMatch {
  id: number;
  tournamentId: number;
  round: number | null;
  stage: string | null;
  bracketPosition: number | null;
  homeTeam: TournamentTeam | null;
  awayTeam: TournamentTeam | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  decidedByPenalties: boolean | null;
  isBye: boolean | null;
  isThirdPlaceMatch: boolean | null;
  state: string | null;
  scheduledTime: string | null;
}

export interface StandingsRow {
  position: number;
  teamId: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export const TOURNAMENT_TYPE_LABELS: Record<string, string> = {
  LEAGUE: 'Liga',
  PLAYOFF: 'Pley-off',
  GROUPS_PLAYOFF: 'Guruh + Pley-off',
};

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  CREATED: "Ro'yxat ochilmoqda",
  REGISTRATION: "Ro'yxatdan o'tish ochiq",
  STARTED: 'Boshlangan',
  IN_PROGRESS: 'Davom etmoqda',
  FINISHED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};

/** Join mumkinmi — TournamentStatus.canRegister() bilan bir xil qoida. */
export function canRegister(status: TournamentStatus): boolean {
  return status === 'CREATED' || status === 'REGISTRATION';
}
