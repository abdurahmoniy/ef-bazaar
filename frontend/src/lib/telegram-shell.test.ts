import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { TelegramWebApp } from './types';

import {
  APP_CHROME_COLORS,
  resolveAppTheme,
  selectTelegramViewportHeight,
  telegramHaptic,
  telegramCssVariables,
} from './telegram-shell';

describe('Telegram shell helpers', () => {
  it('prefers a valid explicit theme over Telegram and the browser', () => {
    expect(resolveAppTheme('dark', 'light', false)).toBe('dark');
    expect(resolveAppTheme('light', 'dark', true)).toBe('light');
  });

  it('uses a valid Telegram scheme when the explicit preference is absent or invalid', () => {
    expect(resolveAppTheme(null, 'dark', false)).toBe('dark');
    expect(resolveAppTheme('', 'light', true)).toBe('light');
    expect(resolveAppTheme('system', 'dark', false)).toBe('dark');
  });

  it('falls back to the browser when neither preference nor Telegram scheme is valid', () => {
    expect(resolveAppTheme(undefined, undefined, true)).toBe('dark');
    expect(resolveAppTheme(' ', 'night', false)).toBe('light');
  });

  it('defines fixed semantic native chrome colors for each resolved theme', () => {
    expect(APP_CHROME_COLORS).toEqual({
      light: { header: '#ffffff', background: '#ffffff', bottomBar: '#ffffff' },
      dark: { header: '#090910', background: '#090910', bottomBar: '#121225' },
    });
  });

  it('prefers a finite positive stable Telegram viewport height', () => {
    expect(selectTelegramViewportHeight(700, 680)).toBe(700);
  });

  it.each([0, Number.NaN, -1])(
    'falls back from invalid stable height %s to a positive live height',
    (stableHeight) => {
      expect(selectTelegramViewportHeight(stableHeight, 680)).toBe(680);
    },
  );

  it('omits viewport height when both candidates are invalid while retaining zero insets', () => {
    const height = selectTelegramViewportHeight(Number.NaN, 0);
    const variables = telegramCssVariables(height, { top: 0 }, { bottom: 0 });

    expect(height).toBeUndefined();
    expect(variables).not.toHaveProperty('--tg-viewport-height');
    expect(variables).toEqual({
      '--tg-safe-area-inset-top': '0px',
      '--tg-content-safe-area-inset-bottom': '0px',
    });
  });

  it('maps stable viewport and both Telegram inset families to CSS variables', () => {
    expect(telegramCssVariables(700, {
      top: 24, right: 0, bottom: 12, left: 0,
    }, {
      top: 44, right: 8, bottom: 20, left: 8,
    })).toEqual({
      '--tg-viewport-height': '700px',
      '--tg-safe-area-inset-top': '24px',
      '--tg-safe-area-inset-right': '0px',
      '--tg-safe-area-inset-bottom': '12px',
      '--tg-safe-area-inset-left': '0px',
      '--tg-content-safe-area-inset-top': '44px',
      '--tg-content-safe-area-inset-right': '8px',
      '--tg-content-safe-area-inset-bottom': '20px',
      '--tg-content-safe-area-inset-left': '8px',
    });
  });

  it('omits missing, negative, and non-finite dimensions without throwing', () => {
    expect(() => telegramCssVariables(Number.NaN, {
      top: -1, right: Number.POSITIVE_INFINITY,
    }, {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.NaN,
    })).not.toThrow();

    const variables = telegramCssVariables(Number.NaN, {
      top: -1, right: Number.POSITIVE_INFINITY,
    }, {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.NaN,
    });

    expect(Object.values(variables).some((value) => /(?:NaN|-|Infinity)px/.test(value))).toBe(false);
    expect(variables).toEqual({});
  });

  it('fires guarded selection and success haptics exactly once', () => {
    const selectionChanged = vi.fn();
    const notificationOccurred = vi.fn();
    const webApp = {
      HapticFeedback: { selectionChanged, notificationOccurred },
    } as unknown as TelegramWebApp;

    telegramHaptic(webApp, 'selection', false);
    telegramHaptic(webApp, 'success', false);

    expect(selectionChanged).toHaveBeenCalledTimes(1);
    expect(notificationOccurred).toHaveBeenCalledTimes(1);
    expect(notificationOccurred).toHaveBeenCalledWith('success');
  });

  it('suppresses haptics without an SDK or when reduced motion is enabled', () => {
    const selectionChanged = vi.fn();
    const notificationOccurred = vi.fn();
    const webApp = {
      HapticFeedback: { selectionChanged, notificationOccurred },
    } as unknown as TelegramWebApp;

    expect(() => telegramHaptic(undefined, 'selection', false)).not.toThrow();
    telegramHaptic(webApp, 'selection', true);
    telegramHaptic(webApp, 'warning', true);

    expect(selectionChanged).not.toHaveBeenCalled();
    expect(notificationOccurred).not.toHaveBeenCalled();
  });

  it('does not let SDK haptic failures escape', () => {
    const webApp = {
      HapticFeedback: {
        selectionChanged: () => { throw new Error('SDK failure'); },
        notificationOccurred: () => { throw new Error('SDK failure'); },
      },
    } as unknown as TelegramWebApp;

    expect(() => telegramHaptic(webApp, 'selection', false)).not.toThrow();
    expect(() => telegramHaptic(webApp, 'error', false)).not.toThrow();
  });
});

