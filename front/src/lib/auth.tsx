'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, setToken } from '@/lib/api';
import type { UserResponse } from '@/types/api';
import type { TelegramAuthUser } from '@/components/auth/TelegramLoginButton';

interface AuthContextValue {
  user: UserResponse | null;
  loading: boolean;
  /** true when running inside Telegram WebApp (initData present) */
  isWebView: boolean;
  /** Login via Telegram Login Widget (browser only) */
  loginWithWidget: (telegramUser: TelegramAuthUser) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Detect whether we're inside a Telegram WebApp.
 * Returns the raw initData string if available, empty string otherwise.
 */
function getTelegramInitData(): string {
  if (typeof window === 'undefined') return '';
  return window.Telegram?.WebApp?.initData ?? '';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWebView, setIsWebView] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const loginWithWidget = useCallback(async (telegramUser: TelegramAuthUser) => {
    const res = await api.auth.telegram({
      id: telegramUser.id,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      username: telegramUser.username,
      photoUrl: telegramUser.photo_url,
      authDate: telegramUser.auth_date,
      hash: telegramUser.hash,
    });
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const initData = getTelegramInitData();

      // ─── WebView: auto-login via initData ───────────────────
      if (initData) {
        setIsWebView(true);

        // Inform Telegram the app is ready
        try { window.Telegram?.WebApp?.ready(); } catch { /* ignore */ }
        try { window.Telegram?.WebApp?.expand(); } catch { /* ignore */ }

        // If we already have a token, try /me first (avoids redundant login)
        const stored = localStorage.getItem('efb_token');
        if (stored) {
          try {
            const me = await api.auth.me();
            if (!cancelled) { setUser(me); setLoading(false); }
            return;
          } catch {
            // Token expired or invalid — fall through to re-login
            setToken(null);
          }
        }

        // Login with initData
        try {
          const res = await api.auth.telegramWebApp({ initData });
          if (!cancelled) {
            setToken(res.accessToken);
            setUser(res.user);
          }
        } catch {
          // WebApp auth failed — user stays unauthenticated
          if (!cancelled) setUser(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // ─── Browser: restore from stored token ─────────────────
      const stored = typeof window !== 'undefined' ? localStorage.getItem('efb_token') : null;
      if (!stored) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api.auth.me();
        if (!cancelled) setUser(me);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setToken(null);
        }
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isWebView, loginWithWidget, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
