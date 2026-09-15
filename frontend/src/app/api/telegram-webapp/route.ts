import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_REQUIREMENTS_UNMET, accessRequiredHref } from '@/lib/access-requirements';
import { ACCESS_COOKIE_NAME, ApiException, apiFetch, REFRESH_COOKIE_NAME } from '@/lib/api';
import { applyAuthCookies, getMe, telegramWebAppAuthTokens } from '@/lib/auth';
import { getAuthCookieClearOptions } from '@/lib/auth-cookies';
import { resolvePostLoginPath } from '@/lib/safe-redirect';
import { telegramAuthErrorHref } from '@/lib/telegram-auth-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cookie presence alone is insufficient: validate the session and compare its
// Telegram identity before the client skips a redundant login navigation.
export async function GET(): Promise<NextResponse> {
  const user = await getMe().catch(() => null);
  let telegramId = user?.telegramId ?? null;
  if (telegramId != null) {
    // Kirish shartlari sessiya bor odamga ham amal qiladi. Bajarilmagan bo'lsa
    // sessiya "mos emas" deb qaytadi: auto-login to'liq login qiladi, auth
    // uni rad etadi va POST oqimi shartlar ekraniga olib boradi. Tekshirib
    // bo'lmasa (null) sessiya saqlanadi — fail-open.
    const access = await apiFetch<{ allowed: boolean }>('/auth/v1/users/me/access').catch(() => null);
    if (access?.allowed === false) telegramId = null;
  }
  return NextResponse.json(
    { telegramId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Telegram Mini App auto-login — TOP-LEVEL navigatsiya endpoint'i.
 *
 * <p>Client ({@code TelegramWebAppAutoLogin}) `initData`'ni yashirin form bilan
 * shu yerga POST qiladi. Biz uni backend'da validate qilib, auth cookie'larini
 * 303-redirect javobining O'ZIGA yozamiz va target'ga yo'naltiramiz. Cookie
 * top-level navigatsiya javobida kelgani uchun Telegram Desktop'ning WebKitGTK
 * webview'i ham uni ishonchli saqlaydi — fon `fetch` javobidagi `Set-Cookie`
 * bu webview'da tashlab yuborilardi (shu bug'ni tuzatadi).
 *
 * <p>`Location` ataylab nisbiy (root-relative) — nginx orqasida `request.url`
 * ichki host'ni ko'rsatishi mumkin, nisbiy redirect esa to'g'ri public origin'ga
 * yechiladi. `from` server tomonda sanitizatsiya qilinadi (open-redirect himoyasi).
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path, 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const initData = form.get('initData');
  const from = form.get('from');
  // `framed=1` — efbazaar Telegram Web iframe'ida ochilgan (third-party) →
  // cookie cross-site yuborilishi kerak, `SameSite=None`. Aks holda native
  // webview (Desktop/mobil, top-level) → `SameSite=Lax`, chunki WebKitGTK ITP
  // `None`'ni saqlamaydi.
  const framed = form.get('framed') === '1';
  const target = resolvePostLoginPath(typeof from === 'string' ? from : undefined);

  if (typeof initData !== 'string' || initData.length === 0) {
    return seeOther(telegramAuthErrorHref('telegram', target));
  }

  try {
    const auth = await telegramWebAppAuthTokens(initData);
    const res = seeOther(target);
    applyAuthCookies(res, auth, framed ? undefined : 'lax');
    return res;
  } catch (e) {
    const code = e instanceof ApiException ? (e.code ?? 'telegram') : 'telegram';
    console.warn('[telegram-webapp] auth failed', {
      code,
      status: e instanceof ApiException ? e.status : undefined,
    });
    if (code === ACCESS_REQUIREMENTS_UNMET) {
      // Eski sessiya ham o'chiriladi: aks holda 30 kunlik refresh token
      // bilan odam shartlarni bajarmasdan kirgan holda qolardi.
      const res = seeOther(accessRequiredHref(target));
      for (const cookieOpts of getAuthCookieClearOptions()) {
        res.cookies.set(ACCESS_COOKIE_NAME, '', cookieOpts);
        res.cookies.set(REFRESH_COOKIE_NAME, '', cookieOpts);
      }
      return res;
    }
    return seeOther(telegramAuthErrorHref(code, target));
  }
}
