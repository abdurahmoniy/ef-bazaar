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
  telegramId: number;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramLastName?: string | null;
  telegramPhotoUrl?: string | null;
  displayName: string;
  email?: string | null;
  googleLinked: boolean;
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
}

/**
 * Minimal Telegram Mini App SDK surface — only the bits we read.
 * Full surface: https://core.telegram.org/bots/webapps#initializing-mini-apps
 */
export interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand?: () => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
