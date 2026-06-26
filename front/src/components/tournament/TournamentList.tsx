'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { mapTournamentResponse } from '@/lib/mappers';
import type { Tournament } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  LEAGUE: 'Liga',
  PLAYOFF: 'Playoff',
  GROUPS_PLAYOFF: 'Guruh+Playoff',
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  ACTIVE:       { label: '● LIVE', cls: 'badge-live' },
  REGISTRATION: { label: 'Ro\'yxat ochiq', cls: 'badge-reg' },
  COMPLETED:    { label: 'Tugadi', cls: 'badge-done' },
  CANCELLED:    { label: 'Bekor', cls: 'badge-done' },
};

type Filter = 'all' | 'ACTIVE' | 'REGISTRATION' | 'COMPLETED';

interface Props {
  selectedId: number | null;
  onSelect: (id: number, name: string) => void;
}

export default function TournamentList({ selectedId, onSelect }: Props) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [joinable, active] = await Promise.all([
          api.tournaments.list(),
          api.tournaments.active(),
        ]);

        const merged = [...joinable, ...active].filter(
          (t, i, arr) => arr.findIndex(x => x.id === t.id) === i,
        );

        const withCounts = await Promise.all(
          merged.map(async (t) => {
            try {
              const teams = await api.teams.byTournament(t.id);
              return mapTournamentResponse(t, teams.length);
            } catch {
              return mapTournamentResponse(t, 0);
            }
          }),
        );

        if (!cancelled) setTournaments(withCounts);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError && e.status === 403
            ? 'Kirish kerak'
            : 'Turnirlar yuklanmadi');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const visible = filter === 'all'
    ? tournaments
    : tournaments.filter(t => t.status === filter);

  if (loading) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⏳</span>
        <p>Turnirlar yuklanmoqda...</p>
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
      <div className="filter-tabs">
        {(['all', 'ACTIVE', 'REGISTRATION', 'COMPLETED'] as Filter[]).map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Barchasi' : STATUS_CONFIG[f].label.replace('● ', '')}
          </button>
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">Turnirlar</span>
        <span className="section-count">{visible.length} ta</span>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🏆</span>
          <p>Turnir topilmadi</p>
          <span className="empty-sub">Boshqa filtr tanlang</span>
        </div>
      ) : (
        visible.map(t => (
          <TournamentCard
            key={t.id}
            tournament={t}
            selected={selectedId === t.id}
            onSelect={() => onSelect(t.id, t.name)}
          />
        ))
      )}
    </>
  );
}

function TournamentCard({
  tournament: t,
  selected,
  onSelect,
}: {
  tournament: Tournament;
  selected: boolean;
  onSelect: () => void;
}) {
  const isLive = t.status === 'ACTIVE';
  const statusCfg = STATUS_CONFIG[t.status];
  const fillPct = t.maxParticipants
    ? Math.round(((t.currentParticipants || 0) / t.maxParticipants) * 100)
    : 0;

  return (
    <div
      className={`t-card ${isLive ? 'is-live' : ''} ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    >
      <div className="t-card-top">
        <div>
          <div className="t-name">{t.name}</div>
          {t.description && <div className="t-desc">{t.description}</div>}
        </div>
        <div className="t-badges">
          <span className={`badge ${statusCfg.cls}`}>{statusCfg.label}</span>
          <span className="badge badge-type">{TYPE_LABELS[t.type]}</span>
        </div>
      </div>

      <div className="t-card-footer">
        {t.maxParticipants ? (
          <div className="t-participants">
            <div className="participants-bar">
              <div className="participants-fill" style={{ width: `${fillPct}%` }} />
            </div>
            <span className="participants-text">
              {t.currentParticipants}/{t.maxParticipants}
            </span>
          </div>
        ) : <span />}

        <div className="t-organizer">
          by <span>@{t.createdBy.username || t.createdBy.firstName}</span>
        </div>
      </div>
    </div>
  );
}
