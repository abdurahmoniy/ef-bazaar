'use client';
import { useEffect } from 'react';

export type Section = 'tournament' | 'market' | 'profile';

interface Props {
  activeSection: Section;
  onSectionChange: (s: Section) => void;
  /** Inner tab bar — section o'zi beradi */
  innerTabs?: React.ReactNode;
  children: React.ReactNode;
}

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'tournament', label: 'Turnir',  icon: 'ti-trophy' },
  { id: 'market',     label: 'Bozor',   icon: 'ti-shopping-bag' },
  { id: 'profile',    label: 'Profil',  icon: 'ti-user' },
];

export default function AppShell({ activeSection, onSectionChange, innerTabs, children }: Props) {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
  }, []);

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="logo">ef<span>Bazaar</span></div>
        <div className="header-badge">BETA</div>
      </header>

      {innerTabs && <div className="inner-tabs">{innerTabs}</div>}

      <main className="shell-content">{children}</main>

      <nav className="shell-tabs">
        {NAV.map(n => (
          <button
            key={n.id}
            className={`tab-btn ${activeSection === n.id ? 'active' : ''}`}
            onClick={() => onSectionChange(n.id)}
          >
            <i className={`ti ${n.icon} tab-icon`} aria-hidden="true" />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
