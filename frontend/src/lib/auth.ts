import 'server-only';

import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

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
 * Telegram Mini App auto-login — token almashinuvi (cookie'larni O'RNATMAYDI).
 * `initData` — `window.Telegram.WebApp.initData`'dan olingan signed query-string.
 * Backend HMAC-SHA256 bilan tekshiradi (Login Widget'dan algoritmi farqli) va
 * xuddi shu register-or-login pipeline'iga uzatadi.
 *
 * <p>Cookie'lar bu yerda emas, route handler'da ({@code /api/telegram-webapp})
 * 303-redirect javobiga {@link applyAuthCookies} orqali yoziladi. Sabab: Telegram
 * Desktop'ning WebKitGTK webview'i fon `fetch` javobidagi `Set-Cookie`'ni ishonchli
 * saqlamaydi — cookie top-level navigatsiya (redirect) javobida kelishi shart.
 */
export async function telegramWebAppAuthTokens(initData: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/v1/auth/telegram-webapp', {
    method: 'POST',
    auth: false,
    body: { initData },
  });
}

/**
 * Auth token'larini javob obyektining O'ZIGA (`NextResponse`) `Set-Cookie`
 * sifatida yozadi. Route handler'ning 303-redirect'ida ishlatiladi — top-level
 * navigatsiya cookie'si har bir webview'da (WebKitGTK ham) ishonchli saqlanadi,
 * `next/headers` cookies() esa fon-fetch kontekstiga bog'liq bo'lib chiqadi.
 */
export function applyAuthCookies(res: NextResponse, auth: AuthResponse): void {
  const cookieOpts = getAuthCookieOptions();
  res.cookies.set(ACCESS_COOKIE_NAME, auth.accessToken, {
    ...cookieOpts,
    maxAge: ACCESS_TTL_SECONDS,
  });
  res.cookies.set(REFRESH_COOKIE_NAME, auth.refreshToken, {
    ...cookieOpts,
    maxAge: REFRESH_TTL_SECONDS,
  });
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
 * Profile'da Telegram ulash. Google-first user shu endpoint orqali Telegram
 * widget payload'ini yuboradi. Konflikt bo'lsa (Telegram allaqachon boshqa
 * akkauntda) backend {@code 409} qaytaradi.
 */
export async function linkTelegram(data: TelegramAuthData): Promise<User> {
  return apiFetch<User>('/auth/v1/auth/telegram/link', {
    method: 'POST',
    body: data,
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

/**
 * Akkountni butunlay o'chirish. Backend DB'dan user'ni butunlay yo'q qiladi va
 * {@code user-deleted} Kafka event chiqaradi (downstream marketplace/bot
 * chats/listings/cache tozalaydi). Access token muddati o'z-o'zidan tugaydi;
 * refresh urinishlari 404 qaytaradi. Cookie'larni frontend tozalaydi.
 */
export async function deleteAccount(): Promise<void> {
  try {
    await apiFetch('/auth/v1/users/me', { method: 'DELETE' });
  } finally {
    await clearAuthCookies();
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
