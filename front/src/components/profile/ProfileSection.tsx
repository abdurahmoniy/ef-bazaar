'use client';
import { useState } from 'react';
import TelegramLoginButton from '@/components/auth/TelegramLoginButton';
import { useAuth } from '@/lib/auth';

type PTab = 'card' | 'stats' | 'settings';

const TABS: { id: PTab; label: string }[] = [
  { id: 'card',     label: 'Gamer Card'  },
  { id: 'stats',    label: 'Statistika'  },
  { id: 'settings', label: 'Sozlamalar'  },
];

const MOCK_PLAYER = {
  username: 'azizbek_uz',
  firstName: 'Azizbek',
  elo: 1247,
  tier: 'Gold',
  wins: 34, draws: 8, losses: 12,
  goalsFor: 127, goalsAgainst: 68,
  winRate: 63,
  joinedAt: '2025-11-01',
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Legend: { bg: 'rgba(255,210,79,0.1)',  text: '#FFD24F', border: 'rgba(255,210,79,0.3)'  },
  Elite:  { bg: 'rgba(184,255,79,0.1)',  text: '#B8FF4F', border: 'rgba(184,255,79,0.3)'  },
  Gold:   { bg: 'rgba(184,255,79,0.08)', text: '#B8FF4F', border: 'rgba(184,255,79,0.2)'  },
  Silver: { bg: 'rgba(160,174,192,0.1)', text: '#A0AEC0', border: 'rgba(160,174,192,0.3)' },
  Bronze: { bg: 'rgba(205,127,50,0.1)',  text: '#CD7F32', border: 'rgba(205,127,50,0.3)'  },
};

export default function ProfileSection() {
  const [tab, setTab] = useState<PTab>('card');

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
        {tab === 'card'     && <GamerCardTab />}
        {tab === 'stats'    && <StatsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </>
  );
}

function GamerCardTab() {
  const p = MOCK_PLAYER;
  const tier = TIER_COLORS[p.tier];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Gamer Card */}
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${tier.border}`,
        borderRadius: 16,
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle bg glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 160, height: 160, borderRadius: '50%',
          background: tier.bg, pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          {/* Avatar */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--bg-subtle)',
            border: `2px solid ${tier.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: tier.text,
          }}>
            {p.firstName[0]}
          </div>

          {/* Tier badge */}
          <span style={{
            background: tier.bg, color: tier.text,
            border: `1px solid ${tier.border}`,
            padding: '4px 12px', borderRadius: 20,
            fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
          }}>
            {p.tier.toUpperCase()}
          </span>
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {p.firstName}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          @{p.username}
        </div>

        {/* ELO */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 600, color: tier.text }}>
            {p.elo}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ELO</span>
        </div>

        {/* W/D/L */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--bg-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          {[
            { label: 'G', value: p.wins,   color: 'var(--green)' },
            { label: 'D', value: p.draws,  color: 'var(--text-muted)' },
            { label: 'Y', value: p.losses, color: '#FF6B6B' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: '10px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Share button */}
      <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px' }}>
        <i className="ti ti-share" aria-hidden="true" /> Kartani ulashish
      </button>
    </div>
  );
}

function StatsTab() {
  const p = MOCK_PLAYER;
  const stats = [
    { label: 'Jami o\'yinlar',    value: p.wins + p.draws + p.losses },
    { label: 'G\'alaba foizi',    value: `${p.winRate}%` },
    { label: 'Urilgan gollar',   value: p.goalsFor },
    { label: 'O\'tkazilgan gol', value: p.goalsAgainst },
    { label: 'G/O nisbati',      value: (p.goalsFor / (p.goalsAgainst || 1)).toFixed(2) },
    { label: "Qo'shilgan sana",  value: p.joinedAt },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {stats.map(s => (
        <div key={s.label} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{s.label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsTab() {
  const { user, logout, loginWithWidget, isWebView } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {user ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 16px',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {user.firstName} {user.lastName ?? ''}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            @{user.username ?? user.telegramId}
          </div>
          {isWebView && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-dim)', marginTop: 6 }}>
              Telegram WebApp orqali kirilgan
            </div>
          )}
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: 12, width: '100%' }}
            onClick={logout}
          >
            Chiqish
          </button>
        </div>
      ) : isWebView ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 16px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Telegram orqali avtomatik kirish amalga oshmadi
          </p>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 16px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Telegram orqali kiring
          </p>
          {loggingIn ? (
            <p style={{ color: 'var(--text-muted)' }}>Kirish...</p>
          ) : (
            <TelegramLoginButton
              onAuth={async (tgUser) => {
                setLoggingIn(true);
                try { await loginWithWidget(tgUser); } finally { setLoggingIn(false); }
              }}
            />
          )}
        </div>
      )}

      {[
        { icon: 'ti-bell',      label: 'Bildirishnomalar'   },
        { icon: 'ti-language',  label: 'Til'                },
        { icon: 'ti-shield',    label: 'Xavfsizlik'         },
        { icon: 'ti-help',      label: 'Yordam'             },
      ].map(item => (
        <div key={item.label} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <i className={`ti ${item.icon}`} style={{ fontSize: 18, color: 'var(--text-muted)' }} aria-hidden="true" />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-primary)' }}>
              {item.label}
            </span>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--text-faint)' }} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
