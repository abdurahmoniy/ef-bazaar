'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { clearOtherAccountQueries, PRIVATE_CACHE_GC_TIME_MS } from '@/lib/chat-cache';
import { usePresenceHeartbeat } from '@/hooks/use-chat-activity';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Per-browser memory only: private conversations are never written to storage. */
export function ClientQueryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS, retry: 1, refetchOnWindowFocus: true },
    },
  }));
  useIsomorphicLayoutEffect(() => {
    // Logout redirects to the public homepage, which has no identity shell.
    if (pathname === '/' || pathname.startsWith('/auth/')) clearOtherAccountQueries(client, null);
  }, [client, pathname]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Mounted by authenticated shells and by the signed-out marketplace shell. */
export function SessionCacheBoundary({ accountId }: { accountId: string | null }) {
  usePresenceHeartbeat(accountId);
  const client = useQueryClient();
  useIsomorphicLayoutEffect(() => {
    clearOtherAccountQueries(client, accountId);
  }, [accountId, client]);
  return null;
}
