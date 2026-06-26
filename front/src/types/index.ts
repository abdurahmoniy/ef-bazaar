export type TournamentType = 'LEAGUE' | 'PLAYOFF' | 'GROUPS_PLAYOFF';
export type TournamentStatus = 'REGISTRATION' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type TournamentPrivacy = 'PUBLIC' | 'PRIVATE';

export interface Tournament {
  id: number;
  name: string;
  description?: string;
  type: TournamentType;
  status: TournamentStatus;
  privacy: TournamentPrivacy;
  maxParticipants?: number;
  currentParticipants?: number;
  startDate?: string;
  endDate?: string;
  createdBy: { id: number; username?: string; firstName: string };
}

export interface Team {
  id: number;
  name: string;
  userId: number;
  username?: string;
}

export interface Match {
  id: number;
  tournamentId: number;
  homeTeam: Team;
  awayTeam: Team;
  homeScore?: number;
  awayScore?: number;
  state: 'CREATED' | 'RESULT_SUBMITTED' | 'COMPLETED' | 'CANCELLED';
  stage?: string;
  round?: number;
  scheduledTime?: string;
}

export interface StandingsRow {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}
