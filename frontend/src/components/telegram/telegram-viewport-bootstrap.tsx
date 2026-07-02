'use client';

import * as React from 'react';

import { getTelegramWebApp, TELEGRAM_CHROME_COLOR } from '@/lib/telegram';

const SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';

/**
 * Loads the actual Telegram Mini App SDK (`telegram-web-app.js`) and does the
 * one-time chrome setup: ready/expand, header+background color sync, disable
 * vertical swipe-to-close, and mirror the live viewport height into a CSS var
 * so pages can size themselves against Telegram's resizable WebView instead
 * of an unreliable `100vh`.
 *
 * Script is injected manually (not via `next/script`) to match the existing
 * pattern in `components/auth/telegram-login.tsx` — Script tag attributes
 * aren't reliable here, per that component's own comment.
 *
 * No visual output — mirrors `TelegramWebAppAutoLogin`, which handles login
 * separately and is left untouched by this component.
 */
export function TelegramViewportBootstrap() {
  React.useEffect(() => {
    let cleanupViewportListener: (() => void) | undefined;

    function setup() {
      const webApp = getTelegramWebApp();
      if (!webApp) return;

      webApp.ready();
      webApp.expand?.();
      webApp.setHeaderColor?.(TELEGRAM_CHROME_COLOR);
      webApp.setBackgroundColor?.(TELEGRAM_CHROME_COLOR);
      webApp.disableVerticalSwipes?.();

      const applyViewportHeight = () => {
        const height = webApp.viewportStableHeight ?? webApp.viewportHeight;
        if (height) {
          document.documentElement.style.setProperty('--tg-viewport-height', `${height}px`);
        }
      };
      applyViewportHeight();
      webApp.onEvent?.('viewportChanged', applyViewportHeight);
      cleanupViewportListener = () => webApp.offEvent?.('viewportChanged', applyViewportHeight);
    }

    if (window.Telegram?.WebApp) {
      setup();
    } else if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = setup;
      document.head.appendChild(script);
    }

    return () => cleanupViewportListener?.();
  }, []);

  return null;
}
