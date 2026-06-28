'use server';

import { redirect } from 'next/navigation';

import { telegramAuth, telegramWebAppAuth, googleLogin, logout, linkGoogle } from '@/lib/auth';
import { ApiException } from '@/lib/api';
import type { TelegramAuthData } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

/**
 * Telegram Login Widget natijasini qabul qiladi.
 * Muvaffaqiyatli bo'lsa → /profile ga redirect.
 */
export async function telegramAuthAction(data: TelegramAuthData): Promise<ActionResult> {
  try {
    await telegramAuth(data);
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Auth-service ulanib bo\'lmadi' };
  }
  redirect('/profile');
}

/**
 * Telegram Mini App auto-login. `initData` — `window.Telegram.WebApp.initData`'dan keladi.
 * Muvaffaqiyatli bo'lsa → /profile ga redirect.
 */
export async function telegramWebAppAuthAction(initData: string): Promise<ActionResult> {
  try {
    await telegramWebAppAuth(initData);
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Auth-service ulanib bo\'lmadi' };
  }
  redirect('/profile');
}

/**
 * Google login. Foydalanuvchi avval Google'ni profile'da link qilgan bo'lishi shart.
 */
export async function googleLoginAction(idToken: string): Promise<ActionResult> {
  try {
    await googleLogin(idToken);
  } catch (e) {
    if (e instanceof ApiException) {
      // Backend 404 + GOOGLE_NOT_LINKED → user'ga aniq xato
      if (e.code === 'GOOGLE_NOT_LINKED') {
        return {
          ok: false,
          error: 'Google ulanmagan. Telegram orqali kiring va profilda Google bog\'lang.',
          code: e.code,
        };
      }
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Auth-service ulanib bo\'lmadi' };
  }
  redirect('/profile');
}

/**
 * Profile'da Google ulash (foydalanuvchi login bo'lgan paytda).
 */
export async function linkGoogleAction(idToken: string): Promise<ActionResult> {
  try {
    await linkGoogle(idToken);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Google ulanmadi' };
  }
}

export async function logoutAction() {
  await logout();
  redirect('/');
}
