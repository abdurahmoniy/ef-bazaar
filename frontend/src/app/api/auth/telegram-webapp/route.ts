import { NextResponse, type NextRequest } from 'next/server';

import { ApiException } from '@/lib/api';
import { applyAuthCookies, telegramWebAppAuthTokens } from '@/lib/auth';
import { resolvePostLoginPath } from '@/lib/safe-redirect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  if (typeof initData !== 'string' || initData.length === 0) {
    return seeOther('/auth/login?error=telegram');
  }

  const target = resolvePostLoginPath(typeof from === 'string' ? from : undefined);

  try {
    const auth = await telegramWebAppAuthTokens(initData);
    const res = seeOther(target);
    applyAuthCookies(res, auth);
    return res;
  } catch (e) {
    const code = e instanceof ApiException ? (e.code ?? 'telegram') : 'telegram';
    return seeOther(`/auth/login?error=${encodeURIComponent(code)}`);
  }
}
