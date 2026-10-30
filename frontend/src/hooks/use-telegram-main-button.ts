'use client';

import * as React from 'react';

import { getTelegramWebApp } from '@/lib/telegram';
import { useTelegramWebApp } from './use-telegram-sdk';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

interface UseTelegramMainButtonOptions {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /**
   * Opt out when a second instance of the same component is mounted (e.g. the
   * responsive duplicate of a CTA) — two registrations would fight over the
   * single native MainButton. Defaults to true.
   */
  enabled?: boolean;
}

/**
 * Shows/updates Telegram's native MainButton bound to `onClick`. No-ops
 * outside a Mini App. Additive only — callers keep their in-page button as
 * the source of truth; this just syncs a native affordance on top of it, so
 * nothing regresses if a given Telegram client lacks a given method.
 * Returns whether Telegram's native MainButton is currently active and
 * visible, allowing callers to hide redundant in-page action buttons.
 */
export function useTelegramMainButton({
  text,
  onClick,
  disabled,
  loading,
  enabled = true,
}: UseTelegramMainButtonOptions): boolean {
  const webApp = useTelegramWebApp();
  const [isActive, setIsActive] = React.useState(false);
  const onClickRef = React.useRef(onClick);
  onClickRef.current = onClick;

  useIsomorphicLayoutEffect(() => {
    if (!enabled) {
      setIsActive(false);
      return;
    }
    const mainButton = webApp?.MainButton;
    if (!mainButton) {
      setIsActive(false);
      return;
    }

    setIsActive(true);

    const handleClick = () => {
      getTelegramWebApp()?.HapticFeedback?.impactOccurred('medium');
      onClickRef.current();
    };

    mainButton.onClick(handleClick);
    mainButton.show();

    return () => {
      mainButton.offClick(handleClick);
      mainButton.hide();
      setIsActive(false);
    };
  }, [enabled, webApp]);

  React.useEffect(() => {
    if (!enabled) return;
    const mainButton = webApp?.MainButton;
    if (!mainButton) return;

    mainButton.setText(text);
    if (disabled) mainButton.disable();
    else mainButton.enable();
    if (loading) mainButton.showProgress(false);
    else mainButton.hideProgress();
  }, [text, disabled, loading, enabled, webApp]);

  return isActive;
}
