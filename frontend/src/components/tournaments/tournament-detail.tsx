'use client';

import { useState } from 'react';
import { CalendarDays, Users } from 'lucide-react';

import { JoinTournamentButton } from '@/components/tournaments/join-tournament-button';
import { MatchList } from '@/components/tournaments/match-list';
import { StandingsTable } from '@/components/tournaments/standings-table';
import { Badge } from '@/components/ui/badge';
import type { User } from '@/lib/types';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_TYPE_LABELS,
  type Tournament,
  canRegister,
} from '@/lib/tournament-types';
import {
  useGetBracketQuery,
  useGetFixturesQuery,
  useGetGroupStandingsQuery,
  useGetStandingsQuery,
} from '@/store/tournament-api';

type Tab = 'standings' | 'fixtures' | 'bracket';

interface Props {
  tournament: Tournament;
  viewer: User | null;
  joined: boolean;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium' }).format(date);
}

export function TournamentDetail({ tournament, viewer, joined }: Props) {
  const id = String(tournament.id);
  const hasBracket =
    tournament.type === 'PLAYOFF' || tournament.type === 'GROUPS_PLAYOFF';
  const hasGroups = tournament.type === 'GROUPS_PLAYOFF';

  const [tab, setTab] = useState<Tab>('standings');

  const standings = useGetStandingsQuery(id, { skip: tab !== 'standings' || hasGroups });
  const groupStandings = useGetGroupStandingsQuery(id, {
    skip: tab !== 'standings' || !hasGroups,
  });
  const fixtures = useGetFixturesQuery(id, { skip: tab !== 'fixtures' });
  const bracket = useGetBracketQuery(id, { skip: tab !== 'bracket' || !hasBracket });

  const startLabel = formatDate(tournament.startDate);
  const organizer =
    tournament.createdBy?.firstName ?? tournament.createdBy?.username ?? null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'standings', label: 'Jadval' },
    { id: 'fixtures', label: 'Matchlar' },
    ...(hasBracket ? [{ id: 'bracket' as Tab, label: 'Bracket' }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-foreground">{tournament.name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {TOURNAMENT_TYPE_LABELS[tournament.type] ?? tournament.type}
              {organizer ? ` · Organizer: ${organizer}` : ''}
            </p>
          </div>
          <Badge
            variant={canRegister(tournament.status) ? 'info' : 'muted'}
            className="shrink-0"
          >
            {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
          </Badge>
        </div>
        {tournament.description && (
          <p className="mt-2 text-sm text-muted-foreground">{tournament.description}</p>
        )}
        <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
          {tournament.maxParticipants != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> max {tournament.maxParticipants} qatnashchi
            </span>
          )}
          {startLabel && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> {startLabel}
            </span>
          )}
        </div>
        {(canRegister(tournament.status) || joined) && (
          <div className="mt-4">
            <JoinTournamentButton
              tournamentId={tournament.id}
              authenticated={Boolean(viewer)}
              joined={joined}
              defaultTeamName={viewer?.displayName}
            />
          </div>
        )}
      </div>

      <nav className="mt-5 flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              item.id === tab
                ? 'flex-1 rounded-lg bg-accent px-3 py-1.5 text-center text-xs font-bold text-foreground'
                : 'flex-1 rounded-lg px-3 py-1.5 text-center text-xs font-semibold text-muted-foreground hover:text-foreground'
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === 'standings' && hasGroups && (
          <GroupStandingsView data={groupStandings.data} isLoading={groupStandings.isLoading} />
        )}
        {tab === 'standings' && !hasGroups && (
          <StandingsTable rows={standings.data ?? []} />
        )}
        {tab === 'fixtures' && <MatchList matches={fixtures.data ?? []} />}
        {tab === 'bracket' && <MatchList matches={bracket.data ?? []} />}
      </div>
    </div>
  );
}

function GroupStandingsView({
  data,
  isLoading,
}: {
  data: Record<string, ReturnType<typeof useGetStandingsQuery>['data']> | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <div className="animate-pulse h-32 rounded-xl bg-muted" />;
  }
  if (!data || Object.keys(data).length === 0) {
    return <StandingsTable rows={[]} />;
  }
  return (
    <div className="space-y-4">
      {Object.entries(data).map(([group, rows]) => (
        <section key={group}>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {group}-guruh
          </h3>
          <div className="mt-1.5">
            <StandingsTable rows={rows ?? []} />
          </div>
        </section>
      ))}
    </div>
  );
}
