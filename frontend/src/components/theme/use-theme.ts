'use client';

import { useEffect, useState } from 'react';

import { THEME_STORAGE_KEY } from './theme-script';

export type Theme = 'light' | 'dark';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {}
}

/**
 * Theme state shared by every control that can flip it. {@code mounted} is
 * false on the server render and on the first client render — the theme lives
 * on {@code documentElement} (set by the inline theme-script before paint), so
 * rendering the real icon before hydration would mismatch. Callers gate the
 * icon on it, not the toggle itself.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    mounted,
    toggle() {
      const next: Theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      setTheme(next);
    },
  };
}
