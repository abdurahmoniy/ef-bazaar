import Link from 'next/link';
import { CalendarDays, Trophy, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_TYPE_LABELS,
  type Tournament,
} from '@/lib/tournament-types';

function statusVariant(status: Tournament['status']) {
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

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium' }).format(date);
}

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const startLabel = formatDate(tournament.startDate);
  const organizer =
    tournament.createdBy?.firstName ??
    tournament.createdBy?.username ??
    null;

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="block rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">{tournament.name}</h2>
            <p className="text-xs text-muted-foreground">
              {TOURNAMENT_TYPE_LABELS[tournament.type] ?? tournament.type}
              {organizer ? ` · ${organizer}` : ''}
            </p>
          </div>
        </div>
        <Badge variant={statusVariant(tournament.status)} className="shrink-0">
          {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
        </Badge>
      </div>
      {tournament.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{tournament.description}</p>
      )}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
        {tournament.maxParticipants != null && (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> max {tournament.maxParticipants}
          </span>
        )}
        {startLabel && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> {startLabel}
          </span>
        )}
      </div>
    </Link>
  );
}
