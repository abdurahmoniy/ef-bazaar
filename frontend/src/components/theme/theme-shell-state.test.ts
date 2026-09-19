// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './use-theme';

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const useThemeSource = readFileSync(
  join(process.cwd(), 'src', 'components', 'theme', 'use-theme.ts'),
  'utf8',
);
const marketplaceShell = readFileSync(
  join(process.cwd(), 'src', 'components', 'marketplace', 'marketplace-shell.tsx'),
  'utf8',
);
const mobileBottomNav = readFileSync(
  join(process.cwd(), 'src', 'components', 'navigation', 'mobile-bottom-nav.tsx'),
  'utf8',
);
const globals = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

describe('responsive marketplace footer clearance', () => {
  it('uses the rendered measured bar for exact mobile footer clearance', () => {
    expect(marketplaceShell).toContain('<MeasuredBottomBar');
    expect(marketplaceShell).toContain('key="marketplace-action-bar"');
    expect(marketplaceShell).toContain('<MobileBottomNav user={user} activeTab={activeTab} />');
    expect(mobileBottomNav).toContain('<MeasuredBottomBar');
    expect(mobileBottomNav).toContain('as="nav"');
    expect(mobileBottomNav).toContain('pb-[var(--app-content-safe-bottom)]');
    expect(globals).toContain(
      'padding-bottom: calc(var(--marketplace-bottom-bar-height, 3.5rem) + 1rem);',
    );
    expect(globals).not.toContain('--marketplace-action-bar-reserve');
    expect(marketplaceShell).not.toContain('pb-24');
  });
});

describe('runtime theme hook synchronization', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useTheme> | undefined;

  function Harness() {
    latest = useTheme();
    return React.createElement('span', null, latest.theme);
  }

  beforeEach(() => {
    reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    latest = undefined;
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    delete document.documentElement.dataset.resolvedTheme;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    delete document.documentElement.dataset.resolvedTheme;
    delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
  });

  it('tracks external theme events and root mutations, then toggles from live DOM state', async () => {
    await act(async () => root.render(React.createElement(Harness)));
    expect(latest?.theme).toBe('light');

    await act(async () => {
      document.documentElement.classList.add('dark');
      document.documentElement.dataset.resolvedTheme = 'dark';
      window.dispatchEvent(new CustomEvent('efbazaar:theme-change', { detail: 'dark' }));
    });
    expect(latest?.theme).toBe('dark');

    await act(async () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.dataset.resolvedTheme = 'light';
      await Promise.resolve();
    });
    expect(latest?.theme).toBe('light');

    document.documentElement.classList.add('dark');
    document.documentElement.dataset.resolvedTheme = 'dark';
    await act(async () => latest?.toggle());

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(latest?.theme).toBe('light');
  });

  it('removes its event listener and disconnects its observer on unmount', async () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => root.unmount());

    expect(removeEventListener).toHaveBeenCalledWith(
      'efbazaar:theme-change',
      expect.any(Function),
    );
    expect(disconnect).toHaveBeenCalledTimes(1);

    root = createRoot(container);
  });

  it('subscribes to shell theme events and root mutations with exact cleanup', () => {
    expect(useThemeSource).toContain('const syncThemeState = () => setTheme(readTheme());');
    expect(useThemeSource).toContain(
      "window.addEventListener('efbazaar:theme-change', syncThemeState)",
    );
    expect(useThemeSource).toContain('new MutationObserver(syncThemeState)');
    expect(useThemeSource).toContain("attributeFilter: ['class', 'data-resolved-theme']");
    expect(useThemeSource).toContain(
      "window.removeEventListener('efbazaar:theme-change', syncThemeState)",
    );
    expect(useThemeSource).toContain('observer.disconnect()');
  });

  it('toggles from the current root theme instead of captured hook state', () => {
    const toggle = useThemeSource.slice(useThemeSource.indexOf('toggle() {'));

    expect(toggle).toContain('const current = readTheme();');
    expect(toggle).toContain("const next: AppTheme = current === 'dark' ? 'light' : 'dark';");
    expect(toggle).not.toContain("theme === 'dark' ? 'light' : 'dark'");
  });
});

describe('dark browser chrome seam', () => {
  it('uses the exact HSL representation of #090910 for the dark background token', () => {
    const darkTokens = globals.slice(globals.indexOf('.dark {'), globals.indexOf('  * {'));

    expect(darkTokens).toContain('--background: 240 28% 4.901960784313726%;');
    expect(darkTokens).toContain('--app-background-color: #090910;');
  });
});
