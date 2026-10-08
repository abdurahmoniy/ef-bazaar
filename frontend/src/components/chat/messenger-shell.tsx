'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { SessionCacheBoundary } from '@/components/providers/client-query-provider';
import { chatInboxOptions, chatKeys } from '@/lib/chat-cache';

import { ChatsListPane } from '@/components/chat/chats-list-pane';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { useChatBottomInset } from '@/hooks/use-chat-bottom-inset';
import { useChatViewport } from '@/hooks/use-chat-viewport';
import type { ChatResponse } from '@/lib/marketplace-types';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MessengerShellProps {
  chats: ChatResponse[];
  initialFetchedAt: number;
  user: User;
  children: ReactNode;
}

/**
 * Telegram-style chats shell.
 *
 * <p>Mobile: renders exactly one pane at a time — the list on `/chats`, or the
 * open chat on `/chats/[id]`. The inbox keeps the shared bottom navigation;
 * a conversation uses the full viewport with its own header and composer.
 *
 * <p>Desktop (md+): renders both panes as a two-column grid. The list is
 * always on the left, keeping selection visible while the user reads a chat.
 * On the list-only route (`/chats`) the right pane shows a placeholder.
 */
export function MessengerShell({ chats: initialChats, initialFetchedAt, user, children }: MessengerShellProps) {
  const queryClient = useQueryClient();
  const { data: chats } = useQuery({
    ...chatInboxOptions(user.id),
    initialData: initialChats,
    initialDataUpdatedAt: initialFetchedAt,
  });
  useEffect(() => {
    const key = chatKeys.inbox(user.id);
    if (initialFetchedAt > (queryClient.getQueryState(key)?.dataUpdatedAt ?? 0)) {
      queryClient.setQueryData(key, initialChats, { updatedAt: initialFetchedAt });
    }
  }, [initialChats, initialFetchedAt, queryClient, user.id]);
  const pathname = usePathname();
  const openChatId = pathname?.startsWith('/chats/') ? pathname.slice('/chats/'.length) : null;
  const isChatOpen = Boolean(openChatId);
  const viewport = useChatViewport();
  const bottomInset = useChatBottomInset(viewport);

  return (
    <div
      className="fixed inset-x-0 top-0 flex h-[var(--tg-viewport-height,100dvh)] bg-background pl-[var(--app-content-safe-left)] pr-[var(--app-content-safe-right)] md:grid md:grid-cols-[340px,1fr] lg:grid-cols-[360px,1fr]"
      style={viewport ? {
        ...(bottomInset !== null ? { '--chat-safe-bottom': `${bottomInset}px` } : {}),
        top: viewport.offsetTop,
        height: `min(${viewport.height}px, var(--tg-viewport-height, 100dvh))`,
      } as CSSProperties : undefined}
    >
      <SessionCacheBoundary accountId={user.id} />
      <aside
        className={cn(
          // NOT overflow-hidden: the notification dropdown must escape the
          // list pane; scrolling lives on the list inside ChatsListPane.
          'relative z-30 flex h-full min-h-0 flex-col border-border md:border-r',
          isChatOpen ? 'hidden md:flex' : 'flex w-full',
        )}
      >
        <div data-page-transition={!isChatOpen ? '' : undefined} className="flex min-h-0 flex-1 flex-col">
          <ChatsListPane chats={chats} viewerId={user.id} />
        </div>
        {!isChatOpen && <MobileBottomNav user={user} activeTab="chats" placement="inline" />}
      </aside>

      <main
        data-page-transition={isChatOpen ? '' : undefined}
        className={cn(
          'flex h-full min-h-0 flex-col overflow-hidden',
          isChatOpen ? 'flex w-full' : 'hidden md:flex',
        )}
      >
        {isChatOpen ? children : <EmptyRightPane />}
      </main>
    </div>
  );
}

function EmptyRightPane() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-bold text-foreground">Chatni tanlang</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Chapdagi ro'yxatdan bittasini oching.
        </p>
      </div>
    </div>
  );
}
