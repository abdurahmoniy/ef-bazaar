/**
 * Telegram Login Widget user payload.
 * Telegram'dan kelgan auth ma'lumotlari — backend HMAC-SHA256 bilan tekshiradi.
 */
export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface User {
  id: string;
  /** Optional — Google-first users don't have a Telegram identity until they link. */
  telegramId?: number | null;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramLastName?: string | null;
  telegramPhotoUrl?: string | null;
  displayName: string;
  email?: string | null;
  telegramLinked: boolean;
  googleLinked: boolean;
  /** True iff both {@link telegramLinked} and {@link googleLinked}. */
  verified: boolean;
  roles: string[];
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ApiError {
  status: number;
  error: string;
  message: string;
  code?: string;
  /** Populated when the backend is running with APP_DEBUG_ERRORS=true. */
  details?: unknown;
}

export interface TelegramWebAppBackButton {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
}

export interface TelegramWebAppMainButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  setText: (text: string) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
}

export interface TelegramWebAppHapticFeedback {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
}

export type TelegramColorScheme = 'light' | 'dark';

export interface TelegramWebAppInset {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface TelegramThemeParams {
  accent_text_color?: string;
  bg_color?: string;
  bottom_bar_bg_color?: string;
  button_color?: string;
  button_text_color?: string;
  destructive_text_color?: string;
  header_bg_color?: string;
  hint_color?: string;
  link_color?: string;
  secondary_bg_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  text_color?: string;
  [key: string]: string | undefined;
}

export type TelegramWebAppEvent =
  | 'themeChanged'
  | 'viewportChanged'
  | 'safeAreaChanged'
  | 'contentSafeAreaChanged'
  | 'backButtonClicked';

export interface TelegramWebAppEventPayload {
  isStateStable?: boolean;
}

export type TelegramWebAppEventCallback = (payload?: TelegramWebAppEventPayload) => void;

/**
 * Minimal Telegram Mini App SDK surface — only the bits we read.
 * Full surface: https://core.telegram.org/bots/webapps#initializing-mini-apps
 */
export interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand?: () => void;
  close?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  colorScheme?: TelegramColorScheme;
  themeParams?: TelegramThemeParams;
  safeAreaInset?: TelegramWebAppInset;
  contentSafeAreaInset?: TelegramWebAppInset;
  isVerticalSwipesEnabled?: boolean;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  onEvent?: (eventType: TelegramWebAppEvent, callback: TelegramWebAppEventCallback) => void;
  offEvent?: (eventType: TelegramWebAppEvent, callback: TelegramWebAppEventCallback) => void;
  BackButton?: TelegramWebAppBackButton;
  MainButton?: TelegramWebAppMainButton;
  HapticFeedback?: TelegramWebAppHapticFeedback;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
