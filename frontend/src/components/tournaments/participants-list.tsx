import { UserRound } from 'lucide-react';

import { teamOwnerLabel, type ParticipantRow } from '@/lib/tournament-format';

interface ParticipantsListProps {
  participants: ParticipantRow[];
  maxParticipants: number | null;
  highlightTeamIds?: Set<number>;
}

/**
 * Ishtirokchilar — Chempionat public API'da `/{id}/teams` yo'q, ro'yxat
 * fixtures'dan yig'iladi ({@link deriveParticipants}). Demak matchlar tuzilmagan
 * turnirda bo'sh bo'ladi; shuning uchun bu holat alohida yoziladi.
 */
export function ParticipantsList({
  participants,
  maxParticipants,
  highlightTeamIds,
}: ParticipantsListProps) {
  if (participants.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm font-bold text-foreground">Ishtirokchilar hali ko&apos;rinmaydi</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ro&apos;yxat matchlar jadvali tuzilgandan keyin paydo bo&apos;ladi.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
        {participants.length}
        {maxParticipants != null ? ` / ${maxParticipants}` : ''} jamoa
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {participants.map(({ team, standing }) => {
          const owner = teamOwnerLabel(team);
          const mine = highlightTeamIds?.has(team.id);
          return (
            <li
              key={team.id}
              className={`flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card ${
                mine ? 'border-primary ring-1 ring-primary/30' : 'border-border'
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                {standing ? (
                  <span className="text-xs font-black tabular-nums">{standing.position}</span>
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {team.name}
                  {team.withdrawn && (
                    <span className="ml-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      chiqib ketdi
                    </span>
                  )}
                </p>
                {owner && <p className="truncate text-[11px] text-muted-foreground">{owner}</p>}
              </div>
              {standing && (
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black tabular-nums text-foreground">
                    {standing.points}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    ochko
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
