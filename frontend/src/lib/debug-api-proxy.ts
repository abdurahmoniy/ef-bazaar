import 'server-only';

import { cookies } from 'next/headers';

import { ACCESS_COOKIE_NAME } from './api';
import {
  buildInternalMarketplaceApiUrl,
  isDebugVisibleApiEnabled,
} from './debug-visible-api';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function responseHeadersFrom(upstream: Response) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Debug-Proxy': 'marketplace',
  });
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  return headers;
}

export async function proxyDebugMarketplaceRequest(request: Request, path: string[]) {
  if (!isDebugVisibleApiEnabled()) {
    return jsonResponse(
      {
        status: 404,
        error: 'debug_api_disabled',
        message: 'Debug API proxy is disabled',
      },
      404,
    );
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return jsonResponse(
      {
        status: 405,
        error: 'method_not_allowed',
        message: 'Method not allowed',
      },
      405,
    );
  }

  let upstreamUrl: string;
  try {
    upstreamUrl = buildInternalMarketplaceApiUrl(path, new URL(request.url).search);
  } catch {
    return jsonResponse(
      {
        status: 400,
        error: 'invalid_debug_api_path',
        message: 'Invalid API path',
      },
      400,
    );
  }

  const headers = new Headers({
    Accept: request.headers.get('accept') || 'application/json',
  });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  const token = (await cookies()).get(ACCESS_COOKIE_NAME)?.value;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeadersFrom(upstream),
    });
  } catch {
    return jsonResponse(
      {
        status: 502,
        error: 'debug_api_bad_gateway',
        message: 'Debug API proxy failed',
      },
      502,
    );
  }
}
