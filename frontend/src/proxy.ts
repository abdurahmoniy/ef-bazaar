import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_REQUIRED_PATH } from './lib/access-requirements';
import { getAuthCookieClearOptions, getAuthCookieOptions } from './lib/auth-cookies';
import { rewriteCookieHeader } from './lib/proxy-refresh-cookies';
import { readCodeFromSearch, REFERRAL_COOKIE } from './lib/referral-capture';
import { isSafeInternalPath } from './lib/safe-redirect';
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

/** 30 kun — odam havolani bosib, keyinroq qaytib ro'yxatdan o'tishi mumkin. */
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

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

/**
 * Rewrites the outgoing request's Cookie header with freshly refreshed tokens.
 *
 * Setting them on the response only tells the BROWSER, and only in time for
 * the next request. The one in flight still carries the expired (or absent)
 * access cookie, so whatever handles it downstream — an API proxy route, a
 * Server Component — finds no token, sends no Authorization header, and the
 * upstream answers 401. That is what made the 401s intermittent: exactly one
 * per expiry, on whatever the user happened to click first.
 */
function withRefreshedCookies(request: NextRequest, tokens: RefreshedTokens): Headers {
  const headers = new Headers(request.headers);
  headers.set('cookie', rewriteCookieHeader(request.cookies.getAll(), tokens));
  return headers;
}

/**
 * Taklif kodini cookie'ga yozadi.
 *
 * NEGA SHU YERDA. Bu qatlam marshrutlashdan oldin ishlaydi va quyidagi
 * redirect'lardan ham oldin — jumladan shu fayldagi "himoyalangan
 * sahifa → login" yo'naltirishidan, u yasaydigan `?from=` esa so'rov
 * satrini tashlab yuboradi. React komponentida qilingan bo'lsa
 * yo'qolardi: server komponentidagi `redirect()` layout chizilishidan
 * oldin otadi, ya'ni komponent umuman mount bo'lmaydi.
 *
 * `?ref=` — sayt havolasi, `?p=` — kanaldagi e'lon posti. Ikkalasi bir
 * xil kodni olib yuradi va oxirgi bosilgani g'olib.
 */
function applyReferralCode(request: NextRequest, response: NextResponse) {
  const code = readCodeFromSearch(request.nextUrl.search);
  if (!code) return response;

  response.cookies.set(REFERRAL_COOKIE, code, {
    // httpOnly EMAS: ro'yxatdan o'tgach uni brauzerdagi kod o'qib da'vo
    // yuboradi. Bu sir emas — kod havolada ochiq turadi.
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: REFERRAL_COOKIE_MAX_AGE,
  });
  return response;
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
  accessRequired: boolean;
}> {
  if (request.cookies.has(ACCESS_COOKIE)) {
    return { hasSession: true, refreshed: null, clearCookies: false, accessRequired: false };
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return { hasSession: false, refreshed: null, clearCookies: false, accessRequired: false };
  }

  const result = await refreshSession(refreshToken);
  if (result.ok) {
    return { hasSession: true, refreshed: result.tokens, clearCookies: false, accessRequired: false };
  }
  return {
    hasSession: false,
    refreshed: null,
    clearCookies: result.definitive,
    accessRequired: result.accessRequired === true,
  };
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { hasSession, refreshed, clearCookies, accessRequired } = await resolveSession(request);

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
    return applySecurityHeaders(applyReferralCode(request, response));
  };

  // Token kirish shartlari sababli yangilanmadi — sahifa so'rovi shartlar
  // ekraniga boradi. API so'rovlari redirect qilinmaydi (fetch uni kutmaydi),
  // ular faqat cookie tozalanishini oladi.
  if (accessRequired && !pathname.startsWith('/api/') && !pathname.startsWith(ACCESS_REQUIRED_PATH)) {
    const target = request.nextUrl.clone();
    target.pathname = ACCESS_REQUIRED_PATH;
    target.search = '';
    target.searchParams.set('from', `${pathname}${search}`);
    return finalize(NextResponse.redirect(target));
  }

  // Keep / public and indexable for anonymous visitors, including crawlers.
  // This is a session-specific navigation choice, never a permanent site move.
  if (pathname === '/' && hasSession && (request.method === 'GET' || request.method === 'HEAD')) {
    const marketplace = request.nextUrl.clone();
    marketplace.pathname = '/marketplace';
    const response = NextResponse.redirect(marketplace, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    return finalize(response);
  }

  if (isProtectedPath(pathname) && !hasSession) {
    const login = request.nextUrl.clone();
    login.pathname = '/auth/login';
    login.search = '';
    const from = `${pathname}${search}`;
    login.searchParams.set('from', from);
    return finalize(NextResponse.redirect(login));
  }

  if (isAuthOnlyLoggedOutPath(pathname) && hasSession) {
    // `from=` bilan kelgan (masalan mail.efbazaar.uz dan) allaqachon login
    // bo'lgan user login sahifasiga emas — to'g'ridan-to'g'ri manzilga.
    // isSafeInternalPath faqat shu saytning ichki path'ini o'tkazadi, shuning
    // uchun redirect har doim same-origin bo'ladi.
    const from = request.nextUrl.searchParams.get('from');
    if (from && isSafeInternalPath(from)) {
      return finalize(NextResponse.redirect(new URL(from, request.url)));
    }
    const marketplace = request.nextUrl.clone();
    marketplace.pathname = '/marketplace';
    marketplace.search = '';
    return finalize(NextResponse.redirect(marketplace));
  }

  return finalize(
    refreshed
      ? NextResponse.next({ request: { headers: withRefreshedCookies(request, refreshed) } })
      : NextResponse.next({ request }),
  );
}

export const config = {
  matcher: [
    '/((?!_next/|api/healthz|robots.txt|sitemap.xml|manifest.webmanifest|favicon.ico|icon|apple-icon|opengraph-image|twitter-image).*)',
  ],
};
