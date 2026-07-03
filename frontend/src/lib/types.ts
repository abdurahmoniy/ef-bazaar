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
}

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
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
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
