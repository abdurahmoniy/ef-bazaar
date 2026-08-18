import { type NextRequest, NextResponse } from 'next/server';

import { getAuthCookieClearOptions, getAuthCookieOptions } from './auth-cookies';
import { refreshSession, type RefreshedTokens } from './session-refresh';

const INTERNAL_BASE = (process.env.INTERNAL_API_BASE_URL || 'http://nginx:8080/api').replace(/\/+$/, '');
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const MAX_PROXY_BODY_BYTES = 1_000_000;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  // undici's fetch handles decoding + framing itself; forwarding these breaks it.
  'content-encoding',
  'content-length',
  'host',
]);

interface InternalApiProxyOptions {
  servicePrefix: string;
  serviceName: string;
}

function normalizePath(path: string[]) {
  const segments = path.filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === '..' || s === '.' || s.includes('/'))) {
    return null;
  }
  return segments.map(encodeURIComponent).join('/');
}

function buildHeaders(request: NextRequest, accessToken?: string) {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.delete('authorization');
  headers.delete('cookie');
  headers.delete('x-forwarded-proto');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-port');
  headers.delete('x-real-ip');

  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}

function applyRefreshedCookies(response: NextResponse, tokens: RefreshedTokens) {
  const cookieOpts = getAuthCookieOptions();
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieOpts,
    maxAge: tokens.accessExpiresInSeconds,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieOpts,
    maxAge: tokens.refreshExpiresInSeconds,
  });
}

function clearAuthCookies(response: NextResponse) {
  for (const cookieOpts of getAuthCookieClearOptions()) {
    response.cookies.set(ACCESS_COOKIE, '', cookieOpts);
    response.cookies.set(REFRESH_COOKIE, '', cookieOpts);
  }
}

function jsonError(status: number, error: string, message: string, tokens?: RefreshedTokens) {
  const response = NextResponse.json({ status, error, message }, { status });
  if (tokens) applyRefreshedCookies(response, tokens);
  return response;
}

export async function proxyInternalApiRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  options: InternalApiProxyOptions,
) {
  const { path } = await context.params;
  const targetPath = normalizePath(path);
  if (!targetPath) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }

  const query = request.nextUrl.search;
  const upstreamUrl = `${INTERNAL_BASE}/${options.servicePrefix}/${targetPath}${query}`;
  const isBodyless = request.method === 'GET' || request.method === 'HEAD';
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!isBodyless && contentLength > MAX_PROXY_BODY_BYTES) {
    return jsonError(413, 'payload_too_large', `${options.serviceName} API request body is too large`);
  }

  const body = isBodyless ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > MAX_PROXY_BODY_BYTES) {
    return jsonError(413, 'payload_too_large', `${options.serviceName} API request body is too large`);
  }

  const send = (accessToken?: string) =>
    fetch(upstreamUrl, {
      method: request.method,
      headers: buildHeaders(request, accessToken),
      body: body ? body.slice(0) : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

  let upstreamResponse: Response;
  let refreshedTokens: RefreshedTokens | null = null;
  let clearCookies = false;
  try {
    upstreamResponse = await send(request.cookies.get(ACCESS_COOKIE)?.value);
  } catch (error) {
    console.error(`[api-proxy] ${request.method} ${upstreamUrl} -> network error:`, error);
    return jsonError(502, 'bad_gateway', `${options.serviceName} API unreachable`);
  }

  if (upstreamResponse.status === 401) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      const result = await refreshSession(refreshToken);
      if (result.ok) {
        refreshedTokens = result.tokens;
        await upstreamResponse.body?.cancel().catch(() => undefined);
        try {
          upstreamResponse = await send(result.tokens.accessToken);
        } catch (error) {
          console.error(`[api-proxy] ${request.method} ${upstreamUrl} -> network error:`, error);
          return jsonError(502, 'bad_gateway', `${options.serviceName} API unreachable`, result.tokens);
        }
      } else if (result.definitive) {
        clearCookies = true;
      }
    }
  }

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  const response = new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });

  if (refreshedTokens) {
    applyRefreshedCookies(response, refreshedTokens);
  } else if (clearCookies) {
    clearAuthCookies(response);
  }

  return response;
}
