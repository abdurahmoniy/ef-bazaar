import 'server-only';

import { cookies } from 'next/headers';

import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  apiFetch,
  ApiException,
} from './api';
import { getAuthCookieClearOptions, getAuthCookieOptions } from './auth-cookies';
import type { AuthResponse, TelegramAuthData, User } from './types';

const ACCESS_TTL_SECONDS = 60 * 15;            // 15 min
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 kun

async function setAuthCookies(auth: AuthResponse) {
  const jar = await cookies();
  const cookieOpts = getAuthCookieOptions();
  jar.set(ACCESS_COOKIE_NAME, auth.accessToken, {
    ...cookieOpts,
    maxAge: ACCESS_TTL_SECONDS,
  });
  jar.set(REFRESH_COOKIE_NAME, auth.refreshToken, {
    ...cookieOpts,
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  for (const cookieOpts of getAuthCookieClearOptions()) {
    jar.set(ACCESS_COOKIE_NAME, '', cookieOpts);
    jar.set(REFRESH_COOKIE_NAME, '', cookieOpts);
  }
}

// ─── Telegram register / login ──────────────────────────────────────────────

/**
 * Asosiy register/login flow:
 *   - Agar telegram_id mavjud bo'lmasa → yangi user yaratiladi
 *   - Mavjud bo'lsa → login qilinadi
 * Backend o'zi farqlaydi.
 */
export async function telegramAuth(data: TelegramAuthData): Promise<User> {
  const auth = await apiFetch<AuthResponse>('/auth/v1/auth/telegram', {
    method: 'POST',
    auth: false,
    body: data,
  });
  await setAuthCookies(auth);
  return auth.user;
}

/**
 * Telegram Mini App auto-login. `initData` — `window.Telegram.WebApp.initData`'dan
 * olingan signed query-string. Backend HMAC-SHA256 bilan tekshiradi (Login Widget'dan
 * algoritmi farqli) va xuddi shu register-or-login pipeline'iga uzatadi.
 */
export async function telegramWebAppAuth(initData: string): Promise<User> {
  const auth = await apiFetch<AuthResponse>('/auth/v1/auth/telegram-webapp', {
    method: 'POST',
    auth: false,
    body: { initData },
  });
  await setAuthCookies(auth);
  return auth.user;
}

// ─── Google OAuth ───────────────────────────────────────────────────────────

/**
 * Profile'da Google ulash. Foydalanuvchi allaqachon login bo'lgan bo'lishi shart.
 * idToken — Google'dan olingan ID token (browser GIS).
 */
export async function linkGoogle(idToken: string): Promise<User> {
  return apiFetch<User>('/auth/v1/auth/google/link', {
    method: 'POST',
    body: { idToken },
  });
}

/**
 * Google orqali login (foydalanuvchi avval link qilgan bo'lishi shart).
 * Agar googleId hech qaysi user'da yo'q bo'lsa → 404 + message:
 *   "Google ulanmagan. Telegram orqali kiring."
 */
export async function googleLogin(idToken: string): Promise<User> {
  const auth = await apiFetch<AuthResponse>('/auth/v1/auth/google/login', {
    method: 'POST',
    auth: false,
    body: { idToken },
  });
  await setAuthCookies(auth);
  return auth.user;
}

// ─── Me / logout ────────────────────────────────────────────────────────────

export async function getMe(): Promise<User | null> {
  try {
    return await apiFetch<User>('/auth/v1/users/me');
  } catch (e) {
    if (e instanceof ApiException && (e.status === 401 || e.status === 403)) {
      return null;
    }
    throw e;
  }
}

export async function logout() {
  // Refresh tokenni httpOnly cookie'dan o'qib backend'ga uzatamiz — backend uni
  // Redis blacklist'ga tushiradi (TTL = token expiry). Body bo'lmasa Spring
  // `HttpMessageNotReadableException` tashlaydi va token blacklist'ga tushmaydi.
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;
  if (refreshToken) {
    try {
      await apiFetch('/auth/v1/auth/logout', {
        method: 'POST',
        body: { refreshToken },
      });
    } catch {
      // Token allaqachon yaroqsiz bo'lsa ham cookie'ni baribir tozalaymiz
    }
  }
  await clearAuthCookies();
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return jar.has(ACCESS_COOKIE_NAME);
}
