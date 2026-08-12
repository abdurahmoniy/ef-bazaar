import type {
  TelegramColorScheme,
  TelegramWebApp,
  TelegramWebAppInset,
} from '@/lib/types';

export type AppTheme = 'light' | 'dark';

export interface TelegramInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export const APP_CHROME_COLORS: Record<AppTheme, {
  header: string;
  background: string;
  bottomBar: string;
}> = {
  light: { header: '#ffffff', background: '#ffffff', bottomBar: '#ffffff' },
  dark: { header: '#090910', background: '#090910', bottomBar: '#121225' },
};

function isAppTheme(value: unknown): value is AppTheme {
  return value === 'light' || value === 'dark';
}

export function resolveAppTheme(
  preference: unknown,
  telegramScheme: TelegramColorScheme | unknown,
  systemDark: boolean,
): AppTheme {
  if (isAppTheme(preference)) return preference;
  if (isAppTheme(telegramScheme)) return telegramScheme;
  return systemDark ? 'dark' : 'light';
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Selects Telegram's stable viewport when usable, then its live viewport. */
export function selectTelegramViewportHeight(
  stableHeight: unknown,
  viewportHeight: unknown,
): number | undefined {
  if (isPositiveFiniteNumber(stableHeight)) return stableHeight;
  if (isPositiveFiniteNumber(viewportHeight)) return viewportHeight;
  return undefined;
}

function cssPixel(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${value}px`
    : undefined;
}

function addInsetVariables(
  variables: Record<string, string>,
  name: 'safe-area-inset' | 'content-safe-area-inset',
  insets: TelegramInsets | TelegramWebAppInset | undefined,
) {
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = cssPixel(insets?.[side]);
    if (value) variables[`--tg-${name}-${side}`] = value;
  }
}

/** Converts Telegram's runtime viewport data into valid root CSS custom properties. */
export function telegramCssVariables(
  viewportHeight: unknown,
  safeAreaInset?: TelegramInsets | TelegramWebAppInset,
  contentSafeAreaInset?: TelegramInsets | TelegramWebAppInset,
): Record<string, string> {
  const variables: Record<string, string> = {};
  const height = cssPixel(viewportHeight);
  if (height) variables['--tg-viewport-height'] = height;
  addInsetVariables(variables, 'safe-area-inset', safeAreaInset);
  addInsetVariables(variables, 'content-safe-area-inset', contentSafeAreaInset);
  return variables;
}

export function telegramHaptic(
  webApp: TelegramWebApp | undefined,
  kind: 'selection' | 'success' | 'warning' | 'error',
  reducedMotion: boolean,
) {
  if (!webApp || reducedMotion) return;
  try {
    if (kind === 'selection') webApp.HapticFeedback?.selectionChanged?.();
    else webApp.HapticFeedback?.notificationOccurred(kind);
  } catch {
    return;
  }
}
