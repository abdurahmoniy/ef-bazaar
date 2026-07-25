'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, Trophy, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TournamentCard } from '@/components/tournaments/tournament-card';
import type { Tournament } from '@/lib/tournament-types';
import {
  useGetActiveTournamentsQuery,
  useGetJoinableTournamentsQuery,
} from '@/store/tournament-api';

type Filter = 'all' | 'active' | 'joinable' | 'mine';

/** Ro'yxatda ham natijalar o'zgaradi (status/live) — sokin polling. */
const LIST_POLL_MS = 60_000;

interface TournamentsListProps {
  /**
   * Viewer qatnashayotgan turnir id'lari — serverda `getJoinedTournamentIds()`
   * bilan olinadi, anonimda bo'sh.
   */
  joinedIds?: number[];
}

function TournamentSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-1 w-full bg-muted" />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="h-3 w-1/3 rounded bg-muted" />
          </div>
          <div className="h-5 w-20 rounded-full bg-muted" />
        </div>
        <div className="mt-4 flex gap-3">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm'
          : 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground'
      }
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={
            active
              ? 'rounded-full bg-primary-foreground/20 px-1.5 text-[10px] font-bold'
              : 'rounded-full bg-muted px-1.5 text-[10px] font-bold text-foreground'
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function TournamentsList({ joinedIds }: TournamentsListProps) {
  const joinable = useGetJoinableTournamentsQuery(undefined, { pollingInterval: LIST_POLL_MS });
  const active = useGetActiveTournamentsQuery(undefined, { pollingInterval: LIST_POLL_MS });
  const [filter, setFilter] = useState<Filter>('all');

  const joinedSet = useMemo(() => new Set(joinedIds ?? []), [joinedIds]);

  const isLoading = joinable.isLoading || active.isLoading;
  const isError = joinable.isError && active.isError;

  const activeList = active.data ?? [];
  const activeIds = useMemo(() => new Set(activeList.map((t) => t.id)), [activeList]);
  const joinableOnly = useMemo(
    () => (joinable.data ?? []).filter((t) => !activeIds.has(t.id)),
    [joinable.data, activeIds],
  );

  const mineList = useMemo(
    () => [...activeList, ...joinableOnly].filter((t) => joinedSet.has(t.id)),
    [activeList, joinableOnly, joinedSet],
  );

  const totalCount = activeList.length + joinableOnly.length;
  const empty = !isLoading && totalCount === 0;

  const showActive = filter === 'all' || filter === 'active';
  const showJoinable = filter === 'all' || filter === 'joinable';

  const retry = () => {
    joinable.refetch();
    active.refetch();
  };

  return (
    <div>
      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent via-card to-card p-5 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Trophy className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-tight text-foreground">Turnirlar</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              eFootball turnirlari — qatnashing, jadval va natijalarni kuzating.
            </p>
          </div>
        </div>
      </header>

      {!isLoading && !isError && totalCount > 0 && (
        <div className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <FilterChip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            icon={<Trophy className="h-3.5 w-3.5" />}
            label="Barchasi"
            count={totalCount}
          />
          <FilterChip
            active={filter === 'active'}
            onClick={() => setFilter('active')}
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Davom etmoqda"
            count={activeList.length}
          />
          <FilterChip
            active={filter === 'joinable'}
            onClick={() => setFilter('joinable')}
            icon={<UserPlus className="h-3.5 w-3.5" />}
            label="Ochiq"
            count={joinableOnly.length}
          />
          {mineList.length > 0 && (
            <FilterChip
              active={filter === 'mine'}
              onClick={() => setFilter('mine')}
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Mening turnirlarim"
              count={mineList.length}
            />
          )}
        </div>
      )}

      {isLoading && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <TournamentSkeleton />
          <TournamentSkeleton />
          <TournamentSkeleton />
        </div>
      )}

      {isError && !isLoading && (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Turnirlarni yuklab bo&apos;lmadi</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ulanishni tekshirib qayta urinib ko&apos;ring.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={retry}>
            Qayta urinish
          </Button>
        </div>
      )}

      {empty && !isError && (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Hozircha turnir yo&apos;q</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Yangi turnirlar ochilishi bilan shu yerda paydo bo&apos;ladi.
            </p>
          </div>
        </div>
      )}

      {filter === 'mine' && (
        <Section label="Mening turnirlarim" count={mineList.length} items={mineList} accent="active" joinedIds={joinedSet} />
      )}

      {showActive && activeList.length > 0 && (
        <Section
          label="Davom etayotgan"
          count={activeList.length}
          items={activeList}
          accent="active"
          joinedIds={joinedSet}
        />
      )}

      {showJoinable && joinableOnly.length > 0 && (
        <Section
          label="Ro'yxatdan o'tish ochiq"
          count={joinableOnly.length}
          items={joinableOnly}
          accent="joinable"
          joinedIds={joinedSet}
        />
      )}
    </div>
  );
}

function Section({
  label,
  count,
  items,
  accent,
  joinedIds,
}: {
  label: string;
  count: number;
  items: Tournament[];
  accent: 'active' | 'joinable';
  joinedIds: Set<number>;
}) {
  const dotColor = accent === 'active' ? 'bg-emerald-500' : 'bg-sky-500';
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </h2>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">{count}</span>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((t) => (
          <TournamentCard key={t.id} tournament={t} joined={joinedIds.has(t.id)} />
        ))}
      </div>
    </section>
  );
}
