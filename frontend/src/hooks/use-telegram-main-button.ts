'use client';

import * as React from 'react';

import { getTelegramWebApp } from '@/lib/telegram';

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
 */
export function useTelegramMainButton({
  text,
  onClick,
  disabled,
  loading,
  enabled = true,
}: UseTelegramMainButtonOptions) {
  const onClickRef = React.useRef(onClick);
  onClickRef.current = onClick;

  React.useEffect(() => {
    if (!enabled) return;
    const mainButton = getTelegramWebApp()?.MainButton;
    if (!mainButton) return;

    const handleClick = () => {
      getTelegramWebApp()?.HapticFeedback?.impactOccurred('medium');
      onClickRef.current();
    };

    mainButton.onClick(handleClick);
    mainButton.show();

    return () => {
      mainButton.offClick(handleClick);
      mainButton.hide();
    };
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    const mainButton = getTelegramWebApp()?.MainButton;
    if (!mainButton) return;

    mainButton.setText(text);
    if (disabled) mainButton.disable();
    else mainButton.enable();
    if (loading) mainButton.showProgress(false);
    else mainButton.hideProgress();
  }, [text, disabled, loading, enabled]);
}
