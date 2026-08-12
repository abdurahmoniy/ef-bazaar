'use client';

import { useEffect, useState } from 'react';

import type { AppTheme } from '@/lib/telegram-shell';

import { THEME_STORAGE_KEY } from './theme-script';

export type { AppTheme as Theme } from '@/lib/telegram-shell';

function readTheme(): AppTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(t: AppTheme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.dataset.resolvedTheme = t;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {}
  window.dispatchEvent(new CustomEvent('efbazaar:theme-change', { detail: t }));
}

/**
 * Theme state shared by every control that can flip it. {@code mounted} is
 * false on the server render and on the first client render — the theme lives
 * on {@code documentElement} (set by the inline theme-script before paint), so
 * rendering the real icon before hydration would mismatch. Callers gate the
 * icon on it, not the toggle itself.
 */
export function useTheme() {
  const [theme, setTheme] = useState<AppTheme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const syncThemeState = () => setTheme(readTheme());
    const observer = new MutationObserver(syncThemeState);

    syncThemeState();
    setMounted(true);
    window.addEventListener('efbazaar:theme-change', syncThemeState);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-resolved-theme'],
    });

    return () => {
      window.removeEventListener('efbazaar:theme-change', syncThemeState);
      observer.disconnect();
    };
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    mounted,
    toggle() {
      const current = readTheme();
      const next: AppTheme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      setTheme(next);
    },
  };
}
