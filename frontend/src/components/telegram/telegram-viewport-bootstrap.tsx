'use client';

import * as React from 'react';

import { THEME_STORAGE_KEY } from '@/components/theme/theme-script';
import { getTelegramWebApp } from '@/lib/telegram';
import {
  APP_CHROME_COLORS,
  resolveAppTheme,
  selectTelegramViewportHeight,
  telegramCssVariables,
} from '@/lib/telegram-shell';
import type { TelegramWebAppEvent, TelegramWebAppEventCallback } from '@/lib/types';

/**
 * Synchronizes Telegram with browser theme, viewport, and safe-area state
 * before ready dismisses Telegram's loading placeholder, so the first visible Mini App state
 * already has the correct chrome. The raw theme fallback remains independent
 * of the external SDK request in the root layout.
 *
 * No visual output — mirrors `TelegramWebAppAutoLogin`, which handles login
 * separately and is left untouched by this component.
 */
export function TelegramViewportBootstrap() {
  React.useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    const safely = (operation: () => void) => {
      try {
        operation();
      } catch {}
    };

    let mediaQuery: MediaQueryList | undefined;
    safely(() => {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    });

    const syncCssVariables = () => {
      safely(() => {
        const root = document.documentElement;
        const viewportHeight = selectTelegramViewportHeight(
          webApp.viewportStableHeight,
          webApp.viewportHeight,
        );
        const variables = telegramCssVariables(
          viewportHeight,
          webApp.safeAreaInset,
          webApp.contentSafeAreaInset,
        );
        const names = [
          '--tg-viewport-height',
          '--tg-safe-area-inset-top', '--tg-safe-area-inset-right',
          '--tg-safe-area-inset-bottom', '--tg-safe-area-inset-left',
          '--tg-content-safe-area-inset-top', '--tg-content-safe-area-inset-right',
          '--tg-content-safe-area-inset-bottom', '--tg-content-safe-area-inset-left',
        ];
        for (const name of names) root.style.removeProperty(name);
        for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
      });
    };

    const syncTheme = () => {
      safely(() => {
        let preference: string | null = null;
        try {
          preference = window.localStorage.getItem(THEME_STORAGE_KEY);
        } catch {}
        const next = resolveAppTheme(preference, webApp.colorScheme, mediaQuery?.matches ?? false);
        const root = document.documentElement;
        if (root.classList.contains('dark') !== (next === 'dark')) {
          root.classList.toggle('dark', next === 'dark');
        }
        if (root.dataset.resolvedTheme !== next) root.dataset.resolvedTheme = next;

        const chrome = APP_CHROME_COLORS[next];
        safely(() => webApp.setHeaderColor?.(chrome.header));
        safely(() => webApp.setBackgroundColor?.(chrome.background));
        safely(() => webApp.setBottomBarColor?.(chrome.bottomBar));
      });
    };

    const eventCallbacks: Array<[TelegramWebAppEvent, TelegramWebAppEventCallback]> = [
      ['viewportChanged', syncCssVariables],
      ['safeAreaChanged', syncCssVariables],
      ['contentSafeAreaChanged', syncCssVariables],
      ['themeChanged', syncTheme],
    ];
    for (const [event, callback] of eventCallbacks) {
      safely(() => webApp.onEvent?.(event, callback));
    }

    let systemThemeListenerApi: 'event' | 'legacy' | undefined;
    if (typeof mediaQuery?.addEventListener === 'function') {
      safely(() => {
        mediaQuery?.addEventListener('change', syncTheme);
        systemThemeListenerApi = 'event';
      });
    } else if (typeof mediaQuery?.addListener === 'function') {
      safely(() => {
        mediaQuery?.addListener(syncTheme);
        systemThemeListenerApi = 'legacy';
      });
    }
    safely(() => window.addEventListener('efbazaar:theme-change', syncTheme));
    safely(() => webApp.expand?.());
    syncCssVariables();
    syncTheme();
    safely(() => webApp.ready());

    return () => {
      for (const [event, callback] of eventCallbacks) {
        safely(() => webApp.offEvent?.(event, callback));
      }
      if (systemThemeListenerApi === 'event') {
        safely(() => mediaQuery?.removeEventListener('change', syncTheme));
      } else if (systemThemeListenerApi === 'legacy') {
        safely(() => mediaQuery?.removeListener(syncTheme));
      }
      safely(() => window.removeEventListener('efbazaar:theme-change', syncTheme));
    };
  }, []);

  return null;
}
