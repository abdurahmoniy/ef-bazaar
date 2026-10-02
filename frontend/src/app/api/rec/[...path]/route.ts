import { type NextRequest } from 'next/server';

import { proxyInternalApiRequest } from '@/lib/internal-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy for recommendation-service. Browsers call `/api/rec/v1/...`;
 * internal nginx (`nginx:8080/api/rec/...`) strips `/rec/`, verifies the token
 * and injects X-User-* headers. Same shape as `/api/trade/[...path]/route.ts`.
 */
async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyInternalApiRequest(request, context, {
    servicePrefix: 'rec',
    serviceName: 'Recommendation',
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
