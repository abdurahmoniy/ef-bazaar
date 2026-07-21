import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Users } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { JoinTournamentButton } from '@/components/tournaments/join-tournament-button';
import { MatchList } from '@/components/tournaments/match-list';
import { StandingsTable } from '@/components/tournaments/standings-table';
import { Badge } from '@/components/ui/badge';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';
import {
  getBracket,
  getFixtures,
  getGroupStandings,
  getJoinedTournamentIds,
  getStandings,
  getTournament,
} from '@/lib/tournament-server';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_TYPE_LABELS,
  canRegister,
} from '@/lib/tournament-types';

export const dynamic = 'force-dynamic';

type Tab = 'standings' | 'fixtures' | 'bracket';

interface TournamentPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: TournamentPageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await getTournament(id);
  return { title: tournament ? `${tournament.name} — Turnir` : 'Turnir' };
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium' }).format(date);
}

/** Turnir sahifasi: jadval / matchlar / bracket (server-rendered tablar). */
export default async function TournamentPage({ params, searchParams }: TournamentPageProps) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const query = searchParams ? await searchParams : {};

  const [tournament, viewer] = await Promise.all([
    getTournament(id),
    resolveOptionalUser(getMe),
  ]);
  if (!tournament) notFound();

  const hasBracket = tournament.type === 'PLAYOFF' || tournament.type === 'GROUPS_PLAYOFF';
  const tab: Tab =
    query.tab === 'fixtures' ? 'fixtures'
    : query.tab === 'bracket' && hasBracket ? 'bracket'
    : 'standings';

  const [standings, groupStandings, fixtures, bracket, joinedIds] = await Promise.all([
    tab === 'standings' ? getStandings(id) : Promise.resolve([]),
    tab === 'standings' && tournament.type === 'GROUPS_PLAYOFF'
      ? getGroupStandings(id)
      : Promise.resolve(null),
    tab === 'fixtures' ? getFixtures(id) : Promise.resolve([]),
    tab === 'bracket' ? getBracket(id) : Promise.resolve([]),
    viewer ? getJoinedTournamentIds() : Promise.resolve(new Set<number>()),
  ]);

  const joined = joinedIds.has(tournament.id);
  const startLabel = formatDate(tournament.startDate);
  const organizer =
    tournament.createdBy?.firstName ?? tournament.createdBy?.username ?? null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'standings', label: 'Jadval' },
    { id: 'fixtures', label: 'Matchlar' },
    ...(hasBracket ? [{ id: 'bracket' as Tab, label: 'Bracket' }] : []),
  ];

  return (
    <MarketplaceShell user={viewer} hideSearch backHref="/tournaments">
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
            <Link
              key={item.id}
              href={item.id === 'standings' ? `/tournaments/${id}` : `/tournaments/${id}?tab=${item.id}`}
              className={
                item.id === tab
                  ? 'flex-1 rounded-lg bg-accent px-3 py-1.5 text-center text-xs font-bold text-foreground'
                  : 'flex-1 rounded-lg px-3 py-1.5 text-center text-xs font-semibold text-muted-foreground hover:text-foreground'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-4">
          {tab === 'standings' &&
            (groupStandings && Object.keys(groupStandings).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(groupStandings).map(([group, rows]) => (
                  <section key={group}>
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {group}-guruh
                    </h3>
                    <div className="mt-1.5">
                      <StandingsTable rows={rows} />
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <StandingsTable rows={standings} />
            ))}
          {tab === 'fixtures' && <MatchList matches={fixtures} />}
          {tab === 'bracket' && <MatchList matches={bracket} />}
        </div>
      </div>
    </MarketplaceShell>
  );
}
