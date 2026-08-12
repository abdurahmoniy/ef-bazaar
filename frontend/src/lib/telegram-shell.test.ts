import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  APP_CHROME_COLORS,
  resolveAppTheme,
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
});

describe('Telegram shell source contract', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const bootstrap = readFileSync(
    new URL('../components/telegram/telegram-viewport-bootstrap.tsx', import.meta.url),
    'utf8',
  );
  const themeScript = readFileSync(new URL('../components/theme/theme-script.tsx', import.meta.url), 'utf8');
  const useTheme = readFileSync(new URL('../components/theme/use-theme.ts', import.meta.url), 'utf8');
  const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

  it('loads the official SDK once before first-paint theme resolution', () => {
    const sdk = 'https://telegram.org/js/telegram-web-app.js?63';

    expect(layout.split(sdk)).toHaveLength(2);
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout.indexOf(sdk)).toBeLessThan(layout.indexOf('<ThemeScript'));
    expect(layout.indexOf('<ThemeScript')).toBeLessThan(layout.indexOf('<TelegramViewportBootstrap'));
    expect(bootstrap).not.toContain("createElement('script')");
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
    expect(bootstrap).toContain('telegramCssVariables');
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
});
