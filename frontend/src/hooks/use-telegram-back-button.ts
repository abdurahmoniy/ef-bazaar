'use client';

import { useId } from 'react';

import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';

/**
 * Shows Telegram's native BackButton while mounted and wires it to `onBack`.
 * Returns whether it actually activated (i.e. whether we're inside a Mini
 * App) so callers can skip rendering a redundant in-page back affordance.
 */
export function useTelegramBackButton(onBack: () => void): boolean {
  const id = useId();
  return useTelegramBackLayer({
    id,
    kind: 'route',
    onBack,
    lockVerticalSwipes: false,
  });
}
