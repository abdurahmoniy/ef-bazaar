'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { mapStandingsRow } from '@/lib/mappers';
import type { StandingsRow } from '@/types';

interface Props {
  tournamentId: number;
}

export default function StandingsTable({ tournamentId }: Props) {
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const raw = await api.standings.byTournament(tournamentId);
        if (!cancelled) setRows(raw.map(mapStandingsRow));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError && e.status === 400
            ? 'Bu turnir turi uchun jadval mavjud emas'
            : 'Jadval yuklanmadi');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⏳</span>
        <p>Jadval yuklanmoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📊</span>
        <p>{error}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📊</span>
        <p>Jadval hali bo&apos;sh</p>
        <span className="empty-sub">Matchlar o&apos;ynalganidan keyin jadval shakllanadi</span>
      </div>
    );
  }

  return (
    <div className="standings-wrap">
      <div className="section-header">
        <span className="section-title">Turnir jadvali</span>
        <span className="section-count">{rows.length} jamoa</span>
      </div>

      <div className="standings-table">
        <div className="standings-head">
          <span>#</span>
          <span>Jamoa</span>
          <span>O</span>
          <span>G</span>
          <span>D</span>
          <span>Y</span>
          <span>GF</span>
          <span>GA</span>
          <span>Och</span>
        </div>
        {rows.map(r => (
          <div key={r.team.id} className="standings-row">
            <span className="standings-pos">{r.position}</span>
            <span className="standings-team">{r.team.name}</span>
            <span>{r.played}</span>
            <span>{r.won}</span>
            <span>{r.drawn}</span>
            <span>{r.lost}</span>
            <span>{r.goalsFor}</span>
            <span>{r.goalsAgainst}</span>
            <span className="standings-pts">{r.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