describe('Telegram shell source contract', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const bootstrap = readFileSync(
    new URL('../components/telegram/telegram-viewport-bootstrap.tsx', import.meta.url),
    'utf8',
  );
  const themeScript = readFileSync(new URL('../components/theme/theme-script.tsx', import.meta.url), 'utf8');
  const useTheme = readFileSync(new URL('../components/theme/use-theme.ts', import.meta.url), 'utf8');
  const marketplaceShell = readFileSync(
    new URL('../components/marketplace/marketplace-shell.tsx', import.meta.url),
    'utf8',
  );
  const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

  it('keeps the raw theme fallback in head beside one official SDK load', () => {
    const sdk = 'https://telegram.org/js/telegram-web-app.js?63';
    const head = layout.slice(layout.indexOf('<head>'), layout.indexOf('</head>'));

    expect(layout.split(sdk)).toHaveLength(2);
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(head).toContain('<ThemeScript />');
    expect(head.indexOf(sdk)).toBeLessThan(head.indexOf('<ThemeScript'));
    expect(themeScript).toContain('<script dangerouslySetInnerHTML');
    expect(bootstrap).not.toContain("createElement('script')");
  });

  it('keeps browser viewport metadata aligned with semantic Telegram chrome', () => {
    expect(layout).toContain("{ media: '(prefers-color-scheme: dark)', color: '#090910' }");
    expect(layout).not.toContain("{ media: '(prefers-color-scheme: dark)', color: '#0b0b0f' }");
  });

  it('synchronizes initial Telegram state and listeners before ready reveals the app', () => {
    const initialSync = bootstrap.indexOf('syncCssVariables();\n    syncTheme();');
    const listenerRegistration = bootstrap.indexOf('webApp.onEvent?.');
    const ready = bootstrap.indexOf('webApp.ready()');

    expect(initialSync).toBeGreaterThan(-1);
    expect(listenerRegistration).toBeGreaterThan(-1);
    expect(initialSync).toBeLessThan(ready);
    expect(listenerRegistration).toBeLessThan(ready);
    expect(bootstrap).toContain('first visible Mini App state');
  });

  it('pairs modern and legacy system-theme listener APIs during cleanup', () => {
    expect(bootstrap).toContain("let systemThemeListenerApi: 'event' | 'legacy' | undefined;");
    expect(bootstrap).toContain("typeof mediaQuery?.addEventListener === 'function'");
    expect(bootstrap).toContain("addEventListener('change', syncTheme)");
    expect(bootstrap).toContain('addListener(syncTheme)');
    expect(bootstrap).toContain("systemThemeListenerApi === 'event'");
    expect(bootstrap).toContain("mediaQuery?.removeEventListener('change', syncTheme)");
    expect(bootstrap).toContain("systemThemeListenerApi === 'legacy'");
    expect(bootstrap).toContain('mediaQuery?.removeListener(syncTheme)');
  });

  it('resolves first-paint and runtime themes from preference, Telegram, then system', () => {
    expect(themeScript).toContain('window.Telegram?.WebApp?.colorScheme');
    expect(themeScript).toContain('document.documentElement.dataset.resolvedTheme');
    expect(useTheme).toContain("CustomEvent('efbazaar:theme-change'");
    expect(useTheme).toContain('dataset.resolvedTheme');
  });

  it('synchronizes Telegram listeners, variables, and semantic native chrome without global swipe control', () => {
    for (const event of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'themeChanged']) {
      expect(bootstrap).toContain(`'${event}'`);
    }
    expect(bootstrap).toContain('offEvent');
    expect(bootstrap).toContain('setHeaderColor');
    expect(bootstrap).toContain('setBackgroundColor');
    expect(bootstrap).toContain('setBottomBarColor');
    expect(bootstrap).toContain('const viewportHeight = selectTelegramViewportHeight(');
    expect(bootstrap).toContain('telegramCssVariables(\n          viewportHeight,');
    expect(bootstrap).not.toContain('disableVerticalSwipes');
    expect(bootstrap).not.toContain('enableVerticalSwipes');
  });

  it('uses max-composed Telegram safe areas and honors reduced motion', () => {
    expect(globals).toContain('--app-safe-top: max(env(safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px));');
    expect(globals).toContain('--app-content-safe-bottom: max(var(--app-safe-bottom), var(--tg-content-safe-area-inset-bottom, 0px));');
    expect(globals).toContain('--marketplace-bottom-bar-height: calc(3.5rem + var(--app-content-safe-bottom));');
    expect(globals).not.toContain('overscroll-behavior-y: none;');
    expect(globals).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('consumes semantic safe areas throughout the marketplace shell', () => {
    expect(marketplaceShell).toContain('<MeasuredBottomBar');
    expect(marketplaceShell).toContain('key="marketplace-action-bar"');
    expect(marketplaceShell).toContain('key="marketplace-tab-bar"');
    expect(globals).toContain(
      'padding-bottom: calc(var(--marketplace-bottom-bar-height, 3.5rem) + 1rem);',
    );
    expect(marketplaceShell).toContain('pt-[var(--app-content-safe-top)]');
    expect(marketplaceShell).toContain(
      'pb-[calc(0.625rem+var(--app-content-safe-bottom))]',
    );
    expect(marketplaceShell).toContain('pb-[var(--app-content-safe-bottom)]');
    expect(marketplaceShell).not.toContain('env(safe-area-inset-');
  });
});
