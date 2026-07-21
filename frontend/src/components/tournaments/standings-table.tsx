import type { StandingsRow } from '@/lib/tournament-types';

/** Klassik liga jadvali. Mobile'da gorizontal scroll. */
export function StandingsTable({ rows }: { rows: StandingsRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Jadval hali shakllanmagan.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-bold">#</th>
            <th className="px-3 py-2.5 font-bold">Jamoa</th>
            <th className="px-2 py-2.5 text-center font-bold" title="O'yinlar">O</th>
            <th className="px-2 py-2.5 text-center font-bold" title="G'alaba">G</th>
            <th className="px-2 py-2.5 text-center font-bold" title="Durang">D</th>
            <th className="px-2 py-2.5 text-center font-bold" title="Mag'lubiyat">M</th>
            <th className="px-2 py-2.5 text-center font-bold" title="Gol farqi">GF</th>
            <th className="px-3 py-2.5 text-center font-bold" title="Ochko">Ochko</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const gd = row.goalDifference;
            const gdColor =
              gd > 0
                ? 'text-emerald-600'
                : gd < 0
                  ? 'text-rose-600'
                  : 'text-muted-foreground';
            const zebra = idx % 2 === 1 ? 'bg-muted/20' : '';
            return (
              <tr
                key={row.teamId}
                className={`border-b border-border/50 last:border-0 ${zebra} transition-colors hover:bg-accent/40`}
              >
                <td className="px-3 py-2.5">
                  <PositionBadge position={row.position} />
                </td>
                <td className="max-w-[180px] truncate px-3 py-2.5 font-semibold text-foreground">
                  {row.teamName}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                  {row.played}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-emerald-700">{row.won}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                  {row.drawn}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-rose-700">{row.lost}</td>
                <td className={`px-2 py-2.5 text-center tabular-nums font-semibold ${gdColor}`}>
                  {gd > 0 ? `+${gd}` : gd}
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
  );
}

function PositionBadge({ position }: { position: number }) {
  if (position === 1) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[11px] font-black text-amber-800 ring-1 ring-amber-300">
        {position}
      </span>
    );
  }
  if (position === 2) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-700 ring-1 ring-slate-300">
        {position}
      </span>
    );
  }
  if (position === 3) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[11px] font-black text-orange-800 ring-1 ring-orange-300">
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
