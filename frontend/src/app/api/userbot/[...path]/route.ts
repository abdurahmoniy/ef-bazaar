import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERNAL_BASE = (process.env.INTERNAL_API_BASE_URL || 'http://nginx:8080/api').replace(/\/+$/, '');
const ACCESS_COOKIE = 'access_token';

/**
 * Same-origin proxy for userbot-core. Browsers call
 * `/api/userbot/v1/accounts`; this handler forwards to internal nginx
 * (`nginx:8080/api/userbot/...`), which strips `/userbot/` and hits
 * userbot-core at `/api/v1/accounts`.
 *
 * A copy of `/api/payment/[...path]/route.ts` — same reasoning:
 * same-origin requests show up as normal `/api/*` in DevTools, and the
 * httpOnly access_token cookie travels without CORS gymnastics.
 */

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

async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const segments = path.filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === '..' || s === '.' || s.includes('/'))) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }
  const targetPath = segments.map(encodeURIComponent).join('/');
  const query = request.nextUrl.search;
  const upstreamUrl = `${INTERNAL_BASE}/userbot/${targetPath}${query}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.delete('x-forwarded-proto');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-port');
  headers.delete('x-real-ip');

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const isBodyless = request.method === 'GET' || request.method === 'HEAD';
  const body = isBodyless ? undefined : request.body;
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'manual',
  };
  if (body) init.duplex = 'half';

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, init);
  } catch (error) {
    console.error(`[api-proxy] ${request.method} ${upstreamUrl} → network error:`, error);
    return NextResponse.json(
      {
        status: 502,
        error: 'bad_gateway',
        message: 'Userbot API unreachable',
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
