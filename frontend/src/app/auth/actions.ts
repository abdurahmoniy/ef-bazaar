'use server';

import { redirect } from 'next/navigation';

import {
  telegramAuth,
  telegramWebAppAuth,
  googleLogin,
  logout,
  linkGoogle,
  linkTelegram,
  deleteAccount,
} from '@/lib/auth';
import { ApiException } from '@/lib/api';
import { resolvePostLoginPath } from '@/lib/safe-redirect';
import type { TelegramAuthData } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

/**
 * Telegram Login Widget natijasini qabul qiladi.
 * Muvaffaqiyatli bo'lsa → `from` (ichki path, masalan `/mail/...`) yoki
 * /profile ga redirect. `from` server tomonda sanitizatsiya qilinadi —
 * clientdan kelgan qiymatga ishonilmaydi.
 */
export async function telegramAuthAction(
  data: TelegramAuthData,
  from?: string,
): Promise<ActionResult> {
  try {
    await telegramAuth(data);
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Auth-service ulanib bo\'lmadi' };
  }
  redirect(resolvePostLoginPath(from));
}

/**
 * Telegram Mini App auto-login. `initData` — `window.Telegram.WebApp.initData`'dan keladi.
 *
 * <p>Boshqa auth action'lardan farqli — bu action {@code redirect('/profile')}
 * QILMAYDI, {@code ok: true} qaytaradi. Sabab: chaqiruvchi
 * ({@link TelegramWebAppAutoLogin}) uni {@code useEffect} ichida bevosita
 * chaqiradi, form action orqali emas. Bunday holatda Next.js runtime
 * {@code NEXT_REDIRECT} xato'sini ushlab olib navigate qilmaydi — ba'zi WebView
 * runtime'larda (aynan Telegram Desktop CEF/Qt WebEngine) unhandled rejection
 * handler ishlamaydi va user shu sahifada muzlab qoladi. Muvaffaqiyatli auth
 * signalidan so'ng client tomonidagi kod {@code router.push('/profile')} ni
 * o'zi chaqiradi — bu har qanday WebView'da ishonchli ishlaydi.
 */
export async function telegramWebAppAuthAction(initData: string): Promise<ActionResult> {
  try {
    await telegramWebAppAuth(initData);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Auth-service ulanib bo\'lmadi' };
  }
}

/**
 * Google login. Backend endi register-or-login qiladi — Google akkaunt
 * mavjud emas bo'lsa yangi user avtomatik yaratiladi. Alohida "not linked"
 * xato yo'q, oddiy hollar bilan cheklanadi.
 */
export async function googleLoginAction(
  idToken: string,
  from?: string,
): Promise<ActionResult> {
  try {
    await googleLogin(idToken);
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Auth-service ulanib bo\'lmadi' };
  }
  redirect(resolvePostLoginPath(from));
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

/**
 * Profile'da Telegram ulash (Google-first user Telegram widget orqali).
 * Backend {@code telegram_already_linked} / {@code telegram_already_owned}
 * xato'lari bilan konflikt holatlarini aniq belgilaydi.
 */
export async function linkTelegramAction(data: TelegramAuthData): Promise<ActionResult> {
  try {
    await linkTelegram(data);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Telegram ulanmadi' };
  }
}

/**
 * Akkountni butunlay o'chirish. Muvaffaqiyatli bo'lsa cookie'lar tozalanadi va
 * bosh sahifaga o'tkaziladi — user o'sha zahoti Telegram yoki Google bilan
 * qaytadan ro'yxatdan o'ta oladi (uniquelik cheklovlari yangi user ochilishiga
 * to'sqinlik qilmaydi).
 */
export async function deleteAccountAction(): Promise<ActionResult> {
  try {
    await deleteAccount();
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: 'Akkountni o\'chirib bo\'lmadi' };
  }
  redirect('/');
}

export async function logoutAction() {
  await logout();
  redirect('/');
}
