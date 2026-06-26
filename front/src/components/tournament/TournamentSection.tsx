'use client';

import { useState } from 'react';
import AuthGate from '@/components/auth/AuthGate';
import MatchList from '../match/MatchList';
import StandingsTable from './StandingsTable';
import TournamentList from './TournamentList';

type TTab = 'list' | 'matches' | 'standings';

const TABS: { id: TTab; label: string }[] = [
  { id: 'list',      label: 'Turnirlar' },
  { id: 'matches',   label: 'Matchlar'  },
  { id: 'standings', label: 'Jadval'    },
];

export default function TournamentSection() {
  const [tab, setTab] = useState<TTab>('list');
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);

  const handleSelect = (id: number, name: string) => {
    setSelected(prev => (prev?.id === id ? null : { id, name }));
  };

  return (
    <>
      <div className="inner-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`inner-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="shell-content">
        <AuthGate>
          {selected && tab !== 'list' && (
            <div className="selected-tournament-bar">
              <span>{selected.name}</span>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setSelected(null)}
              >
                Bekor qilish
              </button>
            </div>
          )}

          {tab === 'list' && (
            <TournamentList
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
            />
          )}

          {tab === 'matches' && (
            <MatchList tournamentId={selected?.id ?? null} />
          )}

          {tab === 'standings' && (
            selected
              ? <StandingsTable tournamentId={selected.id} />
              : (
                <div className="empty-state">
                  <i className="ti ti-table empty-icon" aria-hidden="true" />
                  <p>Turnirni tanlang</p>
                  <span className="empty-sub">Jadval ko&apos;rish uchun turnir kartasiga bosing</span>
                </div>
              )
          )}
        </AuthGate>
      </div>
    </>
  );
}
