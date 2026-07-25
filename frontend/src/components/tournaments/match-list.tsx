import { Clock, Radio } from 'lucide-react';

import { MATCH_STATE_LABELS, formatMatchTime, isLiveMatch, teamOwnerLabel } from '@/lib/tournament-format';
import type { TournamentMatch } from '@/lib/tournament-types';

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

interface MatchListProps {
  matches: TournamentMatch[];
  /** Joriy foydalanuvchining jamoalari — o'z matchlarini ajratib ko'rsatish uchun. */
  highlightTeamIds?: Set<number>;
}

/** Matchlar ro'yxati — round bo'yicha guruhlangan. */
export function MatchList({ matches, highlightTeamIds }: MatchListProps) {
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
          <div className="grid gap-2 lg:grid-cols-2">
            {byRound.get(round)!.map((match) => (
              <MatchRow key={match.id} match={match} highlightTeamIds={highlightTeamIds} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchRow({
  match,
  highlightTeamIds,
}: {
  match: TournamentMatch;
  highlightTeamIds?: Set<number>;
}) {
  const time = formatMatchTime(match.scheduledTime);
  const live = isLiveMatch(match);
  const mine =
    (match.homeTeam && highlightTeamIds?.has(match.homeTeam.id)) ||
    (match.awayTeam && highlightTeamIds?.has(match.awayTeam.id));
  const stateLabel = match.state ? MATCH_STATE_LABELS[match.state] : null;

  /**
   * Bye — Chempionat home va away'ga bir xil jamoani qo'yib yuboradi, shuning
   * uchun "X — BYE — X" chiqardi. Bitta jamoa avtomatik o'tgani ko'rsatiladi.
   */
  if (match.isBye) {
    const team = match.homeTeam ?? match.awayTeam;
    const owner = teamOwnerLabel(team);
    return (
      <div
        className={`rounded-2xl border border-dashed bg-card/60 p-3 ${
          mine ? 'border-primary/50' : 'border-border'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{team?.name ?? '—'}</p>
            {owner && <p className="truncate text-[11px] text-muted-foreground">{owner}</p>}
          </div>
          <span className="shrink-0 rounded-md border border-border bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
            Bye
          </span>
        </div>
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Raqibsiz keyingi bosqichga o&apos;tdi
        </p>
      </div>
    );
  }

  const result = outcome(match);
  const played = result !== 'pending';

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
    <div
      className={`rounded-2xl border bg-card p-3 shadow-card transition-colors hover:border-primary/30 ${
        mine ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0 text-right">
          <p className={`truncate text-sm ${homeClass}`}>{match.homeTeam?.name ?? '—'}</p>
          <TeamOwner match={match} side="home" align="right" />
        </div>
        <ScoreCell match={match} played={played} live={live} />
        <div className="min-w-0">
          <p className={`truncate text-sm ${awayClass}`}>{match.awayTeam?.name ?? '—'}</p>
          <TeamOwner match={match} side="away" align="left" />
        </div>
      </div>

      {(time || match.stage || live || match.isThirdPlaceMatch || (stateLabel && !played)) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {live && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Radio className="h-3 w-3 animate-pulse" />
              Ketmoqda
            </span>
          )}
          {match.isThirdPlaceMatch && <span>3-o&apos;rin uchun</span>}
          {match.stage && <span>{match.stage}</span>}
          {!live && !played && stateLabel && <span>{stateLabel}</span>}
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

function TeamOwner({
  match,
  side,
  align,
}: {
  match: TournamentMatch;
  side: 'home' | 'away';
  align: 'left' | 'right';
}) {
  const owner = teamOwnerLabel(side === 'home' ? match.homeTeam : match.awayTeam);
  const withdrawn = (side === 'home' ? match.homeTeam : match.awayTeam)?.withdrawn;
  if (!owner && !withdrawn) return null;
  return (
    <p
      className={`truncate text-[11px] text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {owner}
      {withdrawn && (
        <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">· chiqib ketdi</span>
      )}
    </p>
  );
}

function ScoreCell({
  match,
  played,
  live,
}: {
  match: TournamentMatch;
  played: boolean;
  live: boolean;
}) {
  if (!played) {
    return (
      <span className="rounded-md border border-dashed border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
        vs
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center">
      <span
        className={`rounded-md px-2.5 py-1 text-sm font-black tabular-nums ${
          live
            ? 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300'
            : 'bg-accent text-foreground'
        }`}
      >
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
