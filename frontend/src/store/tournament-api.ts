import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import type {
  StandingsRow,
  Tournament,
  TournamentMatch,
} from '@/lib/tournament-types';

const CHEMPIONAT_BASE =
  process.env.NEXT_PUBLIC_CHEMPIONAT_API_URL || 'https://api.chempox.uz/api';

export const tournamentApi = createApi({
  reducerPath: 'tournamentApi',
  baseQuery: fetchBaseQuery({ baseUrl: CHEMPIONAT_BASE }),
  tagTypes: ['Tournament', 'Standings', 'Fixtures', 'Bracket'],
  endpoints: (build) => ({
    getJoinableTournaments: build.query<Tournament[], void>({
      query: () => '/public/tournaments',
      providesTags: [{ type: 'Tournament', id: 'JOINABLE' }],
    }),
    getActiveTournaments: build.query<Tournament[], void>({
      query: () => '/public/tournaments/active',
      providesTags: [{ type: 'Tournament', id: 'ACTIVE' }],
    }),
    getTournament: build.query<Tournament, string>({
      query: (id) => `/public/tournaments/${id}`,
      providesTags: (_res, _err, id) => [{ type: 'Tournament', id }],
    }),
    getStandings: build.query<StandingsRow[], string>({
      query: (id) => `/public/tournaments/${id}/standings`,
      providesTags: (_res, _err, id) => [{ type: 'Standings', id }],
    }),
    getGroupStandings: build.query<Record<string, StandingsRow[]>, string>({
      query: (id) => `/public/tournaments/${id}/standings/groups`,
      providesTags: (_res, _err, id) => [{ type: 'Standings', id: `${id}:groups` }],
    }),
    getFixtures: build.query<TournamentMatch[], string>({
      query: (id) => `/public/tournaments/${id}/fixtures`,
      providesTags: (_res, _err, id) => [{ type: 'Fixtures', id }],
    }),
    getBracket: build.query<TournamentMatch[], string>({
      query: (id) => `/public/tournaments/${id}/bracket`,
      providesTags: (_res, _err, id) => [{ type: 'Bracket', id }],
    }),
  }),
});

export const {
  useGetJoinableTournamentsQuery,
  useGetActiveTournamentsQuery,
  useGetTournamentQuery,
  useGetStandingsQuery,
  useGetGroupStandingsQuery,
  useGetFixturesQuery,
  useGetBracketQuery,
} = tournamentApi;
