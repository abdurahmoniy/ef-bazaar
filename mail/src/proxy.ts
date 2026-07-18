import { NextResponse, type NextRequest } from 'next/server';

import { getAuthCookieClearOptions, getAuthCookieOptions } from './lib/auth-cookies';
import { refreshSession, type RefreshedTokens } from './lib/session-refresh';
import { mainSiteLoginUrl } from './lib/site';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  return response;
}

/**
 * Session holati — marketplace frontend'dagi proxy bilan bir xil mantiq
 * (access 15 daqiqa, refresh 30 kun; faqat refresh qolgan bo'lsa shu yerda
 * yangi juftlik olamiz). Cookie'lar `Domain=efbazaar.uz` bilan yozilgani
 * uchun ikkala app ham bir xil sessionni ko'radi.
 */
async function resolveSession(request: NextRequest): Promise<{
  hasSession: boolean;
  refreshed: RefreshedTokens | null;
  clearCookies: boolean;
}> {
  if (request.cookies.has(ACCESS_COOKIE)) {
    return { hasSession: true, refreshed: null, clearCookies: false };
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return { hasSession: false, refreshed: null, clearCookies: false };
  }

  const result = await refreshSession(refreshToken);
  if (result.ok) {
    return { hasSession: true, refreshed: result.tokens, clearCookies: false };
  }
  return { hasSession: false, refreshed: null, clearCookies: result.definitive };
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { hasSession, refreshed, clearCookies } = await resolveSession(request);

  if (refreshed) {
    request.cookies.set(ACCESS_COOKIE, refreshed.accessToken);
    request.cookies.set(REFRESH_COOKIE, refreshed.refreshToken);
  }

  const finalize = (response: NextResponse) => {
    if (refreshed) {
      const cookieOpts = getAuthCookieOptions();
      response.cookies.set(ACCESS_COOKIE, refreshed.accessToken, {
        ...cookieOpts,
        maxAge: refreshed.accessExpiresInSeconds,
      });
      response.cookies.set(REFRESH_COOKIE, refreshed.refreshToken, {
        ...cookieOpts,
        maxAge: refreshed.refreshExpiresInSeconds,
      });
    } else if (clearCookies) {
      for (const cookieOpts of getAuthCookieClearOptions()) {
        response.cookies.set(ACCESS_COOKIE, '', cookieOpts);
        response.cookies.set(REFRESH_COOKIE, '', cookieOpts);
      }
    }
    return applySecurityHeaders(response);
  };

  // Har bir sahifa himoyalangan — bu app'da public surface yo'q. Login UI ham
  // yo'q: main sayt login qiladi va `/mail/...` redirect orqali qaytaradi.
  if (!hasSession) {
    return finalize(
      NextResponse.redirect(mainSiteLoginUrl(`${pathname}${search}`)),
    );
  }

  return finalize(NextResponse.next({ request }));
}

export const config = {
  matcher: [
    '/((?!_next/|api/healthz|favicon.ico|icon).*)',
  ],
};
