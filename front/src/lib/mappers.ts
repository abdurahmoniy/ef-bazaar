import type {
  MatchResponse,
  StandingsRowResponse,
  TeamResponse,
  TournamentResponse,
} from '@/types/api';
import type { Match, StandingsRow, Tournament, TournamentStatus } from '@/types';

export function mapTournamentStatus(status: string, isActive?: boolean | null): TournamentStatus {
  if (isActive || status === 'STARTED' || status === 'IN_PROGRESS') return 'ACTIVE';
  if (status === 'FINISHED' || status === 'CANCELLED') return 'COMPLETED';
  return 'REGISTRATION';
}

export function mapTournamentResponse(t: TournamentResponse, teamCount = 0): Tournament {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? undefined,
    type: t.type,
    status: mapTournamentStatus(t.status, t.isActive),
    privacy: t.privacy,
    maxParticipants: t.maxParticipants ?? undefined,
    currentParticipants: teamCount,
    startDate: t.startDate ?? undefined,
    endDate: t.endDate ?? undefined,
    createdBy: {
      id: t.createdBy.id,
      username: t.createdBy.username ?? undefined,
      firstName: t.createdBy.firstName ?? 'Organizer',
    },
  };
}

export function mapTeamResponse(t: TeamResponse) {
  return {
    id: t.id,
    name: t.name,
    userId: t.user?.id ?? 0,
    username: t.user?.username ?? undefined,
  };
}

export function mapMatchResponse(m: MatchResponse): Match {
  const emptyTeam = { id: 0, name: '—', userId: 0 };
  let state: Match['state'] = 'CREATED';
  if (m.state === 'APPROVED') state = 'COMPLETED';
  else if (m.state === 'PENDING_APPROVAL' || m.state === 'PLAYED') state = 'RESULT_SUBMITTED';

  return {
    id: m.id,
    tournamentId: m.tournamentId,
    homeTeam: m.homeTeam ? mapTeamResponse(m.homeTeam) : emptyTeam,
    awayTeam: m.awayTeam ? mapTeamResponse(m.awayTeam) : emptyTeam,
    homeScore: m.homeScore ?? undefined,
    awayScore: m.awayScore ?? undefined,
    state,
    stage: m.stage ?? undefined,
    round: m.round ?? undefined,
    scheduledTime: m.scheduledTime ?? undefined,
  };
}

export function mapStandingsRow(r: StandingsRowResponse): StandingsRow {
  return {
    position: r.position,
    team: { id: r.teamId, name: r.teamName, userId: 0 },
    played: r.played,
    won: r.won,
    drawn: r.drawn,
    lost: r.lost,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    points: r.points,
  };
}
