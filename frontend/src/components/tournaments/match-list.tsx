import { Clock } from 'lucide-react';

import type { TournamentMatch } from '@/lib/tournament-types';

function teamLabel(match: TournamentMatch, side: 'home' | 'away') {
  const team = side === 'home' ? match.homeTeam : match.awayTeam;
  if (!team) return '—';
  return team.name;
}

type Outcome = 'home' | 'away' | 'draw' | 'pending';

function outcome(match: TournamentMatch): Outcome {
  if (match.homeScore == null || match.awayScore == null) return 'pending';
  if (match.homeScore > match.awayScore) return 'home';
  if (match.homeScore < match.awayScore) return 'away';
  if (match.decidedByPenalties && match.homePenaltyScore != null && match.awayPenaltyScore != null) {
    return match.homePenaltyScore > match.awayPenaltyScore ? 'home' : 'away';
  }
  return 'draw';
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('uz-UZ', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Matchlar ro'yxati — round bo'yicha guruhlangan. */
export function MatchList({ matches }: { matches: TournamentMatch[] }) {
  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Matchlar hali tuzilmagan.
      </div>
    );
  }

  const byRound = new Map<number, TournamentMatch[]>();
  for (const match of matches) {
    const round = match.round ?? 0;
    const bucket = byRound.get(round);
    if (bucket) bucket.push(match);
    else byRound.set(round, [match]);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      {rounds.map((round) => (
        <section key={round}>
          {rounds.length > 1 && (
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                {round === 0 ? 'Boshqa' : `${round}-tur`}
              </span>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-semibold text-muted-foreground">
                {byRound.get(round)!.length} match
              </span>
            </div>
          )}
          <div className="space-y-2">
            {byRound.get(round)!.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchRow({ match }: { match: TournamentMatch }) {
  const result = outcome(match);
  const played = result !== 'pending';
  const time = formatTime(match.scheduledTime);
  const isBye = Boolean(match.isBye);

  const homeClass =
    result === 'home'
      ? 'font-bold text-foreground'
      : result === 'away'
        ? 'font-semibold text-muted-foreground'
        : 'font-semibold text-foreground';
  const awayClass =
    result === 'away'
      ? 'font-bold text-foreground'
      : result === 'home'
        ? 'font-semibold text-muted-foreground'
        : 'font-semibold text-foreground';

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card transition-colors hover:border-primary/30">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className={`truncate text-right text-sm ${homeClass}`}>
          {teamLabel(match, 'home')}
        </span>
        <ScoreCell match={match} isBye={isBye} played={played} />
        <span className={`truncate text-sm ${awayClass}`}>
          {teamLabel(match, 'away')}
        </span>
      </div>
      {(time || match.stage) && (
        <div className="mt-2 flex items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {match.stage && <span>{match.stage}</span>}
          {time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {time}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreCell({
  match,
  isBye,
  played,
}: {
  match: TournamentMatch;
  isBye: boolean;
  played: boolean;
}) {
  if (isBye) {
    return (
      <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
        BYE
      </span>
    );
  }
  if (!played) {
    return (
      <span className="rounded-md border border-dashed border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
        vs
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center">
      <span className="rounded-md bg-accent px-2.5 py-1 text-sm font-black tabular-nums text-foreground">
        {match.homeScore} : {match.awayScore}
      </span>
      {match.decidedByPenalties &&
        match.homePenaltyScore != null &&
        match.awayPenaltyScore != null && (
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            pen {match.homePenaltyScore}:{match.awayPenaltyScore}
          </span>
        )}
    </div>
  );
}
