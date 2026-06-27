import 'server-only';

import { cookies } from 'next/headers';

import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  apiFetch,
  ApiException,
} from './api';
import type { AuthResponse, TelegramAuthData, User } from './types';

const ACCESS_TTL_SECONDS = 60 * 15;            // 15 min
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 kun

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

async function setAuthCookies(auth: AuthResponse) {
  const jar = await cookies();
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
  jar.delete(ACCESS_COOKIE_NAME);
  jar.delete(REFRESH_COOKIE_NAME);
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
  try {
    await apiFetch('/auth/v1/auth/logout', { method: 'POST' });
  } catch {
    // backend'da xato bo'lsa ham cookie tozalaymiz
  }
  await clearAuthCookies();
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return jar.has(ACCESS_COOKIE_NAME);
}
