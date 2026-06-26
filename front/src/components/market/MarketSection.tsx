'use client';
import { useState } from 'react';

type MTab = 'listings' | 'mine' | 'blacklist';

const TABS: { id: MTab; label: string }[] = [
  { id: 'listings',   label: "Sotuvda"          },
  { id: 'mine',       label: "Mening e'lonlarim" },
  { id: 'blacklist',  label: 'Qora ro\'yxat'     },
];

// Mock akkaunt ma'lumotlari
const MOCK_LISTINGS = [
  { id: 1, title: 'Level 42 akkaunt', price: 250000, currency: 'UZS', rating: 'Gold', seller: 'sardor_uz', verified: true },
  { id: 2, title: 'Legend akkaunt — 98 OVR', price: 150, currency: 'USD', rating: 'Legend', seller: 'jamshid_pro', verified: true },
  { id: 3, title: 'Yangi akkaunt — boshlang\'ich', price: 50000, currency: 'UZS', rating: 'Bronze', seller: 'bobur99', verified: false },
];

const MOCK_BLACKLIST = [
  { id: 1, username: 'toxic_player1', reason: 'Lag-break (qasddan internet uzish)', date: '2026-06-10', reportCount: 4 },
  { id: 2, username: 'scammer_2024',  reason: 'Savdoda firibgarlik',                date: '2026-06-15', reportCount: 7 },
  { id: 3, username: 'rager_uz',      reason: 'Haqorat va toxic xulq',              date: '2026-06-20', reportCount: 2 },
];

const RATING_COLOR: Record<string, string> = {
  Legend: '#FFD24F',
  Gold:   '#B8FF4F',
  Silver: '#A0AEC0',
  Bronze: '#CD7F32',
};

export default function MarketSection() {
  const [tab, setTab] = useState<MTab>('listings');

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
        {tab === 'listings' && <ListingsTab />}
        {tab === 'mine'     && <MyListingsTab />}
        {tab === 'blacklist'&& <BlacklistTab />}
      </div>
    </>
  );
}

function ListingsTab() {
  return (
    <>
      <div className="section-header">
        <span className="section-title">Akkauntlar</span>
        <span className="section-count">{MOCK_LISTINGS.length} ta</span>
      </div>
      {MOCK_LISTINGS.map(item => (
        <div key={item.id} className="t-card">
          <div className="t-card-top">
            <div>
              <div className="t-name">{item.title}</div>
              <div className="t-desc">@{item.seller} {item.verified && '✓ Tasdiqlangan'}</div>
            </div>
            <div className="t-badges">
              <span className="badge" style={{ background: 'var(--bg-subtle)', color: RATING_COLOR[item.rating] || 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {item.rating}
              </span>
            </div>
          </div>
          <div className="t-card-footer">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--accent)' }}>
              {item.price.toLocaleString()} {item.currency}
            </span>
            <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Ko'rish</button>
          </div>
        </div>
      ))}
    </>
  );
}

function MyListingsTab() {
  return (
    <div className="empty-state">
      <i className="ti ti-shopping-bag empty-icon" aria-hidden="true" />
      <p>E'lonlaringiz yo'q</p>
      <span className="empty-sub">Akkaunt sotish uchun quyidagi tugmani bosing</span>
      <button className="btn-primary" style={{ marginTop: 16 }}>+ E'lon qo'shish</button>
    </div>
  );
}

function BlacklistTab() {
  return (
    <>
      <div className="section-header">
        <span className="section-title">Bloklangan o'yinchilar</span>
        <span className="section-count">{MOCK_BLACKLIST.length} ta</span>
      </div>
      {MOCK_BLACKLIST.map(item => (
        <div key={item.id} className="t-card">
          <div className="t-card-top">
            <div>
              <div className="t-name" style={{ color: 'var(--text-primary)' }}>
                @{item.username}
              </div>
              <div className="t-desc">{item.reason}</div>
            </div>
            <span className="badge" style={{ background: 'rgba(226,75,74,0.12)', color: '#FF6B6B', border: '1px solid rgba(226,75,74,0.25)', flexShrink: 0 }}>
              {item.reportCount} shikoyat
            </span>
          </div>
          <div className="t-card-footer">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{item.date}</span>
          </div>
        </div>
      ))}
    </>
  );
}
