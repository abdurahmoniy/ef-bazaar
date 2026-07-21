import type { StandingsRow } from '@/lib/tournament-types';

/** Klassik liga jadvali. Mobile'da gorizontal scroll. */
export function StandingsTable({ rows }: { rows: StandingsRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Jadval hali shakllanmagan.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">#</th>
            <th className="px-3 py-2 font-semibold">Jamoa</th>
            <th className="px-2 py-2 text-center font-semibold" title="O'yinlar">O</th>
            <th className="px-2 py-2 text-center font-semibold" title="G'alaba">G</th>
            <th className="px-2 py-2 text-center font-semibold" title="Durang">D</th>
            <th className="px-2 py-2 text-center font-semibold" title="Mag'lubiyat">M</th>
            <th className="px-2 py-2 text-center font-semibold" title="Gol farqi">GF</th>
            <th className="px-2 py-2 text-center font-semibold" title="Ochko">Ochko</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 text-muted-foreground">{row.position}</td>
              <td className="max-w-[180px] truncate px-3 py-2 font-semibold text-foreground">
                {row.teamName}
              </td>
              <td className="px-2 py-2 text-center">{row.played}</td>
              <td className="px-2 py-2 text-center">{row.won}</td>
              <td className="px-2 py-2 text-center">{row.drawn}</td>
              <td className="px-2 py-2 text-center">{row.lost}</td>
              <td className="px-2 py-2 text-center">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="px-2 py-2 text-center font-bold text-foreground">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
