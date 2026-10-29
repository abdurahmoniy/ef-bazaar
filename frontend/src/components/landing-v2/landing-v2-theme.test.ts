// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY } from '@/components/theme/theme-script';
import { LandingV2 } from './landing-v2';

it('switches the landing between light and dark and remembers the selected mode', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: false }) }));
  const previousClass = document.documentElement.className;
  const previousResolvedTheme = document.documentElement.dataset.resolvedTheme;
  const previousPreference = localStorage.getItem(THEME_STORAGE_KEY);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    document.documentElement.classList.remove('dark');
    await act(async () => root.render(createElement(LandingV2)));
    const toggle = container.querySelector<HTMLButtonElement>('header button[aria-label="Qorong‘i rejim"]');
    expect(toggle).not.toBeNull();

    await act(async () => toggle!.click());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(toggle!.getAttribute('aria-label')).toBe('Yorug‘ rejim');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await act(async () => toggle!.click());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(toggle!.getAttribute('aria-label')).toBe('Qorong‘i rejim');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(container.querySelector('main')?.parentElement?.classList.contains('dark')).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.className = previousClass;
    if (previousResolvedTheme === undefined) delete document.documentElement.dataset.resolvedTheme;
    else document.documentElement.dataset.resolvedTheme = previousResolvedTheme;
    if (previousPreference === null) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, previousPreference);
    vi.unstubAllGlobals();
  }
});
