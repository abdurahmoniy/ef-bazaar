import { teamOwnerLabel } from '@/lib/tournament-format';
import type { StandingsRow, TournamentTeam } from '@/lib/tournament-types';

interface StandingsTableProps {
  rows: StandingsRow[];
  /**
   * Fixtures'dan yig'ilgan jamoa ma'lumoti — jadvalda jamoa egasini ko'rsatish
   * uchun. Chempionat standings payload'ida faqat `teamName` bor.
   */
  teamsById?: Map<number, TournamentTeam>;
  /** Joriy foydalanuvchining jamoasi — jadvalda ajratib ko'rsatiladi. */
  highlightTeamIds?: Set<number>;
}

function gdClass(gd: number) {
  if (gd > 0) return 'text-success';
  if (gd < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

function gdLabel(gd: number) {
  return gd > 0 ? `+${gd}` : String(gd);
}

/** Klassik liga jadvali. Mobile'da stacked card, sm+ to'liq jadval. */
export function StandingsTable({ rows, teamsById, highlightTeamIds }: StandingsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Jadval hali shakllanmagan.
      </div>
    );
  }
  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => {
          const owner = teamOwnerLabel(teamsById?.get(row.teamId) ?? null);
          const mine = highlightTeamIds?.has(row.teamId);
          return (
            <li
              key={row.teamId}
              className={`rounded-xl border bg-card p-3 shadow-card ${
                mine ? 'border-primary ring-1 ring-primary/30' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                <PositionBadge position={row.position} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{row.teamName}</p>
                  {owner && (
                    <p className="truncate text-[11px] text-muted-foreground">{owner}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-black tabular-nums leading-none text-foreground">
                    {row.points}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    ochko
                  </p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">
                <MobileStat label="O" value={row.played} />
                <MobileStat label="G" value={row.won} className="text-success" />
                <MobileStat label="D" value={row.drawn} />
                <MobileStat label="M" value={row.lost} className="text-destructive" />
                <MobileStat label="UG" value={row.goalsFor} />
                <MobileStat label="OG" value={row.goalsAgainst} />
                <MobileStat
                  label="±"
                  value={gdLabel(row.goalDifference)}
                  className={`font-semibold ${gdClass(row.goalDifference)}`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-card sm:block">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 font-bold">#</th>
              <th className="px-3 py-2.5 font-bold">Jamoa</th>
              <th className="px-2 py-2.5 text-center font-bold" title="O'yinlar">O</th>
              <th className="px-2 py-2.5 text-center font-bold" title="G'alaba">G</th>
              <th className="px-2 py-2.5 text-center font-bold" title="Durang">D</th>
              <th className="px-2 py-2.5 text-center font-bold" title="Mag'lubiyat">M</th>
              <th className="px-2 py-2.5 text-center font-bold" title="Urilgan gol">UG</th>
              <th className="px-2 py-2.5 text-center font-bold" title="O'tkazilgan gol">OG</th>
              <th className="px-2 py-2.5 text-center font-bold" title="Gol farqi">±</th>
              <th className="px-3 py-2.5 text-center font-bold" title="Ochko">Ochko</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const owner = teamOwnerLabel(teamsById?.get(row.teamId) ?? null);
              const mine = highlightTeamIds?.has(row.teamId);
              const zebra = idx % 2 === 1 ? 'bg-muted/20' : '';
              return (
                <tr
                  key={row.teamId}
                  className={`border-b border-border/50 last:border-0 transition-colors hover:bg-accent/40 ${
                    mine ? 'bg-primary/5' : zebra
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <PositionBadge position={row.position} />
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5">
                    <span className="block truncate font-semibold text-foreground">
                      {row.teamName}
                    </span>
                    {owner && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {owner}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                    {row.played}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-success">
                    {row.won}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                    {row.drawn}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-destructive">
                    {row.lost}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                    {row.goalsFor}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                    {row.goalsAgainst}
                  </td>
                  <td
                    className={`px-2 py-2.5 text-center tabular-nums font-semibold ${gdClass(
                      row.goalDifference,
                    )}`}
                  >
                    {gdLabel(row.goalDifference)}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-black text-foreground">
                    {row.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MobileStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-1 py-1.5">
      <p className={`tabular-nums text-foreground ${className ?? ''}`}>{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function PositionBadge({ position }: { position: number }) {
  if (position === 1) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold-soft text-[11px] font-black text-gold-foreground ring-1 ring-gold-border">
        {position}
      </span>
    );
  }
  if (position === 2) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-black text-foreground ring-1 ring-border">
        {position}
      </span>
    );
  }
  if (position === 3) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-warning-soft text-[11px] font-black text-warning ring-1 ring-warning-border">
        {position}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center text-[11px] font-bold text-muted-foreground">
      {position}
    </span>
  );
}
