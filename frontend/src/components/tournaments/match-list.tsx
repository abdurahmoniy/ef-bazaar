import type { TournamentMatch } from '@/lib/tournament-types';

function teamLabel(match: TournamentMatch, side: 'home' | 'away') {
  const team = side === 'home' ? match.homeTeam : match.awayTeam;
  if (!team) return '—';
  return team.name;
}

function scoreLabel(match: TournamentMatch) {
  if (match.isBye) return 'BYE';
  if (match.homeScore == null || match.awayScore == null) return 'vs';
  let score = `${match.homeScore} : ${match.awayScore}`;
  if (match.decidedByPenalties && match.homePenaltyScore != null && match.awayPenaltyScore != null) {
    score += ` (pen. ${match.homePenaltyScore}:${match.awayPenaltyScore})`;
  }
  return score;
}

/** Matchlar ro'yxati — round bo'yicha guruhlangan. */
export function MatchList({ matches }: { matches: TournamentMatch[] }) {
  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
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
    <div className="space-y-4">
      {rounds.map((round) => (
        <section key={round}>
          {rounds.length > 1 && (
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {round === 0 ? 'Boshqa' : `${round}-tur`}
            </h3>
          )}
          <div className="mt-1.5 space-y-2">
            {byRound.get(round)!.map((match) => {
              const played = match.homeScore != null && match.awayScore != null;
              return (
                <div
                  key={match.id}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <span className="truncate text-right text-xs font-semibold text-foreground">
                    {teamLabel(match, 'home')}
                  </span>
                  <span
                    className={
                      played
                        ? 'rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-foreground'
                        : 'px-2 text-xs text-muted-foreground'
                    }
                  >
                    {scoreLabel(match)}
                  </span>
                  <span className="truncate text-xs font-semibold text-foreground">
                    {teamLabel(match, 'away')}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
