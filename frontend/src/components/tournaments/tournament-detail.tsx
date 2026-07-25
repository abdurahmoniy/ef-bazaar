'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  Layers,
  ListOrdered,
  Radio,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';

import { JoinTournamentButton } from '@/components/tournaments/join-tournament-button';
import { MatchList } from '@/components/tournaments/match-list';
import { ParticipantsList } from '@/components/tournaments/participants-list';
import { StandingsTable } from '@/components/tournaments/standings-table';
import { Badge } from '@/components/ui/badge';
import type { User } from '@/lib/types';
import {
  deriveParticipants,
  formatTournamentDate,
  isLiveMatch,
} from '@/lib/tournament-format';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_TYPE_LABELS,
  type StandingsRow,
  type Tournament,
  type TournamentTeam,
  canRegister,
} from '@/lib/tournament-types';
import {
  useGetBracketQuery,
  useGetFixturesQuery,
  useGetGroupStandingsQuery,
  useGetStandingsQuery,
} from '@/store/tournament-api';

const TAB_IDS = ['standings', 'fixtures', 'bracket', 'participants'] as const;
type Tab = (typeof TAB_IDS)[number];

function isTab(value: string | null): value is Tab {
  return value != null && (TAB_IDS as readonly string[]).includes(value);
}

interface Props {
  tournament: Tournament;
  viewer: User | null;
  joined: boolean;
}

/** Davom etayotgan turnirda natijalar o'zgaradi — sokin polling. */
const LIVE_POLL_MS = 30_000;

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
  const hasBracket = tournament.type === 'PLAYOFF' || tournament.type === 'GROUPS_PLAYOFF';
  const hasGroups = tournament.type === 'GROUPS_PLAYOFF';
  const isRunning = tournament.status === 'STARTED' || tournament.status === 'IN_PROGRESS';

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Tab holati URL'da — deep link ishlaydi, brauzer "orqaga" tugmasi tabni
   * qaytaradi va refresh Jadval'ga tashlamaydi.
   */
  const tabParam = searchParams.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'standings';

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'standings') params.delete('tab');
      else params.set('tab', next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const pollingInterval = isRunning ? LIVE_POLL_MS : 0;

  // Fixtures har doim yuklanadi — ishtirokchilar ro'yxati va jadvaldagi jamoa
  // egalari shundan kelib chiqadi (public API'da `/teams` endpoint yo'q).
  const fixtures = useGetFixturesQuery(id, { pollingInterval });
  const standings = useGetStandingsQuery(id, { skip: hasGroups, pollingInterval });
  const groupStandings = useGetGroupStandingsQuery(id, { skip: !hasGroups, pollingInterval });
  const bracket = useGetBracketQuery(id, { skip: !hasBracket, pollingInterval });

  const matches = fixtures.data ?? [];

  const teamsById = useMemo(() => {
    const map = new Map<number, TournamentTeam>();
    for (const match of matches) {
      for (const team of [match.homeTeam, match.awayTeam]) {
        if (team && !map.has(team.id)) map.set(team.id, team);
      }
    }
    return map;
  }, [matches]);

  const flatStandings: StandingsRow[] = useMemo(() => {
    if (!hasGroups) return standings.data ?? [];
    return Object.values(groupStandings.data ?? {}).flat();
  }, [hasGroups, standings.data, groupStandings.data]);

  const participants = useMemo(
    () => deriveParticipants(matches, flatStandings),
    [matches, flatStandings],
  );

  /**
   * Viewer o'z jamoasini jadvalda/matchlarda darhol topsin.
   *
   * <p>VAQTINCHA: taqqoslash telegram username bo'yicha, chunki Chempionat
   * `TournamentUser` payload'ida efBazaar UUID'si yo'q. Chempionat `users`ga
   * `auth_user_id` qo'shilib API'da chiqarilgandan keyin shu yerda id
   * taqqoslashga o'tiladi (plan: 2026-07-15, "Identity bridge").
   */
  const myTeamIds = useMemo(() => {
    if (!viewer || !joined) return undefined;
    const ids = new Set<number>();
    for (const team of teamsById.values()) {
      const username = team.user?.username?.toLowerCase();
      if (username && username === viewer.telegramUsername?.toLowerCase()) ids.add(team.id);
    }
    return ids.size > 0 ? ids : undefined;
  }, [viewer, joined, teamsById]);

  const liveCount = matches.filter(isLiveMatch).length;

  const startLabel = formatTournamentDate(tournament.startDate);
  const endLabel = formatTournamentDate(tournament.endDate);
  const organizer = tournament.createdBy?.firstName ?? tournament.createdBy?.username ?? null;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'standings', label: 'Jadval' },
    { id: 'fixtures', label: 'Matchlar', badge: matches.length || undefined },
    ...(hasBracket ? [{ id: 'bracket' as Tab, label: 'Bracket' }] : []),
    { id: 'participants', label: 'Ishtirokchilar', badge: participants.length || undefined },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
      {/* Hero — desktopda yopishib turadigan chap ustun */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:sticky lg:top-20">
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

          {liveCount > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <Radio className="h-3 w-3 animate-pulse" />
              {liveCount} match ketmoqda
            </p>
          )}

          {tournament.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {tournament.description}
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <MetaTile icon={<Users className="h-3.5 w-3.5" />} label="Jamoa">
              {participants.length}
              {tournament.maxParticipants != null ? ` / ${tournament.maxParticipants}` : ''}
            </MetaTile>
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

      {/* Kontent — o'ng ustun */}
      <div className="min-w-0">
        <nav
          role="tablist"
          aria-label="Turnir bo'limlari"
          className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
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
                    ? 'relative shrink-0 px-4 py-2.5 text-sm font-bold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-t-full after:bg-primary'
                    : 'shrink-0 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground'
                }
              >
                {item.label}
                {item.badge != null && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-4">
          {tab === 'standings' &&
            (hasGroups ? (
              <GroupStandingsView
                data={groupStandings.data}
                isLoading={groupStandings.isLoading}
                teamsById={teamsById}
                highlightTeamIds={myTeamIds}
              />
            ) : standings.isLoading ? (
              <PanelSkeleton />
            ) : (
              <StandingsTable
                rows={standings.data ?? []}
                teamsById={teamsById}
                highlightTeamIds={myTeamIds}
              />
            ))}

          {tab === 'fixtures' &&
            (fixtures.isLoading ? (
              <PanelSkeleton />
            ) : (
              <MatchList matches={matches} highlightTeamIds={myTeamIds} />
            ))}

          {tab === 'bracket' &&
            (bracket.isLoading ? (
              <PanelSkeleton />
            ) : (
              <MatchList matches={bracket.data ?? []} highlightTeamIds={myTeamIds} />
            ))}

          {tab === 'participants' &&
            (fixtures.isLoading ? (
              <PanelSkeleton />
            ) : (
              <ParticipantsList
                participants={participants}
                maxParticipants={tournament.maxParticipants}
                highlightTeamIds={myTeamIds}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />;
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
  teamsById,
  highlightTeamIds,
}: {
  data: Record<string, StandingsRow[]> | undefined;
  isLoading: boolean;
  teamsById: Map<number, TournamentTeam>;
  highlightTeamIds?: Set<number>;
}) {
  if (isLoading) return <PanelSkeleton />;
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
          <StandingsTable
            rows={rows ?? []}
            teamsById={teamsById}
            highlightTeamIds={highlightTeamIds}
          />
        </section>
      ))}
    </div>
  );
}
