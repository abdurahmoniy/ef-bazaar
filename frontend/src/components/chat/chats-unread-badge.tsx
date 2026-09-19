'use client';

import { useQuery } from '@tanstack/react-query';

import { chatUnreadOptions } from '@/lib/chat-cache';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 30_000;

/**
 * Small red counter of unread chat messages, rendered on top of the Chatlar
 * nav icon (mobile bottom nav + desktop top-bar button). Polls the aggregate
 * endpoint, shares requests between nav instances, and hides itself at zero.
 * Signed-out shells remove it and clear the account’s private query cache.
 */
export function ChatsUnreadBadge({ viewerId, className }: { viewerId: string; className?: string }) {
  const { data: count = 0 } = useQuery({
    ...chatUnreadOptions(viewerId),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

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
