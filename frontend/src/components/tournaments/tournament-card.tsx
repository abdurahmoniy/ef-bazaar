import Link from 'next/link';
import { CalendarDays, ChevronRight, Trophy, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_TYPE_LABELS,
  type Tournament,
} from '@/lib/tournament-types';

type Accent = 'live' | 'open' | 'muted' | 'danger';

function accentFor(status: Tournament['status']): Accent {
  switch (status) {
    case 'CREATED':
    case 'REGISTRATION':
      return 'open';
    case 'STARTED':
    case 'IN_PROGRESS':
      return 'live';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'muted';
  }
}

function statusBadgeVariant(accent: Accent) {
  switch (accent) {
    case 'live':
      return 'verified' as const;
    case 'open':
      return 'info' as const;
    case 'danger':
      return 'danger' as const;
    default:
      return 'muted' as const;
  }
}

const ACCENT_BAR: Record<Accent, string> = {
  live: 'bg-gradient-to-r from-emerald-400 to-emerald-600',
  open: 'bg-gradient-to-r from-sky-400 to-sky-600',
  muted: 'bg-muted',
  danger: 'bg-gradient-to-r from-rose-400 to-rose-600',
};

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

function relativeStart(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const absMin = Math.abs(diffMs) / 60000;
  if (absMin < 60) {
    const mins = Math.round(absMin);
    return diffMs >= 0 ? `${mins} daq keyin` : `${mins} daq oldin`;
  }
  const hours = absMin / 60;
  if (hours < 24) {
    const h = Math.round(hours);
    return diffMs >= 0 ? `${h} soat keyin` : `${h} soat oldin`;
  }
  const days = Math.round(hours / 24);
  return diffMs >= 0 ? `${days} kun keyin` : `${days} kun oldin`;
}

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const startLabel = formatDate(tournament.startDate);
  const relLabel = relativeStart(tournament.startDate);
  const organizer =
    tournament.createdBy?.firstName ??
    tournament.createdBy?.username ??
    null;
  const accent = accentFor(tournament.status);
  const isLive = accent === 'live';

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
    >
      <div className={`h-1 w-full ${ACCENT_BAR[accent]}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Trophy className="h-5 w-5" />
              {isLive && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-foreground group-hover:text-primary">
                {tournament.name}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {TOURNAMENT_TYPE_LABELS[tournament.type] ?? tournament.type}
                {organizer ? ` · ${organizer}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={statusBadgeVariant(accent)}>
              {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
            </Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </div>

        {tournament.description && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {tournament.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {tournament.maxParticipants != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="font-semibold text-foreground">{tournament.maxParticipants}</span>
              o&apos;rin
            </span>
          )}
          {tournament.numberOfRounds != null && (
            <span className="inline-flex items-center gap-1">
              <span className="font-semibold text-foreground">{tournament.numberOfRounds}</span>
              tur
            </span>
          )}
          {startLabel && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {startLabel}
              {relLabel && (
                <span className="text-muted-foreground/70">· {relLabel}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
