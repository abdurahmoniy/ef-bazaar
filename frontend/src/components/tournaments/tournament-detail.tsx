'use client';

import { useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Layers,
  ListOrdered,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';

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

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()}-${MONTHS_UZ[date.getUTCMonth()]}, ${date.getUTCFullYear()}`;
}

function statusBadgeVariant(status: Tournament['status']) {
  switch (status) {
    case 'CREATED':
    case 'REGISTRATION':
      return 'info' as const;
    case 'STARTED':
    case 'IN_PROGRESS':
      return 'verified' as const;
    case 'CANCELLED':
      return 'danger' as const;
    default:
      return 'muted' as const;
  }
}

function heroAccentBar(status: Tournament['status']) {
  switch (status) {
    case 'STARTED':
    case 'IN_PROGRESS':
      return 'bg-gradient-to-r from-emerald-400 to-emerald-600';
    case 'CREATED':
    case 'REGISTRATION':
      return 'bg-gradient-to-r from-sky-400 to-sky-600';
    case 'CANCELLED':
      return 'bg-gradient-to-r from-rose-400 to-rose-600';
    default:
      return 'bg-muted';
  }
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
  const endLabel = formatDate(tournament.endDate);
  const organizer =
    tournament.createdBy?.firstName ?? tournament.createdBy?.username ?? null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'standings', label: 'Jadval' },
    { id: 'fixtures', label: 'Matchlar' },
    ...(hasBracket ? [{ id: 'bracket' as Tab, label: 'Bracket' }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className={`h-1.5 w-full ${heroAccentBar(tournament.status)}`} />
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Trophy className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusBadgeVariant(tournament.status)}>
                  {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
                </Badge>
                <Badge variant="outline">
                  {TOURNAMENT_TYPE_LABELS[tournament.type] ?? tournament.type}
                </Badge>
                {joined && (
                  <Badge variant="verified" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Qatnashyapsiz
                  </Badge>
                )}
              </div>
              <h1 className="mt-2 text-xl font-black leading-tight text-foreground">
                {tournament.name}
              </h1>
              {organizer && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  Organizer: <span className="font-semibold text-foreground">{organizer}</span>
                </p>
              )}
            </div>
          </div>

          {tournament.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {tournament.description}
            </p>
          )}

          {/* Meta grid */}
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tournament.maxParticipants != null && (
              <MetaTile icon={<Users className="h-3.5 w-3.5" />} label="Qatnashchi">
                max {tournament.maxParticipants}
              </MetaTile>
            )}
            {tournament.numberOfRounds != null && (
              <MetaTile icon={<ListOrdered className="h-3.5 w-3.5" />} label="Tur">
                {tournament.numberOfRounds}
              </MetaTile>
            )}
            {tournament.numberOfGroups != null && (
              <MetaTile icon={<Layers className="h-3.5 w-3.5" />} label="Guruh">
                {tournament.numberOfGroups}
              </MetaTile>
            )}
            {startLabel && (
              <MetaTile icon={<CalendarDays className="h-3.5 w-3.5" />} label="Boshlanish">
                {startLabel}
              </MetaTile>
            )}
            {endLabel && (
              <MetaTile icon={<CalendarDays className="h-3.5 w-3.5" />} label="Tugash">
                {endLabel}
              </MetaTile>
            )}
          </dl>

          {(canRegister(tournament.status) || joined) && (
            <div className="mt-4 border-t border-border pt-4">
              <JoinTournamentButton
                tournamentId={tournament.id}
                authenticated={Boolean(viewer)}
                joined={joined}
                defaultTeamName={viewer?.displayName}
              />
            </div>
          )}
        </div>
      </section>

      {/* Tabs — underline indicator */}
      <nav
        role="tablist"
        aria-label="Turnir bo'limlari"
        className="mt-5 flex gap-1 border-b border-border"
      >
        {tabs.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={
                active
                  ? 'relative px-4 py-2.5 text-sm font-bold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-t-full after:bg-primary'
                  : 'px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-4">
        {tab === 'standings' && hasGroups && (
          <GroupStandingsView data={groupStandings.data} isLoading={groupStandings.isLoading} />
        )}
        {tab === 'standings' && !hasGroups && (
          standings.isLoading ? (
            <div className="animate-pulse h-40 rounded-2xl border border-border bg-card" />
          ) : (
            <StandingsTable rows={standings.data ?? []} />
          )
        )}
        {tab === 'fixtures' && (
          fixtures.isLoading ? (
            <div className="animate-pulse h-40 rounded-2xl border border-border bg-card" />
          ) : (
            <MatchList matches={fixtures.data ?? []} />
          )
        )}
        {tab === 'bracket' && (
          bracket.isLoading ? (
            <div className="animate-pulse h-40 rounded-2xl border border-border bg-card" />
          ) : (
            <MatchList matches={bracket.data ?? []} />
          )
        )}
      </div>
    </div>
  );
}

function MetaTile({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-2.5">
      <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-foreground">{children}</div>
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
    return <div className="animate-pulse h-32 rounded-2xl border border-border bg-card" />;
  }
  if (!data || Object.keys(data).length === 0) {
    return <StandingsTable rows={[]} />;
  }
  return (
    <div className="space-y-4">
      {Object.entries(data).map(([group, rows]) => (
        <section key={group}>
          <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground">
            <Layers className="h-3 w-3 text-muted-foreground" />
            {group}-guruh
          </div>
          <StandingsTable rows={rows ?? []} />
        </section>
      ))}
    </div>
  );
}
