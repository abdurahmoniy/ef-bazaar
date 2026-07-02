import { NextResponse, type NextRequest } from 'next/server';

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

function hasSession(request: NextRequest) {
  return request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);
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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = hasSession(request);

  if (isProtectedPath(pathname) && !session) {
    const login = request.nextUrl.clone();
    login.pathname = '/auth/login';
    login.search = '';
    const from = `${pathname}${search}`;
    login.searchParams.set('from', from);
    return applySecurityHeaders(NextResponse.redirect(login));
  }

  if (isAuthOnlyLoggedOutPath(pathname) && session) {
    const marketplace = request.nextUrl.clone();
    marketplace.pathname = '/marketplace';
    marketplace.search = '';
    return applySecurityHeaders(NextResponse.redirect(marketplace));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/|api/healthz|robots.txt|sitemap.xml|manifest.webmanifest|favicon.ico|icon|apple-icon|opengraph-image|twitter-image).*)',
  ],
};
