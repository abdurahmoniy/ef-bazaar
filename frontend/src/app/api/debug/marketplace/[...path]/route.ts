import { proxyDebugMarketplaceRequest } from '@/lib/debug-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DebugMarketplaceRouteContext {
  params: Promise<{
    path?: string[];
  }>;
}

async function handle(request: Request, context: DebugMarketplaceRouteContext) {
  const { path = [] } = await context.params;
  return proxyDebugMarketplaceRequest(request, path);
}

export {
  handle as DELETE,
  handle as GET,
  handle as PATCH,
  handle as POST,
  handle as PUT,
};
