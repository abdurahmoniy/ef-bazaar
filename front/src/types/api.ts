export type BackendTournamentType = 'LEAGUE' | 'PLAYOFF' | 'GROUPS_PLAYOFF';
export type BackendTournamentStatus =
  | 'CREATED' | 'REGISTRATION' | 'STARTED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
export type BackendMatchState =
  | 'CREATED' | 'PLAYED' | 'PENDING_APPROVAL' | 'PENDING_PENALTY' | 'APPROVED' | 'REJECTED';

export interface UserResponse {
  id: number;
  telegramId?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

export interface TournamentResponse {
  id: number;
  name: string;
  description?: string | null;
  type: BackendTournamentType;
  status: BackendTournamentStatus;
  privacy: 'PUBLIC' | 'PRIVATE';
  isActive?: boolean | null;
  maxParticipants?: number | null;
  numberOfRounds?: number | null;
  numberOfGroups?: number | null;
  autoStart?: boolean | null;
  createdBy: UserResponse;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TeamResponse {
  id: number;
  name: string;
  tournamentId?: number;
  user?: UserResponse | null;
  withdrawn?: boolean | null;
  createdAt?: string | null;
}

export interface MatchResponse {
  id: number;
  tournamentId: number;
  round?: number | null;
  stage?: string | null;
  bracketPosition?: number | null;
  homeTeam?: TeamResponse | null;
  awayTeam?: TeamResponse | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  decidedByPenalties?: boolean | null;
  isBye?: boolean | null;
  isThirdPlaceMatch?: boolean | null;
  state: BackendMatchState;
  rejectReason?: string | null;
  scheduledTime?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface StandingsRowResponse {
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

export interface TelegramLoginPayload {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
  hash: string;
}

export interface TelegramWebAppPayload {
  initData: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresInSeconds: number;
  user: UserResponse;
}
