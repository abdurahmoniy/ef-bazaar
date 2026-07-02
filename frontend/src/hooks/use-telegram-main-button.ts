'use client';

import * as React from 'react';

import { getTelegramWebApp } from '@/lib/telegram';

interface UseTelegramMainButtonOptions {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
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
}: UseTelegramMainButtonOptions) {
  const onClickRef = React.useRef(onClick);
  onClickRef.current = onClick;

  React.useEffect(() => {
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
  }, []);

  React.useEffect(() => {
    const mainButton = getTelegramWebApp()?.MainButton;
    if (!mainButton) return;

    mainButton.setText(text);
    if (disabled) mainButton.disable();
    else mainButton.enable();
    if (loading) mainButton.showProgress(false);
    else mainButton.hideProgress();
  }, [text, disabled, loading]);
}
