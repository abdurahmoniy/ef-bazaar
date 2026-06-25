'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import TelegramLoginButton from './TelegramLoginButton';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { user, loading, isWebView, loginWithWidget } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  if (loading) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⏳</span>
        <p>{isWebView ? 'Telegram orqali kirish...' : 'Yuklanmoqda...'}</p>
      </div>
    );
  }

  if (user) return <>{children}</>;

  // ─── WebView: auto-login failed ──────────────────────────
  if (isWebView) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⚠️</span>
        <p>Kirish amalga oshmadi</p>
        <span className="empty-sub">
          Telegram WebApp orqali avtomatik kirish xatolikka uchradi.
          Iltimos, ilovani qayta oching.
        </span>
      </div>
    );
  }

  // ─── Browser: show Telegram Login Widget ─────────────────
  return (
    <div className="empty-state">
      <span className="empty-icon">🔐</span>
      <p>Kirish kerak</p>
      <span className="empty-sub">Turnirlar va matchlarni ko&apos;rish uchun Telegram orqali kiring</span>
      {error && <span className="empty-sub" style={{ color: 'var(--red)' }}>{error}</span>}
      {loggingIn ? (
        <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>Kirish...</p>
      ) : (
        <div style={{ marginTop: 16 }}>
          <TelegramLoginButton
            onAuth={async (tgUser) => {
              setLoggingIn(true);
              setError(null);
              try {
                await loginWithWidget(tgUser);
              } catch (e) {
                setError(e instanceof ApiError && e.status === 401
                  ? 'Telegram tasdiqlanmadi'
                  : 'Kirish amalga oshmadi');
              } finally {
                setLoggingIn(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
