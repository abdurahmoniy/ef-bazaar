'use client';

import { Trophy } from 'lucide-react';

import { TournamentCard } from '@/components/tournaments/tournament-card';
import {
  useGetActiveTournamentsQuery,
  useGetJoinableTournamentsQuery,
} from '@/store/tournament-api';

function TournamentSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card p-4">
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-3 w-1/3 rounded bg-muted" />
    </div>
  );
}

export function TournamentsList() {
  const joinable = useGetJoinableTournamentsQuery();
  const active = useGetActiveTournamentsQuery();

  const isLoading = joinable.isLoading || active.isLoading;
  const isError = joinable.isError && active.isError;

  const activeList = active.data ?? [];
  const activeIds = new Set(activeList.map((t) => t.id));
  const joinableOnly = (joinable.data ?? []).filter((t) => !activeIds.has(t.id));
  const empty = !isLoading && activeList.length === 0 && joinableOnly.length === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-black text-foreground">Turnirlar</h1>
          <p className="text-xs text-muted-foreground">
            eFootball turnirlari — qatnashing, jadval va natijalarni kuzating.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="mt-5 space-y-3">
          <TournamentSkeleton />
          <TournamentSkeleton />
          <TournamentSkeleton />
        </div>
      )}

      {isError && !isLoading && (
        <div className="mt-5 rounded-xl border border-danger/40 bg-card p-6 text-center text-sm text-danger">
          Turnirlarni yuklab bo'lmadi. Keyinroq qayta urinib ko'ring.
        </div>
      )}

      {empty && !isError && (
        <div className="mt-5 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Hozircha ochiq turnirlar yo'q. Keyinroq qaytib ko'ring.
        </div>
      )}

      {activeList.length > 0 && (
        <section className="mt-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Davom etayotgan
          </h2>
          <div className="mt-2 space-y-3">
            {activeList.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </section>
      )}

      {joinableOnly.length > 0 && (
        <section className="mt-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Ro&apos;yxatdan o&apos;tish ochiq
          </h2>
          <div className="mt-2 space-y-3">
            {joinableOnly.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
