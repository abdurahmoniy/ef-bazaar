'use client';

import * as React from 'react';

import { getTelegramWebApp } from '@/lib/telegram';

/**
 * Shows Telegram's native BackButton while mounted and wires it to `onBack`.
 * Returns whether it actually activated (i.e. whether we're inside a Mini
 * App) so callers can skip rendering a redundant in-page back affordance.
 */
export function useTelegramBackButton(onBack: () => void): boolean {
  const [active, setActive] = React.useState(false);
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;

  React.useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;
    if (!backButton) {
      setActive(false);
      return;
    }

    setActive(true);
    const handleClick = () => {
      getTelegramWebApp()?.HapticFeedback?.impactOccurred('light');
      onBackRef.current();
    };

    backButton.onClick(handleClick);
    backButton.show();

    return () => {
      backButton.offClick(handleClick);
      backButton.hide();
    };
  }, []);

  return active;
}
