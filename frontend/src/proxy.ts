import { NextResponse, type NextRequest } from 'next/server';

import { getAuthCookieClearOptions, getAuthCookieOptions } from './lib/auth-cookies';
import { refreshSession, type RefreshedTokens } from './lib/session-refresh';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

const PROTECTED_PREFIXES = [
  '/marketplace/new',
  '/profile',
  '/favorites',
  '/chats',
  '/listings',
] as const;

const AUTH_ONLY_LOGGED_OUT_PREFIXES = ['/auth/login'] as const;

function isProtectedPath(pathname: string) {
  if (PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  return /^\/marketplace\/[^/]+\/edit$/.test(pathname);
}

function isAuthOnlyLoggedOutPath(pathname: string) {
  return AUTH_ONLY_LOGGED_OUT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

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
 * Session holati: access token bor-yo'qligiga qarab aniqlanadi.
 *
 * Access cookie 15 daqiqada o'chadi, refresh cookie 30 kun yashaydi. Faqat
 * refresh qolgan bo'lsa shu yerda yangi juftlik olamiz — aks holda user
 * "yarim-login" holatda qoladi: himoyalangan sahifalar 401 sabab login'ga
 * redirect qiladi, login sahifasi esa "session bor" deb marketplace'ga qaytarib
 * yuboradi va user hech qayerga kira olmaydi.
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
    // Shu request'ni bajaradigan Server Component / Route Handler'lar ham yangi
    // access tokenni ko'rsin — NextResponse.next({ request }) mutatsiyani oladi.
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

  if (isProtectedPath(pathname) && !hasSession) {
    const login = request.nextUrl.clone();
    login.pathname = '/auth/login';
    login.search = '';
    const from = `${pathname}${search}`;
    login.searchParams.set('from', from);
    return finalize(NextResponse.redirect(login));
  }

  if (isAuthOnlyLoggedOutPath(pathname) && hasSession) {
    const marketplace = request.nextUrl.clone();
    marketplace.pathname = '/marketplace';
    marketplace.search = '';
    return finalize(NextResponse.redirect(marketplace));
  }

  return finalize(NextResponse.next({ request }));
}

export const config = {
  matcher: [
    '/((?!_next/|api/healthz|robots.txt|sitemap.xml|manifest.webmanifest|favicon.ico|icon|apple-icon|opengraph-image|twitter-image).*)',
  ],
};
