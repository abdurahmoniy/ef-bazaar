import type { TelegramWebApp } from '@/lib/types';

/** efBazaar's `--background` — used to keep Telegram's own chrome color seamless. */
export const TELEGRAM_CHROME_COLOR = '#f9f8fb';

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.Telegram?.WebApp;
}
