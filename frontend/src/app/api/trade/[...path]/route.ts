import { type NextRequest } from 'next/server';

import { proxyInternalApiRequest } from '@/lib/internal-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy for the trade-service. Browsers call
 * `/api/trade/v1/trades/...`; this handler forwards to internal nginx
 * (`nginx:8080/api/trade/...`), which strips `/trade/` and hits
 * trade-service at `/api/v1/...`.
 *
 * Mirrors `/api/marketplace/[...path]/route.ts` — same reasoning: same-origin
 * requests show up as normal `/api/*` in DevTools, and the httpOnly
 * access_token cookie travels without CORS gymnastics.
 */

async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyInternalApiRequest(request, context, {
    servicePrefix: 'trade',
    serviceName: 'Trade',
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
