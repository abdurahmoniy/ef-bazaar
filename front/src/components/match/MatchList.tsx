'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { mapMatchResponse } from '@/lib/mappers';
import type { Match } from '@/types';

const STATE_CONFIG: Record<string, { label: string; cls: string }> = {
  COMPLETED:        { label: 'Tugadi', cls: 'completed' },
  RESULT_SUBMITTED: { label: 'Tasdiq kutilmoqda', cls: 'submitted' },
  CREATED:          { label: 'Rejalashtirilgan', cls: 'pending' },
  CANCELLED:        { label: 'Bekor', cls: 'pending' },
};

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Guruh',
  LEAGUE_ROUND: 'Liga',
  ROUND_OF_64: '1/32',
  ROUND_OF_32: '1/16',
  ROUND_OF_16: '1/8',
  QUARTER_FINAL: '1/4',
  SEMI_FINAL: '1/2',
  THIRD_PLACE: '3-o\'rin',
  FINAL: 'Final',
};

type Filter = 'all' | 'COMPLETED' | 'RESULT_SUBMITTED' | 'CREATED';

interface Props {
  tournamentId: number | null;
}

export default function MatchList({ tournamentId }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const raw = tournamentId
          ? await api.matches.byTournament(tournamentId)
          : await api.matches.today();

        if (!cancelled) setMatches(raw.map(mapMatchResponse));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError && e.status === 403
            ? 'Kirish kerak'
            : 'Matchlar yuklanmadi');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tournamentId]);

  const visible = filter === 'all'
    ? matches
    : matches.filter(m => m.state === filter);

  if (loading) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⏳</span>
        <p>Matchlar yuklanmoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⚠️</span>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <>
      {!tournamentId && (
        <div className="section-hint">Bugungi matchlar</div>
      )}

      <div className="filter-tabs">
        {(['all', 'CREATED', 'RESULT_SUBMITTED', 'COMPLETED'] as Filter[]).map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Barchasi'
              : f === 'CREATED' ? 'Kutilmoqda'
              : f === 'RESULT_SUBMITTED' ? 'Tasdiq'
              : 'Tugadi'}
          </button>
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">Matchlar</span>
        <span className="section-count">{visible.length} ta</span>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">⚽</span>
          <p>Match topilmadi</p>
          {!tournamentId && (
            <span className="empty-sub">Turnir tanlasangiz, uning barcha matchlari ko&apos;rinadi</span>
          )}
        </div>
      ) : (
        visible.map(m => <MatchCard key={m.id} match={m} />)
      )}
    </>
  );
}

function MatchCard({ match: m }: { match: Match }) {
  const stateCfg = STATE_CONFIG[m.state];
  const isCompleted = m.state === 'COMPLETED';
  const hasScore = m.homeScore !== undefined && m.awayScore !== undefined;

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  };

  const stageLabel = m.stage ? (STAGE_LABELS[m.stage] ?? m.stage) : '';

  return (
    <div className="m-card">
      <div className="m-round">
        {stageLabel}{m.round ? ` · ${m.round}-tur` : ''}
      </div>

      <div className="m-body">
        <div className="m-team">{m.homeTeam.name}</div>

        <div className={`m-score ${isCompleted ? 'completed' : 'pending'}`}>
          {hasScore
            ? <><span className="home-g">{m.homeScore}</span> — {m.awayScore}</>
            : 'vs'
          }
        </div>

        <div className="m-team away">{m.awayTeam.name}</div>
      </div>

      <div className="m-footer">
        <span className={`m-status ${stateCfg.cls}`}>{stateCfg.label}</span>
        {m.scheduledTime && (
          <span className="m-time">{formatTime(m.scheduledTime)}</span>
        )}
      </div>
    </div>
  );
}
