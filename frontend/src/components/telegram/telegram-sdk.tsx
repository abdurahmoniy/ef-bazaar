'use client';

import { useLayoutEffect } from 'react';
import { loadTelegramSdk } from '@/lib/telegram-sdk';
import { getTelegramWebApp } from '@/lib/telegram';

const MINI_APP_SESSION = 'efbazaar:mini-app-session';

/** Browser visitors do not need Telegram's native Mini App bridge. */
export function TelegramSdk() {
  useLayoutEffect(() => {
    const launch = new URLSearchParams(window.location.hash.slice(1));
    let isMiniApp = [...launch.keys()].some(key => key.startsWith('tgWebApp'))
      || Boolean(getTelegramWebApp()?.initData?.trim());
    try {
      // Detection only, never authentication. Survives the login form redirect.
      if (isMiniApp) window.sessionStorage.setItem(MINI_APP_SESSION, '1');
      else isMiniApp = window.sessionStorage.getItem(MINI_APP_SESSION) === '1';
    } catch {
      // With storage unavailable, an async bridge request is safer than losing
      // native controls after the next Mini App document navigation.
      isMiniApp = true;
    }
    if (isMiniApp) void loadTelegramSdk();
  }, []);
  return null;
}
