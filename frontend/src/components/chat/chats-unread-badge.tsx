'use client';

import { useEffect, useState } from 'react';

import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 30_000;

/**
 * Small red counter of unread chat messages, rendered on top of the Chatlar
 * nav icon (mobile bottom nav + desktop top-bar button). Polls the aggregate
 * endpoint; hides itself at zero or when signed out (401 → null).
 */
export function ChatsUnreadBadge({ className }: { className?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(buildMarketplaceApiPath(['v1', 'chats', 'unread-total']), {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { count?: number };
        if (!cancelled && typeof payload.count === 'number') setCount(payload.count);
      } catch {
        // keep the last known value
      }
    };
    tick();
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span
      className={cn(
        'absolute -right-1.5 -top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9.5px] font-bold leading-4 text-destructive-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
