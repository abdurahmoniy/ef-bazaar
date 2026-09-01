'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { ChatsListPane } from '@/components/chat/chats-list-pane';
import type { ChatResponse } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface MessengerShellProps {
  chats: ChatResponse[];
  viewerId: string;
  children: ReactNode;
}

/**
 * Telegram-style chats shell.
 *
 * <p>Mobile: renders exactly one pane at a time — the list on `/chats`, or the
 * open chat on `/chats/[id]`. No marketplace top bar / bottom nav — the child
 * page is responsible for its own header (typically a back arrow + partner
 * name). Wraps everything in a full-viewport container.
 *
 * <p>Desktop (md+): renders both panes as a two-column grid. The list is
 * always on the left, keeping selection visible while the user reads a chat.
 * On the list-only route (`/chats`) the right pane shows a placeholder.
 */
export function MessengerShell({ chats, viewerId, children }: MessengerShellProps) {
  const pathname = usePathname();
  const openChatId = pathname?.startsWith('/chats/') ? pathname.slice('/chats/'.length) : null;
  const isChatOpen = Boolean(openChatId);

  return (
    <div className="fixed inset-0 flex bg-background md:grid md:grid-cols-[320px,1fr]">
      <aside
        className={cn(
          // NOT overflow-hidden: the notification dropdown must escape the
          // 320px pane; scrolling lives on the list inside ChatsListPane.
          'relative z-30 flex h-full min-h-0 flex-col border-border md:border-r',
          isChatOpen ? 'hidden md:flex' : 'flex w-full',
        )}
      >
        <ChatsListPane chats={chats} viewerId={viewerId} />
      </aside>

      <main
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
