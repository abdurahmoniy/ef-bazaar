'use client';

import { Toaster } from 'sonner';

import { useTheme } from '@/components/theme/use-theme';

/**
 * The one Toaster for the whole app. Follows the app theme (class `.dark` on
 * <html>, flipped client-side) and stays below the Telegram/device safe area.
 */
export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      richColors
      closeButton
      theme={theme}
      position="top-center"
      offset="calc(var(--app-content-safe-top, 0px) + 16px)"
    />
  );
}
